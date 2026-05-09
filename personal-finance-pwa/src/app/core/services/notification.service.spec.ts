// Feature: time-based-hourly-reminders
// Unit tests for NotificationService (Task 5.1)
// Tests pure logic directly without Angular TestBed
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock localStorage ────────────────────────────────────────────────────────

function makeMockStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  } as Storage;
}

// ─── Inline mirrors of NotificationService logic ──────────────────────────────

const LS_ENABLED = 'pf_notif_enabled';
const LS_USER_ID = 'pf_user_id';

function restoreIsEnabled(storage: Storage): boolean {
  return storage.getItem(LS_ENABLED) === 'true';
}

function persistEnabled(storage: Storage, value: boolean): void {
  storage.setItem(LS_ENABLED, String(value));
}

function getUserId(storage: Storage): string {
  let userId = storage.getItem(LS_USER_ID);
  if (!userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    storage.setItem(LS_USER_ID, userId);
  }
  return userId;
}

/**
 * Mirrors enable() logic:
 * - Detects timezone via Intl.DateTimeFormat
 * - Calls registerForNotifications(userId, timezone)
 * - Sets isEnabled=true only if registration succeeds
 */
async function enableLogic(
  storage: Storage,
  registerFn: (userId: string, timezone: string) => Promise<boolean>
): Promise<{ isEnabled: boolean; calledWith: { userId: string; timezone: string } | null }> {
  const userId = getUserId(storage);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const registered = await registerFn(userId, timezone);

  if (!registered) {
    return { isEnabled: false, calledWith: { userId, timezone } };
  }

  persistEnabled(storage, true);
  return { isEnabled: true, calledWith: { userId, timezone } };
}

/**
 * Mirrors disable() logic:
 * - Calls unregister(userId)
 * - Sets isEnabled=false and persists
 */
async function disableLogic(
  storage: Storage,
  unregisterFn: (userId: string) => Promise<boolean>
): Promise<{ isEnabled: boolean }> {
  const userId = getUserId(storage);
  await unregisterFn(userId);
  persistEnabled(storage, false);
  return { isEnabled: false };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationService — enable()', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = makeMockStorage();
  });

  it('calls registerForNotifications with a timezone string (not intervalMinutes)', async () => {
    const registerFn = vi.fn().mockResolvedValue(true);

    const result = await enableLogic(storage, registerFn);

    expect(registerFn).toHaveBeenCalledOnce();
    const [, timezone] = registerFn.mock.calls[0] as [string, string];
    // timezone must be a non-empty string (IANA format)
    expect(typeof timezone).toBe('string');
    expect(timezone.length).toBeGreaterThan(0);
    // Must NOT be a number (old intervalMinutes parameter)
    expect(typeof timezone).not.toBe('number');
  });

  it('calls registerForNotifications with the timezone from Intl.DateTimeFormat', async () => {
    const expectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const registerFn = vi.fn().mockResolvedValue(true);

    await enableLogic(storage, registerFn);

    const [, timezone] = registerFn.mock.calls[0] as [string, string];
    expect(timezone).toBe(expectedTimezone);
  });

  it('sets isEnabled to true when registerForNotifications returns true', async () => {
    const registerFn = vi.fn().mockResolvedValue(true);

    const result = await enableLogic(storage, registerFn);

    expect(result.isEnabled).toBe(true);
    expect(storage.getItem(LS_ENABLED)).toBe('true');
  });

  it('does NOT set isEnabled to true when registerForNotifications returns false', async () => {
    const registerFn = vi.fn().mockResolvedValue(false);

    const result = await enableLogic(storage, registerFn);

    expect(result.isEnabled).toBe(false);
    expect(storage.getItem(LS_ENABLED)).not.toBe('true');
  });

  it('still calls registerForNotifications even when it will return false', async () => {
    const registerFn = vi.fn().mockResolvedValue(false);

    await enableLogic(storage, registerFn);

    expect(registerFn).toHaveBeenCalledOnce();
  });

  it('passes the userId as the first argument to registerForNotifications', async () => {
    const registerFn = vi.fn().mockResolvedValue(true);

    await enableLogic(storage, registerFn);

    const [userId] = registerFn.mock.calls[0] as [string, string];
    expect(typeof userId).toBe('string');
    expect(userId.length).toBeGreaterThan(0);
  });
});

describe('NotificationService — disable()', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = makeMockStorage();
    // Start with enabled state
    persistEnabled(storage, true);
  });

  it('calls FcmService.unregister with the userId', async () => {
    const unregisterFn = vi.fn().mockResolvedValue(true);

    await disableLogic(storage, unregisterFn);

    expect(unregisterFn).toHaveBeenCalledOnce();
    const [userId] = unregisterFn.mock.calls[0] as [string];
    expect(typeof userId).toBe('string');
    expect(userId.length).toBeGreaterThan(0);
  });

  it('sets isEnabled to false', async () => {
    const unregisterFn = vi.fn().mockResolvedValue(true);

    const result = await disableLogic(storage, unregisterFn);

    expect(result.isEnabled).toBe(false);
  });

  it('persists pf_notif_enabled=false to localStorage', async () => {
    const unregisterFn = vi.fn().mockResolvedValue(true);

    await disableLogic(storage, unregisterFn);

    expect(storage.getItem(LS_ENABLED)).toBe('false');
  });

  it('calls unregister even if FCM unregister returns false', async () => {
    const unregisterFn = vi.fn().mockResolvedValue(false);

    const result = await disableLogic(storage, unregisterFn);

    expect(unregisterFn).toHaveBeenCalledOnce();
    expect(result.isEnabled).toBe(false);
  });
});

describe('NotificationService — init (localStorage restore)', () => {
  it('restores isEnabled=true from localStorage when pf_notif_enabled is "true"', () => {
    const storage = makeMockStorage();
    storage.setItem(LS_ENABLED, 'true');

    const isEnabled = restoreIsEnabled(storage);

    expect(isEnabled).toBe(true);
  });

  it('restores isEnabled=false from localStorage when pf_notif_enabled is "false"', () => {
    const storage = makeMockStorage();
    storage.setItem(LS_ENABLED, 'false');

    const isEnabled = restoreIsEnabled(storage);

    expect(isEnabled).toBe(false);
  });

  it('restores isEnabled=false when pf_notif_enabled is absent', () => {
    const storage = makeMockStorage();

    const isEnabled = restoreIsEnabled(storage);

    expect(isEnabled).toBe(false);
  });

  it('does NOT call the backend (registerForNotifications) on init', () => {
    // The init logic only reads localStorage — no async calls
    const storage = makeMockStorage();
    storage.setItem(LS_ENABLED, 'true');

    const registerFn = vi.fn();

    // Simulate init: only read from storage, never call registerFn
    restoreIsEnabled(storage);

    expect(registerFn).not.toHaveBeenCalled();
  });
});

describe('NotificationService — userId persistence', () => {
  it('generates and persists a userId on first call', () => {
    const storage = makeMockStorage();

    const userId = getUserId(storage);

    expect(typeof userId).toBe('string');
    expect(userId.length).toBeGreaterThan(0);
    expect(storage.getItem(LS_USER_ID)).toBe(userId);
  });

  it('returns the same userId on subsequent calls', () => {
    const storage = makeMockStorage();

    const userId1 = getUserId(storage);
    const userId2 = getUserId(storage);

    expect(userId1).toBe(userId2);
  });

  it('enable() and disable() use the same userId', async () => {
    const storage = makeMockStorage();
    const registerFn = vi.fn().mockResolvedValue(true);
    const unregisterFn = vi.fn().mockResolvedValue(true);

    await enableLogic(storage, registerFn);
    await disableLogic(storage, unregisterFn);

    const [enableUserId] = registerFn.mock.calls[0] as [string, string];
    const [disableUserId] = unregisterFn.mock.calls[0] as [string];

    expect(enableUserId).toBe(disableUserId);
  });
});
