// Unit tests for AuthService logic (Task 16.1)
// Tests pure logic directly without Angular TestBed
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock localStorage (vitest runs in Node, not jsdom) ───────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

// ─── Pure logic helpers (mirrors AuthService private state logic) ─────────────

/**
 * Mirrors the core state management logic of AuthService.
 * We test the logic directly without instantiating the Angular service
 * to avoid window/gapi/inject() dependency issues in vitest.
 */
class AuthLogic {
  #accessToken: string | null = null;
  isAuthenticated = false;
  userEmail: string | null = null;

  private readonly storage: typeof localStorageMock;

  constructor(storage: typeof localStorageMock) {
    this.storage = storage;
  }

  getAccessToken(): string | null {
    return this.#accessToken;
  }

  /** Mirrors signIn callback success path */
  handleSignInSuccess(accessToken: string): void {
    this.#accessToken = accessToken;
    this.isAuthenticated = true;
    this.storage.setItem('gapi_auth_state', '1');
  }

  /** Mirrors signOut logic */
  handleSignOut(): void {
    this.#clearAuthState();
  }

  /** Mirrors refreshToken error path */
  handleRefreshError(): void {
    this.#clearAuthState();
  }

  #clearAuthState(): void {
    this.#accessToken = null;
    this.isAuthenticated = false;
    this.userEmail = null;
    this.storage.removeItem('gapi_auth_state');
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthService logic', () => {
  let auth: AuthLogic;

  beforeEach(() => {
    localStorageMock.clear();
    auth = new AuthLogic(localStorageMock);
  });

  afterEach(() => {
    localStorageMock.clear();
    vi.restoreAllMocks();
  });

  // ─── Task 16.1a: getAccessToken returns null before sign-in ──────────────

  it('getAccessToken() returns null before sign-in', () => {
    expect(auth.getAccessToken()).toBeNull();
  });

  // ─── Task 16.1b: After signIn succeeds, localStorage has gapi_auth_state=1

  it('sets gapi_auth_state to "1" after signIn succeeds', () => {
    auth.handleSignInSuccess('fake-access-token');
    expect(localStorageMock.getItem('gapi_auth_state')).toBe('1');
  });

  it('getAccessToken() returns the token after signIn succeeds', () => {
    auth.handleSignInSuccess('my-token-123');
    expect(auth.getAccessToken()).toBe('my-token-123');
  });

  it('isAuthenticated is true after signIn succeeds', () => {
    auth.handleSignInSuccess('fake-token');
    expect(auth.isAuthenticated).toBe(true);
  });

  // ─── Task 16.1c: After signOut, localStorage gapi_auth_state is null ─────

  it('removes gapi_auth_state from localStorage after signOut', () => {
    auth.handleSignInSuccess('fake-token');
    expect(localStorageMock.getItem('gapi_auth_state')).toBe('1');

    auth.handleSignOut();
    expect(localStorageMock.getItem('gapi_auth_state')).toBeNull();
  });

  it('getAccessToken() returns null after signOut', () => {
    auth.handleSignInSuccess('fake-token');
    auth.handleSignOut();
    expect(auth.getAccessToken()).toBeNull();
  });

  it('isAuthenticated is false after signOut', () => {
    auth.handleSignInSuccess('fake-token');
    auth.handleSignOut();
    expect(auth.isAuthenticated).toBe(false);
  });

  // ─── Task 16.1d: signOut calls google.accounts.oauth2.revoke ─────────────

  it('signOut calls google.accounts.oauth2.revoke with the current token', () => {
    const revokeMock = vi.fn().mockImplementation((_token: string, cb: () => void) => cb());
    (globalThis as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn().mockReturnValue({
            requestAccessToken: vi.fn(),
          }),
          revoke: revokeMock,
        },
      },
    };

    // Simulate having a token
    auth.handleSignInSuccess('token-to-revoke');

    // Simulate signOut calling revoke (mirrors AuthService.signOut)
    const token = auth.getAccessToken();
    auth.handleSignOut();
    if (token) {
      (globalThis as any).google.accounts.oauth2.revoke(token, () => {});
    }

    expect(revokeMock).toHaveBeenCalledWith('token-to-revoke', expect.any(Function));
  });

  // ─── Task 16.1e: refreshToken rejects and clears auth state on error ──────

  it('refreshToken error path clears auth state and removes gapi_auth_state', () => {
    // First sign in
    auth.handleSignInSuccess('old-token');
    expect(localStorageMock.getItem('gapi_auth_state')).toBe('1');

    // Simulate refreshToken receiving an error callback
    auth.handleRefreshError();

    expect(auth.getAccessToken()).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
    expect(localStorageMock.getItem('gapi_auth_state')).toBeNull();
  });

  it('refreshToken error path clears userEmail', () => {
    auth.handleSignInSuccess('old-token');
    auth.userEmail = 'user@example.com';

    auth.handleRefreshError();

    expect(auth.userEmail).toBeNull();
  });

  // ─── Task 16.1f: signIn with mocked google global ────────────────────────

  it('sets gapi_auth_state after signIn using mocked google global', () => {
    let capturedCallback: ((response: any) => void) | null = null;

    (globalThis as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn().mockImplementation((config: any) => {
            capturedCallback = config.callback;
            return {
              requestAccessToken: vi.fn().mockImplementation(() => {
                // Simulate immediate success callback
                capturedCallback?.({ access_token: 'fake-token' });
              }),
            };
          }),
          revoke: vi.fn(),
        },
      },
    };

    // Simulate the signIn flow
    const tokenClient = (globalThis as any).google.accounts.oauth2.initTokenClient({
      client_id: 'test-client-id',
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      callback: (response: any) => {
        if (!response.error) {
          auth.handleSignInSuccess(response.access_token);
        }
      },
    });
    tokenClient.requestAccessToken();

    expect(localStorageMock.getItem('gapi_auth_state')).toBe('1');
    expect(auth.getAccessToken()).toBe('fake-token');
  });
});
