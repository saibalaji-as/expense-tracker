import { Injectable, Signal, inject, signal } from '@angular/core';
import { FcmService } from './fcm.service';

// localStorage keys
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
        this.#persistEnabled(false);
      }
    } catch {
      this._permissionState.set('denied');
      this._isEnabled.set(false);
      this.#persistEnabled(false);
    }
  }

  async enable(): Promise<void> {
    if (this._permissionState() !== 'granted') {
      await this.requestPermission();
    }
    if (this._permissionState() !== 'granted') return;

    const userId = this.#getUserId();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const registered = await this.fcmService.registerForNotifications(userId, timezone);

    if (!registered) {
      console.warn('FCM registration failed — notifications remain disabled');
      return;
    }

    this._isEnabled.set(true);
    this.#persistEnabled(true);
  }

  async disable(): Promise<void> {
    const userId = this.#getUserId();
    await this.fcmService.unregister(userId);

    this._isEnabled.set(false);
    this.#persistEnabled(false);
  }

  // ─── Initialisation ───────────────────────────────────────────────────────────

  #init(): void {
    // Only restore the enabled signal from localStorage — do not call backend
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(LS_ENABLED);
      this._isEnabled.set(stored === 'true');
    }
  }

  // ─── Persistence helpers ──────────────────────────────────────────────────────

  #persistEnabled(value: boolean): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_ENABLED, String(value));
    }
  }

  /**
   * Get or generate a stable user ID for FCM token management.
   * Falls back to a session-scoped ID when localStorage is unavailable.
   */
  #getUserId(): string {
    if (typeof localStorage === 'undefined') {
      return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    let userId = localStorage.getItem(LS_USER_ID);
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(LS_USER_ID, userId);
    }
    return userId;
  }
}
