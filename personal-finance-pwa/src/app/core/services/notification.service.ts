import { Injectable, Signal, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { Router } from '@angular/router';

// localStorage keys (kept for reading legacy state on first load)
const LS_ENABLED = 'pf_notif_enabled';
const LS_INTERVAL = 'pf_notif_interval';
const DEFAULT_INTERVAL_MINUTES = 60;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  // ─── Public signals ───────────────────────────────────────────────────────────

  readonly permissionState: Signal<NotificationPermission>;
  readonly isEnabled: Signal<boolean>;
  readonly intervalMinutes: Signal<number>;

  private readonly _permissionState = signal<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  private readonly _isEnabled = signal<boolean>(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(LS_ENABLED) === 'true'
      : false
  );
  private readonly _intervalMinutes = signal<number>(
    typeof localStorage !== 'undefined'
      ? parseInt(localStorage.getItem(LS_INTERVAL) ?? String(DEFAULT_INTERVAL_MINUTES), 10) ||
        DEFAULT_INTERVAL_MINUTES
      : DEFAULT_INTERVAL_MINUTES
  );

  /** Reference to the registered reminder service worker. */
  private reminderSw: ServiceWorkerRegistration | null = null;

  /**
   * In-tab fallback: setInterval handle used when the reminder SW is not
   * available (e.g. dev mode, unsupported browser).
   */
  private fallbackIntervalHandle: ReturnType<typeof setInterval> | null = null;

  private readonly swPush = inject(SwPush);
  private readonly router = inject(Router);

  constructor() {
    this.permissionState = this._permissionState.asReadonly();
    this.isEnabled = this._isEnabled.asReadonly();
    this.intervalMinutes = this._intervalMinutes.asReadonly();

    // Handle notification clicks from Angular's SW push (ngsw)
    this.swPush.notificationClicks.subscribe(() => {
      this.router.navigate(['/daily']).catch(() => {});
    });

    // Register the reminder SW and restore previous state
    this.#init().catch(() => {});
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

  async enable(intervalMinutes: number): Promise<void> {
    if (this._permissionState() !== 'granted') {
      await this.requestPermission();
    }
    if (this._permissionState() !== 'granted') return;

    this._isEnabled.set(true);
    this._intervalMinutes.set(intervalMinutes);
    this.#persistEnabled(true);
    this.#persistInterval(intervalMinutes);

    await this.#sendConfig(true, intervalMinutes);
  }

  async disable(): Promise<void> {
    this._isEnabled.set(false);
    this.#persistEnabled(false);
    this.#clearFallbackInterval();
    await this.#sendConfig(false, this._intervalMinutes());
  }

  updateInterval(minutes: number): void {
    const clamped = Math.min(480, Math.max(15, minutes));
    this._intervalMinutes.set(clamped);
    this.#persistInterval(clamped);
    if (this._isEnabled()) {
      this.#sendConfig(true, clamped).catch(() => {});
    }
  }

  // ─── Initialisation ───────────────────────────────────────────────────────────

  async #init(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      // No SW support — use in-tab fallback if already enabled
      if (this._isEnabled() && this._permissionState() === 'granted') {
        this.#startFallbackInterval(this._intervalMinutes());
      }
      return;
    }

    try {
      // Register our dedicated reminder service worker
      this.reminderSw = await navigator.serviceWorker.register('/reminder-sw.js', {
        scope: '/',
      });

      // Wait for it to become active
      await this.#waitForActive(this.reminderSw);

      // Restore previous enabled state into the SW
      if (this._isEnabled() && this._permissionState() === 'granted') {
        await this.#sendConfig(true, this._intervalMinutes());
      } else {
        await this.#sendConfig(false, this._intervalMinutes());
      }

      // Tell the SW to check right now in case we missed a notification
      // while the app was closed
      this.#postToSw({ type: 'REMINDER_CHECK_NOW' });
    } catch {
      // SW registration failed (e.g. dev server without HTTPS) — fall back
      if (this._isEnabled() && this._permissionState() === 'granted') {
        this.#startFallbackInterval(this._intervalMinutes());
      }
    }
  }

  // ─── SW communication ─────────────────────────────────────────────────────────

  async #sendConfig(enabled: boolean, intervalMinutes: number): Promise<void> {
    const sent = this.#postToSw({
      type: 'REMINDER_CONFIG',
      payload: { enabled, intervalMinutes },
    });

    if (!sent) {
      // SW not available — manage in-tab fallback
      this.#clearFallbackInterval();
      if (enabled && this._permissionState() === 'granted') {
        this.#startFallbackInterval(intervalMinutes);
      }
    }
  }

  /**
   * Posts a message to the reminder SW's active worker.
   * Returns true if the message was sent, false if no active worker exists.
   */
  #postToSw(message: object): boolean {
    const sw = this.reminderSw?.active ?? navigator.serviceWorker?.controller;
    if (!sw) return false;
    sw.postMessage(message);
    return true;
  }

  /** Waits until the SW registration has an active worker. */
  #waitForActive(reg: ServiceWorkerRegistration): Promise<void> {
    if (reg.active) return Promise.resolve();
    return new Promise((resolve) => {
      const worker = reg.installing ?? reg.waiting;
      if (!worker) { resolve(); return; }
      worker.addEventListener('statechange', function handler() {
        if (worker.state === 'activated') {
          worker.removeEventListener('statechange', handler);
          resolve();
        }
      });
    });
  }

  // ─── In-tab fallback (no SW / dev mode) ──────────────────────────────────────

  /**
   * Wall-clock based fallback for environments without a service worker.
   * Checks every minute whether `intervalMinutes` have elapsed since the
   * last notification (tracked in localStorage).
   */
  #startFallbackInterval(intervalMinutes: number): void {
    this.#clearFallbackInterval();
    this.#fallbackCheck(intervalMinutes);
    this.fallbackIntervalHandle = setInterval(() => {
      this.#fallbackCheck(intervalMinutes);
    }, 60 * 1000);
  }

  #clearFallbackInterval(): void {
    if (this.fallbackIntervalHandle !== null) {
      clearInterval(this.fallbackIntervalHandle);
      this.fallbackIntervalHandle = null;
    }
  }

  #fallbackCheck(intervalMinutes: number): void {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const lastStr = localStorage.getItem('pf_last_notified_at');
    const lastNotifiedAt = lastStr ? parseInt(lastStr, 10) : 0;
    const elapsed = Date.now() - lastNotifiedAt;
    const threshold = intervalMinutes * 60 * 1000;

    if (elapsed >= threshold) {
      localStorage.setItem('pf_last_notified_at', String(Date.now()));
      new Notification('Spenza 💸', {
        body: "Don't forget to log your expenses!",
        icon: '/icons/icon-192x192.png',
        tag: 'spenza-reminder',
      });
    }
  }

  // ─── Persistence helpers ──────────────────────────────────────────────────────

  #persistEnabled(value: boolean): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_ENABLED, String(value));
    }
  }

  #persistInterval(value: number): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_INTERVAL, String(value));
    }
  }
}
