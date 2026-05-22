import { describe, expect, it } from 'vitest';
import { shouldRedirectToIncomeSetup } from './setup-income-gate';

describe('setup income gate logic', () => {
  it('does not redirect before Drive backup data has loaded', () => {
    expect(shouldRedirectToIncomeSetup('/daily', null, 0)).toBe(false);
  });

  it('redirects expense tracking and budget insight routes when income is missing', () => {
    expect(shouldRedirectToIncomeSetup('/daily', 'drive-file-id', 0)).toBe(true);
    expect(shouldRedirectToIncomeSetup('/monthly', 'drive-file-id', 0)).toBe(true);
    expect(shouldRedirectToIncomeSetup('/dashboard', 'drive-file-id', 0)).toBe(true);
  });

  it('keeps the Limits and Settings routes available while income is missing', () => {
    expect(shouldRedirectToIncomeSetup('/limits', 'drive-file-id', 0)).toBe(false);
    expect(shouldRedirectToIncomeSetup('/settings', 'drive-file-id', 0)).toBe(false);
  });

  it('allows gated routes after monthly income is configured', () => {
    expect(shouldRedirectToIncomeSetup('/daily', 'drive-file-id', 50000)).toBe(false);
  });

  it('handles query strings without bypassing the gate', () => {
    expect(shouldRedirectToIncomeSetup('/daily?from=nav', 'drive-file-id', 0)).toBe(true);
  });
});
