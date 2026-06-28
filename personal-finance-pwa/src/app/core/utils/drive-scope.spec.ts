// TC-DRIVE-03 — Granular-consent rule: a token missing the drive.appdata scope
// must be detected so the app re-prompts instead of looping sign-in forever.
// Tests the REAL extracted helper (no auth.service import — that touches window).
import { describe, it, expect } from 'vitest';
import { DRIVE_APPDATA_SCOPE, grantedScopesIncludeDrive } from './drive-scope';

describe('grantedScopesIncludeDrive (granular consent)', () => {
  it('accepts a scope string that includes drive.appdata', () => {
    const granted = `openid email profile ${DRIVE_APPDATA_SCOPE}`;
    expect(grantedScopesIncludeDrive(granted)).toBe(true);
  });

  it('rejects when the user unticked the Drive checkbox (appdata absent)', () => {
    // This is the exact partner login-loop case from CURRENT_STATE: identity
    // scopes granted, Drive scope dropped.
    const partialConsent = 'openid email profile';
    expect(grantedScopesIncludeDrive(partialConsent)).toBe(false);
  });

  it('rejects null, undefined, and empty scope strings', () => {
    expect(grantedScopesIncludeDrive(null)).toBe(false);
    expect(grantedScopesIncludeDrive(undefined)).toBe(false);
    expect(grantedScopesIncludeDrive('')).toBe(false);
  });

  it('does not match a lookalike scope (substring safety)', () => {
    // A different drive scope must not be mistaken for appdata.
    expect(grantedScopesIncludeDrive('https://www.googleapis.com/auth/drive.file')).toBe(false);
  });

  it('exposes the canonical appdata scope constant', () => {
    expect(DRIVE_APPDATA_SCOPE).toBe('https://www.googleapis.com/auth/drive.appdata');
  });
});
