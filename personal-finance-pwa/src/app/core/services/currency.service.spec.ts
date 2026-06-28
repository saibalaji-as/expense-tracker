// TC-MONEY-01 — Currency formatting must be exact and locale-correct.
// Exercises the REAL CurrencyService.format()/symbol()/option(). Expected
// strings are pinned from actual Intl.NumberFormat output, so any change to the
// formatter config (fraction digits, currencyDisplay, grouping) fails loudly.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// StorageService (transitively imported) wraps @capacitor/preferences; mock it
// so importing CurrencyService is side-effect free in the Node test env.
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(() => Promise.resolve({ value: null })),
    set: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
  },
}));

import { CurrencyService } from './currency.service';

describe('CurrencyService.format', () => {
  let service: CurrencyService;

  beforeEach(() => {
    // Stub storage so the constructor's load() is a no-op; default stays INR.
    service = new CurrencyService({
      get: async () => null,
      set: async () => undefined,
    } as never);
  });

  const cases: ReadonlyArray<[number | null | undefined, string, 'INR' | 'USD' | 'AED', string]> = [
    [0, 'en-IN', 'INR', '₹0.00'],
    [1234567.5, 'en-IN', 'INR', '₹12,34,567.50'], // Indian lakh grouping + trailing zero
    [-250, 'en-IN', 'INR', '-₹250.00'],
    [99.99, 'en-IN', 'INR', '₹99.99'],
    [150, 'en-US', 'USD', '$150.00'],
    [0.1 + 0.2, 'en-IN', 'INR', '₹0.30'], // float noise must round to 2dp, not 0.3000000004
  ];

  it.each(cases)('formats %s (%s/%s) as %s', (value, locale, currency, expected) => {
    expect(service.format(value, locale, currency)).toBe(expected);
  });

  it('treats null and undefined as zero', () => {
    expect(service.format(null, 'en-IN', 'INR')).toBe('₹0.00');
    expect(service.format(undefined, 'en-IN', 'INR')).toBe('₹0.00');
  });

  it('returns the correct symbol per currency', () => {
    expect(service.symbol('INR')).toBe('₹');
    expect(service.symbol('USD')).toBe('$');
    expect(service.symbol('AED')).toBe('د.إ');
  });

  it('falls back to the first option (INR) for an unknown currency', () => {
    expect(service.option('GBP' as never).code).toBe('INR');
  });
});
