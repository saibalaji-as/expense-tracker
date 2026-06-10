import { Injectable, signal, Signal } from '@angular/core';

/**
 * Tracks online/offline state for the UI (offline banner, toast).
 * The legacy Sheets/IndexedDB offline queue has been removed — Google Drive
 * is the authoritative persistence layer and handles its own error states.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  readonly isOnline: Signal<boolean>;

  private readonly _isOnline = signal<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  constructor() {
    this.isOnline = this._isOnline.asReadonly();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._isOnline.set(true));
      window.addEventListener('offline', () => this._isOnline.set(false));
    }
  }

  /** No-op stub kept for call-sites that clear state on sign-out / data reset. */
  async clearQueue(): Promise<void> {}
}
