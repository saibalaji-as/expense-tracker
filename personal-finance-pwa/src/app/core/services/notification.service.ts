import { Injectable, Signal, inject, signal } from '@angular/core';
import { FcmService } from './fcm.service';
import { StorageService } from './storage.service';

// Storage keys
const LS_ENABLED = 'pf_notif_enabled';
const LS_USER_ID = 'pf_user_id';

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

  constructor() {
    this.permissionState = this._permissionState.asReadonly();
    this.isEnabled = this._isEnabled.asReadonly();

    // Restore persisted state on init (no backend call)
    this.#init();
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  async requestPermission(): Promise<void> {
    if (this._permissionState() === 'granted') return;

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

  async enable(): Promise<void> {
    if (this._permissionState() !== 'granted') {
      await this.requestPermission();
    }
    if (this._permissionState() !== 'granted') return;

    const userId = await this.#getUserId();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const registered = await this.fcmService.registerForNotifications(userId, timezone);

    if (!registered) {
      console.warn('FCM registration failed — notifications remain disabled');
      return;
    }

    this._isEnabled.set(true);
    await this.#persistEnabled(true);
  }

  async disable(): Promise<void> {
    const userId = await this.#getUserId();
    await this.fcmService.unregister(userId);

    this._isEnabled.set(false);
    await this.#persistEnabled(false);
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
