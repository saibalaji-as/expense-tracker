/**
 * scheduler-utils.ts
 *
 * Pure utility functions for the time-based hourly reminder scheduler.
 * No side effects, no I/O — safe to unit-test and property-test in isolation.
 */

/**
 * Returns `tz` if it is a non-empty, recognised IANA timezone string;
 * otherwise returns `"UTC"`.
 *
 * Validation is performed by constructing an `Intl.DateTimeFormat` with the
 * candidate string. If the runtime throws (unrecognised timezone), we fall
 * back to `"UTC"`.
 */
export function resolveTimezone(tz: unknown): string {
  if (typeof tz !== 'string' || tz.trim() === '') {
    return 'UTC';
  }
  try {
    // Intl.DateTimeFormat throws a RangeError for unrecognised timezone strings.
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export interface LocalReminderTime {
  year: string;
  month: string;
  day: string;
  hour: number;
  minute: number;
}

/**
 * Extracts local date/time parts for `utcNow` in `timezone`.
 */
export function getLocalReminderTime(utcNow: Date, timezone: string): LocalReminderTime {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(utcNow).map((part) => [part.type, part.value])
  );

  return {
    year: parts['year'],
    month: parts['month'],
    day: parts['day'],
    hour: parseInt(parts['hour'], 10) % 24,
    minute: parseInt(parts['minute'], 10),
  };
}

/**
 * Returns the local hourly reminder slot key, or `null` when no notification
 * should be sent. Active slots are exactly 08:00 through 22:00 inclusive.
 */
export function getReminderSlot(utcNow: Date, timezone: string): string | null {
  const local = getLocalReminderTime(utcNow, timezone);
  if (local.minute !== 0) return null;
  if (local.hour < 8 || local.hour > 22) return null;

  return `${local.year}-${local.month}-${local.day}T${local.hour.toString().padStart(2, '0')}:00`;
}

/**
 * Returns `true` iff `utcNow` is at the zeroth minute of a local active hour:
 * 08:00, 09:00, ... 22:00.
 */
export function shouldSendReminder(utcNow: Date, timezone: string): boolean {
  return getReminderSlot(utcNow, timezone) !== null;
}
