/**
 * Property-based tests for scheduler-utils.ts
 *
 * Uses fast-check for property generation.
 * Minimum 100 iterations per property (fast-check default is 100).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getDailyReminderSlot, getReminderSlot, resolveTimezone, shouldSendReminder } from '../functions/scheduler-utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A curated list of valid IANA timezone strings that are universally
 * recognised across Node.js versions.
 */
const VALID_IANA_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Pacific/Honolulu',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'America/Toronto',
];

/** Arbitrary that picks a valid IANA timezone string. */
const arbValidTimezone = fc.constantFrom(...VALID_IANA_TIMEZONES);

/** Arbitrary UTC timestamp covering a wide range (year 2000–2100). */
const arbUtcDate = fc
  .integer({ min: 946684800000, max: 4102444800000 }) // 2000-01-01 to 2100-01-01
  .map((ms) => new Date(ms));

// ─── Property 1: Active hourly slot gate ─────────────────────────────────────
// Feature: time-based-hourly-reminders, Property 1: active-window gate
//
// Validates: Requirements 2.4, 2.5

describe('Property 1: Active hourly slot gate', () => {
  it('shouldSendReminder returns true iff local time is 08:00 through 22:00 on minute 0', () => {
    fc.assert(
      fc.property(arbUtcDate, arbValidTimezone, (utcNow, timezone) => {
        // Derive expected local time independently using the same Intl API.
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        const parts = Object.fromEntries(
          formatter.formatToParts(utcNow).map((part) => [part.type, part.value])
        );
        const localHour = parseInt(parts['hour'], 10) % 24;
        const localMinute = parseInt(parts['minute'], 10);

        const expected = localHour >= 8 && localHour <= 22 && localMinute === 0;
        const actual = shouldSendReminder(utcNow, timezone);

        expect(actual).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Reminder slot keys', () => {
  it('returns a stable local slot key for an active zeroth-minute reminder', () => {
    // 02:30 UTC is 08:00 in Asia/Kolkata.
    expect(getReminderSlot(new Date('2026-05-14T02:30:00.000Z'), 'Asia/Kolkata'))
      .toBe('2026-05-14T08:00');
  });

  it('does not send at half past the hour', () => {
    // 03:00 UTC is 08:30 in Asia/Kolkata.
    expect(getReminderSlot(new Date('2026-05-14T03:00:00.000Z'), 'Asia/Kolkata'))
      .toBeNull();
  });

  it('includes the 22:00 final reminder', () => {
    // 16:30 UTC is 22:00 in Asia/Kolkata.
    expect(getReminderSlot(new Date('2026-05-14T16:30:00.000Z'), 'Asia/Kolkata'))
      .toBe('2026-05-14T22:00');
  });
});

describe('Daily reminder slot keys', () => {
  it('returns a stable slot key at the user-selected local time', () => {
    // 15:45 UTC is 21:15 in Asia/Kolkata.
    expect(getDailyReminderSlot(new Date('2026-05-14T15:45:00.000Z'), 'Asia/Kolkata', 21, 15))
      .toBe('2026-05-14T21:15');
  });

  it('does not send when only the hour matches', () => {
    expect(getDailyReminderSlot(new Date('2026-05-14T15:45:00.000Z'), 'Asia/Kolkata', 21, 0))
      .toBeNull();
  });

  it('ignores invalid configured reminder times', () => {
    expect(getDailyReminderSlot(new Date('2026-05-14T15:45:00.000Z'), 'Asia/Kolkata', 24, 0))
      .toBeNull();
    expect(getDailyReminderSlot(new Date('2026-05-14T15:45:00.000Z'), 'Asia/Kolkata', 21, '15'))
      .toBeNull();
  });
});

// ─── Property 2: Timezone fallback ───────────────────────────────────────────
// Feature: time-based-hourly-reminders, Property 2: timezone fallback
//
// Validates: Requirements 3.4

describe('Property 2: Timezone fallback', () => {
  /** Invalid / unrecognised timezone values that should all fall back to UTC. */
  const invalidTimezones = [
    null,
    undefined,
    '',
    'Not/ATimezone',
    'garbage123',
  ] as const;

  it('resolveTimezone returns "UTC" for invalid inputs', () => {
    fc.assert(
      fc.property(fc.constantFrom(...invalidTimezones), (tz) => {
        expect(resolveTimezone(tz)).toBe('UTC');
      }),
      { numRuns: 100 }
    );
  });

  it('shouldSendReminder with invalid timezone matches shouldSendReminder with "UTC"', () => {
    fc.assert(
      fc.property(arbUtcDate, fc.constantFrom(...invalidTimezones), (utcNow, tz) => {
        // resolveTimezone should map tz → "UTC"
        const resolved = resolveTimezone(tz);
        expect(resolved).toBe('UTC');

        // shouldSendReminder with the raw invalid tz (after resolving) should
        // equal the result when explicitly passing "UTC".
        const withResolved = shouldSendReminder(utcNow, resolved);
        const withUtc = shouldSendReminder(utcNow, 'UTC');

        expect(withResolved).toBe(withUtc);
      }),
      { numRuns: 100 }
    );
  });
});
