/**
 * Pure utility functions for the time-based reminder scheduler.
 * No side effects, no I/O — safe to unit-test and property-test in isolation.
 */

export function resolveTimezone(tz: unknown): string {
  if (typeof tz !== 'string' || tz.trim() === '') {
    return 'UTC';
  }
  try {
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

export function getReminderSlot(utcNow: Date, timezone: string): string | null {
  const local = getLocalReminderTime(utcNow, timezone);
  if (local.minute !== 0) return null;
  if (local.hour < 8 || local.hour > 22) return null;

  return `${local.year}-${local.month}-${local.day}T${local.hour.toString().padStart(2, '0')}:00`;
}

export function getDailyReminderSlot(
  utcNow: Date,
  timezone: string,
  reminderHour: unknown,
  reminderMinute: unknown
): string | null {
  if (typeof reminderHour !== 'number' || typeof reminderMinute !== 'number') {
    return null;
  }

  if (!Number.isInteger(reminderHour) || !Number.isInteger(reminderMinute)) {
    return null;
  }

  if (reminderHour < 0 || reminderHour > 23 || reminderMinute < 0 || reminderMinute > 59) {
    return null;
  }

  const local = getLocalReminderTime(utcNow, timezone);
  if (local.hour !== reminderHour || local.minute !== reminderMinute) {
    return null;
  }

  return `${local.year}-${local.month}-${local.day}T${local.hour.toString().padStart(2, '0')}:${local.minute.toString().padStart(2, '0')}`;
}

export function shouldSendReminder(utcNow: Date, timezone: string): boolean {
  return getReminderSlot(utcNow, timezone) !== null;
}
