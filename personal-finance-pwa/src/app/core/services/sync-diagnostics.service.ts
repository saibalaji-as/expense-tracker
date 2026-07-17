import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { SyncDiagnosticEvent, setDriveDiagnosticSink } from './google-drive.service';
import { setAuthDiagnosticSink } from './auth.service';

const DIAGNOSTICS_KEY = 'spenza_sync_diagnostics_v1';
const MAX_EVENTS = 50;

/**
 * Captures a rolling window of Drive sync failures so problems are diagnosable
 * in production instead of vanishing into a generic toast. Each event records
 * the operation, HTTP status, attempt number, whether a retry was scheduled,
 * and a timestamp. Persisted (capped) so it survives reloads and can be shown
 * in a support/debug screen or attached to a bug report.
 */
@Injectable({ providedIn: 'root' })
export class SyncDiagnosticsService {
  readonly #storage = inject(StorageService);
  readonly #events = signal<SyncDiagnosticEvent[]>([]);
  /** Read-only view for any debug UI. */
  readonly events = this.#events.asReadonly();

  /** Registers this service as the Drive + auth diagnostic sink. Call once at startup. */
  async init(): Promise<void> {
    // Sinks FIRST, then load history: the startup silent token renewal runs in
    // parallel with this init, so registering after the (async) Preferences read
    // could drop the very failure the user is trying to diagnose. #load merges
    // behind anything recorded in the meantime.
    setDriveDiagnosticSink((event) => this.record(event));
    // Auth failures (silent token refresh, Cloud Function mint) were previously
    // only visible via adb logcat — route them into the same on-device log.
    setAuthDiagnosticSink((event) => this.record(event));
    await this.#load();
  }

  record(event: SyncDiagnosticEvent): void {
    const next = [event, ...this.#events()].slice(0, MAX_EVENTS);
    this.#events.set(next);
    // Console breadcrumb — warning so it shows up in remote logging without being noise.
    console.warn(`[SyncDiagnostics] ${event.operation} status=${event.status} attempt=${event.attempt} willRetry=${event.willRetry} :: ${event.message}`);
    void this.#persist(next);
  }

  /** Most recent failures first — useful for a "Why didn't my data sync?" view. */
  recent(limit = 10): SyncDiagnosticEvent[] {
    return this.#events().slice(0, limit);
  }

  async clear(): Promise<void> {
    this.#events.set([]);
    await this.#storage.remove(DIAGNOSTICS_KEY);
  }

  async #load(): Promise<void> {
    const raw = await this.#storage.get(DIAGNOSTICS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SyncDiagnosticEvent[];
      if (Array.isArray(parsed)) {
        // Merge behind events recorded while the load was in flight (newest first).
        this.#events.set([...this.#events(), ...parsed].slice(0, MAX_EVENTS));
      }
    } catch {
      // Corrupt buffer is non-critical — start fresh.
    }
  }

  async #persist(events: SyncDiagnosticEvent[]): Promise<void> {
    try {
      await this.#storage.set(DIAGNOSTICS_KEY, JSON.stringify(events));
    } catch {
      // Persisting diagnostics must never break the app.
    }
  }
}
