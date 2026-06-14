import { Injectable, inject, signal, computed, isDevMode } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { firebaseConfig } from '../config/firebase.config';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import type { Firestore, Unsubscribe } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';

export interface ReminderLocation {
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

export interface Reminder {
  id: string;
  title: string;
  type: 'datetime' | 'location';
  remindAt: Date | null;
  location: ReminderLocation | null;
  status: 'active' | 'completed' | 'expired';
  notifiedAt: Date | null;
  linkedExpenseId: string | null;
  createdAt: Date;
  /** Local notification id stored so we can cancel it on edit/delete */
  notificationId?: number;
}

interface FirestoreReminder {
  title: string;
  type: 'datetime' | 'location';
  remindAt: Timestamp | null;
  location: ReminderLocation | null;
  status: 'active' | 'completed' | 'expired';
  notifiedAt: Timestamp | null;
  linkedExpenseId: string | null;
  createdAt: Timestamp;
  notificationId?: number;
}

@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);

  /** Grace window before a fired-but-unconfirmed datetime reminder is locally expired.
   *  Gives the server scheduler (runs every minute) time to claim + deliver it. */
  static readonly EXPIRY_GRACE_MS = 3 * 60 * 1000;

  readonly reminders = signal<Reminder[]>([]);
  readonly activeReminders = computed(() => this.reminders().filter((r) => r.status === 'active'));

  #db: Firestore | null = null;
  #unsubscribe: Unsubscribe | null = null;
  #notificationPermissionGranted = false;
  #appResumeListener: (() => void) | null = null;

  async start(uid: string): Promise<void> {
    this.stop();
    const { getApps, initializeApp } = await import('firebase/app');
    const { getFirestore, collection, onSnapshot, orderBy, query } = await import('firebase/firestore');
    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    this.#db = getFirestore(app);

    const col = collection(this.#db, 'users', uid, 'reminders');
    const q = query(col, orderBy('createdAt', 'desc'));
    this.#unsubscribe = onSnapshot(q, (snap) => {
      const items: Reminder[] = snap.docs.map((doc) => {
        const d = doc.data() as FirestoreReminder;
        return {
          id: doc.id,
          title: d.title,
          type: d.type,
          remindAt: d.remindAt?.toDate?.() ?? null,
          location: d.location ?? null,
          status: d.status,
          notifiedAt: d.notifiedAt?.toDate?.() ?? null,
          linkedExpenseId: d.linkedExpenseId ?? null,
          createdAt: d.createdAt?.toDate?.() ?? new Date(),
          notificationId: d.notificationId,
        };
      });
      this.reminders.set(items);
      void this.markExpiredDatetimeReminders(uid, items);
    });

    this.#setupAppResumeListener();
  }

  stop(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#appResumeListener?.();
    this.#appResumeListener = null;
    this.reminders.set([]);
  }

  async createReminder(uid: string, data: Omit<Reminder, 'id' | 'createdAt' | 'notifiedAt' | 'status' | 'notificationId'>): Promise<string> {
    const { collection, addDoc, Timestamp: FsTimestamp } = await import('firebase/firestore');
    const db = await this.#getDb();
    const col = collection(db, 'users', uid, 'reminders');

    const docData: Omit<FirestoreReminder, 'notificationId'> = {
      title: data.title,
      type: data.type,
      remindAt: data.remindAt ? FsTimestamp.fromDate(data.remindAt) : null,
      location: data.location ?? null,
      status: 'active',
      notifiedAt: null,
      linkedExpenseId: data.linkedExpenseId ?? null,
      createdAt: FsTimestamp.now(),
    };

    const ref = await addDoc(col, docData);

    if (data.type === 'datetime' && data.remindAt) {
      await this.scheduleNotification(ref.id, uid, data.title, data.remindAt);
      await this.#ensureWebPushForDatetime();
    }

    return ref.id;
  }

  async updateReminder(uid: string, id: string, data: Partial<Pick<Reminder, 'title' | 'remindAt' | 'location' | 'type'>>): Promise<void> {
    const { doc, updateDoc, Timestamp: FsTimestamp } = await import('firebase/firestore');
    const db = await this.#getDb();
    const existing = this.reminders().find((r) => r.id === id);

    // Cancel old notification if present
    if (existing?.notificationId != null) {
      await this.#cancelNotification(existing.notificationId);
    }

    const update: Record<string, unknown> = {};
    if (data.title !== undefined) update['title'] = data.title;
    if (data.type !== undefined) update['type'] = data.type;
    if (data.remindAt !== undefined) update['remindAt'] = data.remindAt ? FsTimestamp.fromDate(data.remindAt) : null;
    if (data.location !== undefined) update['location'] = data.location ?? null;
    update['notificationId'] = null;

    await updateDoc(doc(db, 'users', uid, 'reminders', id), update);

    const newTitle = data.title ?? existing?.title ?? '';
    if ((data.type ?? existing?.type) === 'datetime' && data.remindAt) {
      await this.scheduleNotification(id, uid, newTitle, data.remindAt);
      await this.#ensureWebPushForDatetime();
    }
  }

  /**
   * On web, make sure this device has an FCM token registered so the server
   * scheduler can deliver the datetime reminder cross-device. Best-effort:
   * never blocks or fails the save (no-op on native, which uses local OS alarms).
   */
  async #ensureWebPushForDatetime(): Promise<void> {
    if (Capacitor.isNativePlatform()) return;
    try {
      await this.notificationService.ensurePushRegistered();
    } catch (e) {
      if (isDevMode()) console.warn('[ReminderService] Could not register web push token', e);
    }
  }

  async completeReminder(uid: string, id: string): Promise<void> {
    const existing = this.reminders().find((r) => r.id === id);
    if (existing?.notificationId != null) {
      await this.#cancelNotification(existing.notificationId);
    }
    const { doc, updateDoc } = await import('firebase/firestore');
    const db = await this.#getDb();
    await updateDoc(doc(db, 'users', uid, 'reminders', id), { status: 'completed', notificationId: null });
  }

  async deleteReminder(uid: string, id: string): Promise<void> {
    const existing = this.reminders().find((r) => r.id === id);
    if (existing?.notificationId != null) {
      await this.#cancelNotification(existing.notificationId);
    }
    const { doc, deleteDoc } = await import('firebase/firestore');
    const db = await this.#getDb();
    await deleteDoc(doc(db, 'users', uid, 'reminders', id));
  }

  /** Request notification permission lazily — called before first reminder creation. */
  async requestNotificationPermission(): Promise<boolean> {
    if (this.#notificationPermissionGranted) return true;
    if (!Capacitor.isNativePlatform()) {
      if (!('Notification' in window)) return false;
      const result = await Notification.requestPermission();
      this.#notificationPermissionGranted = result === 'granted';
      return this.#notificationPermissionGranted;
    }
    const { display } = await LocalNotifications.requestPermissions();
    this.#notificationPermissionGranted = display === 'granted';
    return this.#notificationPermissionGranted;
  }

  async scheduleNotification(reminderId: string, uid: string, title: string, at: Date): Promise<void> {
    if (at <= new Date()) return;

    const notifId = this.#generateNotifId(reminderId);

    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [{
          id: notifId,
          title: 'Spenza Reminder',
          body: title,
          schedule: { at },
          extra: { reminderId, uid },
          actionTypeId: 'REMINDER_TAP',
        }],
      });
    }

    // Persist notificationId to Firestore so edit/delete can cancel it
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await this.#getDb();
      await updateDoc(doc(db, 'users', uid, 'reminders', reminderId), { notificationId: notifId });
    } catch (e) {
      if (isDevMode()) console.warn('[ReminderService] Could not persist notificationId', e);
    }
  }

  /** Called on App resume — checks foreground location against active location reminders. */
  async checkLocationReminders(): Promise<void> {
    const locationReminders = this.activeReminders().filter(
      (r) => r.type === 'location' && r.location && r.notifiedAt === null
    );
    if (!locationReminders.length) return;

    let position: GeolocationPosition;
    try {
      position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 60000 });
      });
    } catch {
      return;
    }

    const uid = this.authService.firebaseUid();
    if (!uid) return;

    for (const reminder of locationReminders) {
      if (!reminder.location) continue;
      const dist = haversineKm(
        position.coords.latitude,
        position.coords.longitude,
        reminder.location.lat,
        reminder.location.lng
      );
      if (dist <= reminder.location.radiusKm) {
        await this.#fireLocationNotification(uid, reminder);
      }
    }
  }

  async #fireLocationNotification(uid: string, reminder: Reminder): Promise<void> {
    const notifId = this.#generateNotifId(reminder.id);
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [{
          id: notifId,
          title: 'Spenza Reminder',
          body: reminder.title,
          extra: { reminderId: reminder.id, uid },
          actionTypeId: 'REMINDER_TAP',
        }],
      });
    }

    // Mark notifiedAt to prevent re-firing on next resume
    try {
      const { doc, updateDoc, Timestamp: FsTimestamp } = await import('firebase/firestore');
      const db = await this.#getDb();
      await updateDoc(doc(db, 'users', uid, 'reminders', reminder.id), {
        notifiedAt: FsTimestamp.now(),
      });
    } catch (e) {
      if (isDevMode()) console.warn('[ReminderService] Could not set notifiedAt', e);
    }
  }

  /** Mark datetime reminders as expired if remindAt is past and was never notified (web case). */
  async markExpiredDatetimeReminders(uid: string, items: Reminder[]): Promise<void> {
    const cutoff = new Date(Date.now() - ReminderService.EXPIRY_GRACE_MS);
    const expired = items.filter(
      (r) => r.type === 'datetime' && r.status === 'active' && r.remindAt && r.remindAt < cutoff && r.notifiedAt === null
    );
    if (!expired.length) return;
    const { doc, writeBatch } = await import('firebase/firestore');
    const db = await this.#getDb();
    const batch = writeBatch(db);
    for (const r of expired) {
      batch.update(doc(db, 'users', uid, 'reminders', r.id), { status: 'expired' });
    }
    await batch.commit();
  }

  #setupAppResumeListener(): void {
    if (!Capacitor.isNativePlatform()) return;
    const listener = App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
      if (isActive) void this.checkLocationReminders();
    });
    this.#appResumeListener = () => listener.then((h: { remove: () => void }) => h.remove());
  }

  async #cancelNotification(notifId: number): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await LocalNotifications.cancel({ notifications: [{ id: notifId }] });
    } catch { /* ignore */ }
  }

  #generateNotifId(reminderId: string): number {
    // Stable numeric id from reminder id string
    let hash = 0;
    for (let i = 0; i < reminderId.length; i++) {
      hash = (Math.imul(31, hash) + reminderId.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 2147483647;
  }

  async #getDb(): Promise<Firestore> {
    if (this.#db) return this.#db;
    const { getApps, initializeApp } = await import('firebase/app');
    const { getFirestore } = await import('firebase/firestore');
    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    this.#db = getFirestore(app);
    return this.#db;
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
