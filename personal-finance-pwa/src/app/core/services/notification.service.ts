import { Injectable, Signal, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { Router } from '@angular/router';
import { ExpenseStore } from './expense-store.service';

// VAPID public key placeholder — replace with a real key in production
const VAPID_PUBLIC_KEY = '';

// localStorage keys
const LS_ENABLED = 'pf_notif_enabled';
const LS_INTERVAL = 'pf_notif_interval';
const DEFAULT_INTERVAL_MINUTES = 60;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  // ─── Task 13.1: Signals ───────────────────────────────────────────────────────

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

  /** Handle for the active setInterval, so we can clear and restart it. */
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  private readonly swPush = inject(SwPush);
  private readonly router = inject(Router);
  private readonly expenseStore = inject(ExpenseStore);

  constructor() {
    this.permissionState = this._permissionState.asReadonly();
    this.isEnabled = this._isEnabled.asReadonly();
    this.intervalMinutes = this._intervalMinutes.asReadonly();

    // ─── Task 13.7: Subscribe to notification clicks ──────────────────────────
    this.swPush.notificationClicks.subscribe(() => {
      this.router.navigate(['/daily']).catch(() => {
        // Navigation errors are non-critical; ignore
      });
    });

    // Resume the interval if notifications were previously enabled
    if (this._isEnabled() && this._permissionState() === 'granted') {
      this.#scheduleInterval(this._intervalMinutes());
    }
  }

  // ─── Task 13.2: requestPermission ────────────────────────────────────────────

  async requestPermission(): Promise<void> {
    if (this._permissionState() === 'granted') {
      return;
    }

    try {
      await this.swPush.requestSubscription({ serverPublicKey: VAPID_PUBLIC_KEY });
      this._permissionState.set('granted');
    } catch {
      // Denied or error — disable notifications
      this._permissionState.set('denied');
      this._isEnabled.set(false);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LS_ENABLED, 'false');
      }
    }
  }

  // ─── Task 13.3: enable ────────────────────────────────────────────────────────

  async enable(intervalMinutes: number): Promise<void> {
    if (this._permissionState() !== 'granted') {
      await this.requestPermission();
    }

    // If permission was denied during requestPermission, bail out
    if (this._permissionState() === 'denied') {
      return;
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_ENABLED, 'true');
      localStorage.setItem(LS_INTERVAL, intervalMinutes.toString());
    }

    this._isEnabled.set(true);
    this._intervalMinutes.set(intervalMinutes);
    this.#scheduleInterval(intervalMinutes);
  }

  // ─── Task 13.4: disable ───────────────────────────────────────────────────────

  async disable(): Promise<void> {
    this.#clearInterval();
    this._isEnabled.set(false);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_ENABLED, 'false');
    }
  }

  // ─── Task 13.5: updateInterval ────────────────────────────────────────────────

  updateInterval(minutes: number): void {
    const clamped = Math.min(480, Math.max(15, minutes));
    this._intervalMinutes.set(clamped);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_INTERVAL, clamped.toString());
    }

    // Restart the interval immediately with the new value
    if (this._isEnabled()) {
      this.#scheduleInterval(clamped);
    }
  }

  // ─── Task 13.6: Notification check logic ─────────────────────────────────────

  private async checkAndNotify(): Promise<void> {
    const intervalMs = this._intervalMinutes() * 60 * 1000;
    const cutoff = Date.now() - intervalMs;

    const entries = this.expenseStore.entries();
    const hasRecentEntry = entries.some((entry) => {
      const ts = new Date(entry.timestamp).getTime();
      return ts >= cutoff;
    });

    if (!hasRecentEntry) {
      await this.#dispatchNotification();
    }
  }

  async #dispatchNotification(): Promise<void> {
    const title = 'Spenza';
    const options: NotificationOptions = {
      body: "Don't forget to log your expenses!",
      icon: '/icons/icon-192x192.png',
    };

    // Try the service worker registration first (works in PWA context)
    try {
      if (
        typeof self !== 'undefined' &&
        'serviceWorker' in navigator &&
        navigator.serviceWorker.controller
      ) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, options);
        return;
      }
    } catch {
      // Fall through to Notification API fallback
    }

    // Fallback: use the Notification API directly
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, options);
      }
    } catch {
      // Notification dispatch failed — silently ignore
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  #scheduleInterval(minutes: number): void {
    this.#clearInterval();
    const ms = minutes * 60 * 1000;
    this.intervalHandle = setInterval(() => {
      this.checkAndNotify().catch(() => {
        // Notification errors are non-critical; ignore
      });
    }, ms);
  }

  #clearInterval(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
