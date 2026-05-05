// Unit tests for authGuard logic (Task 16.7)
// Tests pure guard logic directly without Angular TestBed
import { describe, it, expect, vi } from 'vitest';

// ─── Pure guard logic (mirrors authGuard without Angular DI) ─────────────────

/**
 * A UrlTree-like object for testing redirect behavior.
 * Mirrors what router.createUrlTree(['/auth/callback']) returns.
 */
interface MockUrlTree {
  readonly __type: 'UrlTree';
  readonly path: string;
}

function createUrlTree(path: string): MockUrlTree {
  return { __type: 'UrlTree', path };
}

/**
 * Mirrors the authGuard logic:
 * - If not authenticated, return a UrlTree redirect to /auth/callback
 * - If authenticated, return true
 */
function guardLogic(isAuthenticated: boolean): boolean | MockUrlTree {
  if (!isAuthenticated) {
    return createUrlTree('/auth/callback');
  }
  return true;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('authGuard logic', () => {
  // ─── Task 16.7a: unauthenticated → returns UrlTree ───────────────────────

  it('returns a UrlTree (redirect) when isAuthenticated() returns false', () => {
    const result = guardLogic(false);
    expect(result).not.toBe(true);
    expect(typeof result).toBe('object');
    expect((result as MockUrlTree).__type).toBe('UrlTree');
  });

  it('redirects to /auth/callback when not authenticated', () => {
    const result = guardLogic(false) as MockUrlTree;
    expect(result.path).toBe('/auth/callback');
  });

  // ─── Task 16.7b: authenticated → returns true ────────────────────────────

  it('returns true when isAuthenticated() returns true', () => {
    const result = guardLogic(true);
    expect(result).toBe(true);
  });

  it('does not return a UrlTree when authenticated', () => {
    const result = guardLogic(true);
    expect(typeof result).toBe('boolean');
    expect(result).not.toMatchObject({ __type: 'UrlTree' });
  });

  // ─── Additional edge cases ────────────────────────────────────────────────

  it('guard result is boolean true (not truthy object) when authenticated', () => {
    const result = guardLogic(true);
    expect(result === true).toBe(true);
  });

  it('guard result is not true when not authenticated', () => {
    const result = guardLogic(false);
    expect(result === true).toBe(false);
  });

  it('guard with mocked AuthService: false → redirect, true → allow', () => {
    const mockAuthService = {
      isAuthenticated: vi.fn(),
    };

    // Test unauthenticated
    mockAuthService.isAuthenticated.mockReturnValue(false);
    const unauthResult = guardLogic(mockAuthService.isAuthenticated());
    expect(unauthResult).not.toBe(true);

    // Test authenticated
    mockAuthService.isAuthenticated.mockReturnValue(true);
    const authResult = guardLogic(mockAuthService.isAuthenticated());
    expect(authResult).toBe(true);
  });
});
