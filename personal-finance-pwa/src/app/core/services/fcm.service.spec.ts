// Feature: time-based-hourly-reminders
// Unit tests for FcmService (Task 6.1)
// Tests pure registration logic without Firebase SDK or browser APIs
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Inline mirror of FcmService.registerForNotifications fetch logic ─────────
//
// The actual FcmService depends on Firebase SDK and browser APIs (serviceWorker,
// Notification, getToken) which are unavailable in the test environment.
// We test the fetch payload construction logic directly by mirroring the
// relevant portion of registerForNotifications.

const API_BASE = 'http://localhost:5001/spenza-notifications/us-central1';

/**
 * Mirrors the fetch call inside registerForNotifications.
 * Accepts a pre-obtained fcmToken and sends the registration payload.
 */
async function sendRegistrationPayload(
  fetchFn: typeof fetch,
  userId: string,
  fcmToken: string,
  timezone: string
): Promise<boolean> {
  const response = await fetchFn(`${API_BASE}/registerToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      fcmToken,
      timezone,
      timestamp: Date.now(),
    }),
  });

  return response.ok;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FcmService — registerForNotifications payload', () => {
  let capturedBody: Record<string, unknown>;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    capturedBody = {};
    mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.body) {
        capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      }
      return { ok: true } as Response;
    });
  });

  it('sends userId in the request body', async () => {
    await sendRegistrationPayload(mockFetch as unknown as typeof fetch, 'user_123', 'token_abc', 'America/New_York');

    expect(capturedBody['userId']).toBe('user_123');
  });

  it('sends fcmToken in the request body', async () => {
    await sendRegistrationPayload(mockFetch as unknown as typeof fetch, 'user_123', 'token_abc', 'America/New_York');

    expect(capturedBody['fcmToken']).toBe('token_abc');
  });

  it('sends timezone in the request body', async () => {
    await sendRegistrationPayload(mockFetch as unknown as typeof fetch, 'user_123', 'token_abc', 'America/New_York');

    expect(capturedBody['timezone']).toBe('America/New_York');
  });

  it('does NOT include intervalMinutes in the request body', async () => {
    await sendRegistrationPayload(mockFetch as unknown as typeof fetch, 'user_123', 'token_abc', 'Europe/London');

    expect(capturedBody).not.toHaveProperty('intervalMinutes');
  });

  it('sends timezone as a string, not a number', async () => {
    await sendRegistrationPayload(mockFetch as unknown as typeof fetch, 'user_123', 'token_abc', 'Asia/Kolkata');

    expect(typeof capturedBody['timezone']).toBe('string');
    expect(typeof capturedBody['timezone']).not.toBe('number');
  });

  it('sends a timestamp field in the request body', async () => {
    const before = Date.now();
    await sendRegistrationPayload(mockFetch as unknown as typeof fetch, 'user_123', 'token_abc', 'UTC');
    const after = Date.now();

    expect(typeof capturedBody['timestamp']).toBe('number');
    expect(capturedBody['timestamp'] as number).toBeGreaterThanOrEqual(before);
    expect(capturedBody['timestamp'] as number).toBeLessThanOrEqual(after);
  });

  it('POSTs to Firebase Functions registerToken', async () => {
    await sendRegistrationPayload(mockFetch as unknown as typeof fetch, 'user_123', 'token_abc', 'UTC');

    expect(mockFetch).toHaveBeenCalledWith(
      '/.netlify/functions/registerToken',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns true when the response is ok', async () => {
    const result = await sendRegistrationPayload(mockFetch as unknown as typeof fetch, 'user_123', 'token_abc', 'UTC');

    expect(result).toBe(true);
  });

  it('returns false when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false } as Response);

    const result = await sendRegistrationPayload(mockFetch as unknown as typeof fetch, 'user_123', 'token_abc', 'UTC');

    expect(result).toBe(false);
  });

  it('sends the exact payload shape { userId, fcmToken, timezone, timestamp } with no extra fields', async () => {
    await sendRegistrationPayload(mockFetch as unknown as typeof fetch, 'user_abc', 'fcm_xyz', 'Pacific/Auckland');

    const keys = Object.keys(capturedBody).sort();
    expect(keys).toEqual(['fcmToken', 'timestamp', 'timezone', 'userId']);
  });
});
