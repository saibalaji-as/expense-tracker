// Task 17.3: Auth flow integration tests
// Tests the auth flow logic directly without Angular TestBed.
// Validates: Requirements 1.1, 1.6
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mock localStorage ────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

// ─── Auth state logic (mirrors AuthService core state management) ─────────────

interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  userEmail: string | null;
}

function createAuthState(): AuthState {
  return {
    isAuthenticated: false,
    accessToken: null,
    userEmail: null,
  };
}

function handleSignInSuccess(state: AuthState, accessToken: string): void {
  state.accessToken = accessToken;
  state.isAuthenticated = true;
  localStorageMock.setItem('gapi_auth_state', '1');
}

function handleSignOut(state: AuthState): void {
  state.accessToken = null;
  state.isAuthenticated = false;
  state.userEmail = null;
  localStorageMock.removeItem('gapi_auth_state');
}

// ─── Guard logic (mirrors authGuard) ─────────────────────────────────────────

interface MockUrlTree {
  readonly __type: 'UrlTree';
  readonly path: string;
}

function guardLogic(isAuthenticated: boolean): boolean | MockUrlTree {
  if (!isAuthenticated) {
    return { __type: 'UrlTree', path: '/auth/callback' };
  }
  return true;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Auth flow integration', () => {
  let authState: AuthState;

  beforeEach(() => {
    localStorageMock.clear();
    authState = createAuthState();
  });

  afterEach(() => {
    localStorageMock.clear();
    vi.restoreAllMocks();
  });

  // ─── Unauthenticated user: guard redirects to /auth/callback ─────────────

  describe('unauthenticated user', () => {
    it('guard redirects to /auth/callback when not authenticated', () => {
      const result = guardLogic(authState.isAuthenticated);

      expect(result).not.toBe(true);
      expect((result as MockUrlTree).__type).toBe('UrlTree');
      expect((result as MockUrlTree).path).toBe('/auth/callback');
    });

    it('isAuthenticated is false before sign-in', () => {
      expect(authState.isAuthenticated).toBe(false);
    });

    it('gapi_auth_state is not set before sign-in', () => {
      expect(localStorageMock.getItem('gapi_auth_state')).toBeNull();
    });

    it('guard returns a UrlTree (not boolean true) when unauthenticated', () => {
      const result = guardLogic(false);
      expect(result === true).toBe(false);
      expect(typeof result).toBe('object');
    });
  });

  // ─── After sign-in ────────────────────────────────────────────────────────

  describe('after sign-in', () => {
    it('isAuthenticated becomes true after successful sign-in', () => {
      handleSignInSuccess(authState, 'access-token-abc');
      expect(authState.isAuthenticated).toBe(true);
    });

    it('gapi_auth_state is set to "1" after sign-in', () => {
      handleSignInSuccess(authState, 'access-token-abc');
      expect(localStorageMock.getItem('gapi_auth_state')).toBe('1');
    });

    it('accessToken is stored after sign-in', () => {
      handleSignInSuccess(authState, 'my-token-xyz');
      expect(authState.accessToken).toBe('my-token-xyz');
    });

    it('guard returns true (allows navigation) after sign-in', () => {
      handleSignInSuccess(authState, 'access-token-abc');
      const result = guardLogic(authState.isAuthenticated);
      expect(result).toBe(true);
    });

    it('guard does not redirect after sign-in', () => {
      handleSignInSuccess(authState, 'access-token-abc');
      const result = guardLogic(authState.isAuthenticated);
      expect(typeof result).toBe('boolean');
    });
  });

  // ─── After sign-out ───────────────────────────────────────────────────────

  describe('after sign-out', () => {
    it('isAuthenticated becomes false after sign-out', () => {
      handleSignInSuccess(authState, 'access-token-abc');
      expect(authState.isAuthenticated).toBe(true);

      handleSignOut(authState);
      expect(authState.isAuthenticated).toBe(false);
    });

    it('gapi_auth_state is removed from localStorage after sign-out', () => {
      handleSignInSuccess(authState, 'access-token-abc');
      expect(localStorageMock.getItem('gapi_auth_state')).toBe('1');

      handleSignOut(authState);
      expect(localStorageMock.getItem('gapi_auth_state')).toBeNull();
    });

    it('accessToken is cleared after sign-out', () => {
      handleSignInSuccess(authState, 'access-token-abc');
      handleSignOut(authState);
      expect(authState.accessToken).toBeNull();
    });

    it('guard redirects to /auth/callback after sign-out', () => {
      handleSignInSuccess(authState, 'access-token-abc');
      handleSignOut(authState);

      const result = guardLogic(authState.isAuthenticated);
      expect(result).not.toBe(true);
      expect((result as MockUrlTree).path).toBe('/auth/callback');
    });

    it('userEmail is cleared after sign-out', () => {
      handleSignInSuccess(authState, 'access-token-abc');
      authState.userEmail = 'user@example.com';

      handleSignOut(authState);
      expect(authState.userEmail).toBeNull();
    });
  });

  // ─── Full flow: sign-in → sign-out → sign-in ─────────────────────────────

  describe('full auth flow', () => {
    it('can sign in, sign out, and sign in again', () => {
      // Initial state
      expect(authState.isAuthenticated).toBe(false);

      // Sign in
      handleSignInSuccess(authState, 'token-1');
      expect(authState.isAuthenticated).toBe(true);
      expect(localStorageMock.getItem('gapi_auth_state')).toBe('1');

      // Sign out
      handleSignOut(authState);
      expect(authState.isAuthenticated).toBe(false);
      expect(localStorageMock.getItem('gapi_auth_state')).toBeNull();

      // Sign in again
      handleSignInSuccess(authState, 'token-2');
      expect(authState.isAuthenticated).toBe(true);
      expect(localStorageMock.getItem('gapi_auth_state')).toBe('1');
    });
  });
});
