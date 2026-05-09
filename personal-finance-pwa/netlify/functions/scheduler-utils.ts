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

/**
 * Returns `true` iff the local hour in `timezone` for the given `utcNow`
 * timestamp falls within the active window [8, 21] inclusive (08:00–21:59).
 *
 * Uses `Intl.DateTimeFormat` with `hour12: false` to extract the numeric
 * local hour. The `timezone` parameter is assumed to be a valid IANA string
 * (pass the output of `resolveTimezone` to guarantee this).
 */
export function shouldSendReminder(utcNow: Date, timezone: string): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });

  // `format` returns the hour as a string like "8", "13", "24" (midnight in
  // some locales is represented as "24" rather than "0").
  const hourStr = formatter.format(utcNow);
  const hour = parseInt(hourStr, 10) % 24; // normalise "24" → 0

  return hour >= 8 && hour <= 21;
}
