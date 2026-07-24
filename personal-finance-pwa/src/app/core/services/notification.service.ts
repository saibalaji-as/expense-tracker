import { Injectable, Signal, inject, signal, isDevMode } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FcmService } from './fcm.service';
import { StorageService } from './storage.service';
import { SyncDiagnosticsService } from './sync-diagnostics.service';

// Storage keys
const LS_ENABLED = 'pf_notif_enabled';
const LS_USER_ID = 'pf_user_id';
/** Written by Java `MyFirebaseMessagingService.onNewToken` (CapacitorStorage prefs) when FCM rotates the token. */
const LS_PENDING_FCM_TOKEN = 'spenza_fcm_pending_token_v1';
/** Timestamp of the last successful backend token registration from this device. */
const LS_LAST_FCM_REGISTRATION = 'pf_fcm_last_registration_v1';
/** BackupModeService cache key — family mode needs a registered token for widget two-way sync. */
const LS_BACKUP_MODE = 'spenza_backup_mode';
/** Re-register at most this often when nothing is dirty (heals server-side drift). */
const FCM_REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  // ─── Public signals ───────────────────────────────────────────────────────────

  readonly permissionState: Signal<NotificationPermission>;
  readonly isEnabled: Signal<boolean>;

  private readonly _permissionState = signal<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  private readonly _isEnabled = signal<boolean>(false);

  private readonly fcmService = inject(FcmService);
  private readonly storageService = inject(StorageService);
  private readonly syncDiagnostics = inject(SyncDiagnosticsService);

  constructor() {
    this.permissionState = this._permissionState.asReadonly();
    this.isEnabled = this._isEnabled.asReadonly();

    // Restore persisted state on init (no backend call)
    this.#init();
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  async requestPermission(): Promise<void> {
    if (this._permissionState() === 'granted') return;

    // On native platforms, permission is handled by FCM service
    if (Capacitor.isNativePlatform()) {
      if (isDevMode()) { console.log('[NotificationService] Native platform - permission handled by FCM'); }
      this._permissionState.set('granted');
      return;
    }

    // Web platform: use browser Notification API
    if (typeof Notification === 'undefined') {
      this._permissionState.set('denied');
      return;
    }

    try {
      const result = await Notification.requestPermission();
      this._permissionState.set(result);
      if (result !== 'granted') {
        this._isEnabled.set(false);
        await this.#persistEnabled(false);
      }
    } catch {
      this._permissionState.set('denied');
      this._isEnabled.set(false);
      await this.#persistEnabled(false);
    }
  }

  async enable(reminderPreferences?: {
    dailyReminderEnabled: boolean;
    reminderHour: number;
    reminderMinute: number;
  }): Promise<boolean> {
    // On native platforms, skip browser permission check
    if (!Capacitor.isNativePlatform()) {
      if (this._permissionState() !== 'granted') {
        await this.requestPermission();
      }
      if (this._permissionState() !== 'granted') return false;
    }

    const userId = await this.#getUserId();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    this._isEnabled.set(true);

    // Register with FCM and backend
    const registered = await this.fcmService.registerForNotifications(userId, timezone, reminderPreferences);

    if (!registered) {
      this._isEnabled.set(false);
      if (isDevMode()) { console.warn('[NotificationService] FCM registration failed — notifications remain disabled'); }
      return false;
    }

    await this.#persistEnabled(true);
    // Interactive registration also satisfies the startup token-freshness check.
    await this.storageService.set(LS_LAST_FCM_REGISTRATION, JSON.stringify({ at: Date.now() }));
    await this.storageService.remove(LS_PENDING_FCM_TOKEN);
    if (isDevMode()) { console.log('[NotificationService] Push notifications enabled'); }
    return true;
  }

  /**
   * Ensure this web device has an FCM token registered with the backend so the
   * server-side reminder scheduler (`sendDueReminders`) can deliver date/time
   * reminders even when no tab is open — WITHOUT opting the device into the
   * recurring daily/hourly nudge scheduler (`tokenOnly`).
   *
   * No-op on native (native uses local OS notifications for datetime reminders).
   * Returns false if web push isn't available or permission isn't granted.
   */
  async ensurePushRegistered(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) return true;
    if (typeof Notification === 'undefined') return false;

    if (Notification.permission !== 'granted') {
      await this.requestPermission();
      if (this._permissionState() !== 'granted') return false;
    }

    const userId = await this.#getUserId();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return this.fcmService.registerForNotifications(userId, timezone, undefined, { tokenOnly: true });
  }

  /**
   * NATIVE startup healing for the FCM token registry (fire-and-forget).
   *
   * `notifyPartnerLedgerWrite` (family widget two-way sync) looks up this
   * device's token in `users/{userId}` — but registration historically only
   * happened from the Settings notifications toggle, and `onNewToken`
   * rotations were dropped on the floor. Result: owner→partner widget pushes
   * silently stopped. This re-registers when:
   *  - Java flagged a rotated token (`spenza_fcm_pending_token_v1`), or
   *  - notifications are enabled OR the device is in family mode, and the
   *    last successful registration is missing/older than 7 days.
   *
   * Never prompts (silent refresh skips when permission isn't granted) and
   * never opts the device into the reminder scheduler (`tokenOnly`).
   * Failures (e.g. Firebase auth not yet minted on cold start) are ignored —
   * the missing success marker means the next launch retries.
   */
  async ensureNativeTokenFresh(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const rotatedToken = await this.storageService.get(LS_PENDING_FCM_TOKEN);
      const enabled = (await this.storageService.get(LS_ENABLED)) === 'true';
      const familyMode = (await this.storageService.get(LS_BACKUP_MODE)) === 'family';
      if (!rotatedToken && !enabled && !familyMode) return;

      if (!rotatedToken) {
        const lastRaw = await this.storageService.get(LS_LAST_FCM_REGISTRATION);
        const lastAt = lastRaw ? Number(JSON.parse(lastRaw)?.at) : NaN;
        if (Number.isFinite(lastAt) && Date.now() - lastAt < FCM_REFRESH_MAX_AGE_MS) return;
      }

      const userId = await this.#getUserId();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const ok = await this.fcmService.silentNativeTokenRefresh(userId, timezone);
      // Route the outcome into the on-device Settings sync log — FCM registry
      // health is otherwise invisible without adb, and a silent failure here is
      // exactly what breaks owner→partner widget push.
      this.syncDiagnostics.record({
        operation: 'fcm.tokenRefresh',
        status: ok ? 200 : 0,
        attempt: 1,
        willRetry: !ok,
        message: ok
          ? `FCM token registered (trigger: ${rotatedToken ? 'rotation' : 'staleness'})`
          : 'FCM token registration FAILED — partner widget push will not work from the other device',
        at: new Date().toISOString(),
      });
      if (ok) {
        await this.storageService.set(LS_LAST_FCM_REGISTRATION, JSON.stringify({ at: Date.now() }));
        await this.storageService.remove(LS_PENDING_FCM_TOKEN);
        if (isDevMode()) { console.log('[NotificationService] Native FCM registration refreshed'); }
      }
    } catch (error) {
      console.warn('[NotificationService] ensureNativeTokenFresh failed:', error);
    }
  }

  async syncDailyReminder(enabled: boolean, reminderHour: number, reminderMinute: number): Promise<boolean> {
    if (!enabled) {
      if (this._isEnabled()) {
        return this.enable({ dailyReminderEnabled: false, reminderHour, reminderMinute });
      }
      return true;
    }

    return this.enable({
      dailyReminderEnabled: true,
      reminderHour,
      reminderMinute,
    });
  }

  async disable(): Promise<void> {
    const userId = await this.#getUserId();

    this._isEnabled.set(false);

    try {
      // Unregister from FCM and backend
      await this.fcmService.unregister(userId);
      await this.#persistEnabled(false);
      await this.storageService.remove(LS_LAST_FCM_REGISTRATION);
      if (isDevMode()) { console.log('[NotificationService] Push notifications disabled'); }
    } catch (error) {
      this._isEnabled.set(true);
      throw error;
    }
  }

  // ─── Initialisation ───────────────────────────────────────────────────────────

  async #init(): Promise<void> {
    // Only restore the enabled signal from storage — do not call backend
    const stored = await this.storageService.get(LS_ENABLED);
    this._isEnabled.set(stored === 'true');
  }

  // ─── Persistence helpers ──────────────────────────────────────────────────────

  async #persistEnabled(value: boolean): Promise<void> {
    if (value) {
      await this.storageService.set(LS_ENABLED, String(value));
    } else {
      await this.storageService.remove(LS_ENABLED);
    }
  }

  /**
   * Get or generate a stable user ID for FCM token management.
   */
  async #getUserId(): Promise<string> {
    let userId = await this.storageService.get(LS_USER_ID);
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await this.storageService.set(LS_USER_ID, userId);
    }
    return userId;
  }
}
