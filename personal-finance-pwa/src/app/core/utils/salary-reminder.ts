import { AccountBalanceAdjustment } from '../models';

/**
 * Pure planning logic for the "enter your salary" reminder.
 *
 * The salary SMS prompt (notification listener) is the primary capture path —
 * salary credits saved from it carry "salary" in the adjustment reason. This
 * reminder is the fallback: it fires on the user's salary day evening ONLY
 * when no salary-tagged account credit has been recorded around that day.
 * Recomputed (one-shot) on app load and every adjustment change, like the
 * credit-card ladder.
 */

export const SALARY_REMINDER_NOTIFICATION_ID = 30001;

const REMINDER_HOUR = 20; // evening — salary usually lands during the day
/** A salary credited a few days early still counts for this month. */
const EARLY_SALARY_GRACE_DAYS = 5;

export interface PlannedSalaryReminder {
  id: number;
  title: string;
  body: string;
  at: Date;
}

function clampedOccurrence(year: number, monthIndex: number, day: number): Date {
  const normalized = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(normalized.getFullYear(), normalized.getMonth() + 1, 0).getDate();
  return new Date(normalized.getFullYear(), normalized.getMonth(), Math.min(day, daysInMonth), REMINDER_HOUR, 0, 0, 0);
}

function nextOccurrenceAfter(day: number, after: Date): Date {
  let candidate = clampedOccurrence(after.getFullYear(), after.getMonth(), day);
  if (candidate <= after) {
    candidate = clampedOccurrence(after.getFullYear(), after.getMonth() + 1, day);
  }
  return candidate;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isSalaryCredit(adjustment: AccountBalanceAdjustment): boolean {
  return adjustment.kind === 'increase' && /salary|payroll|wages/i.test(adjustment.reason ?? '');
}

/**
 * Plan the next salary reminder. Returns null when disabled or when this
 * month's salary was already recorded (in which case the next reminder is
 * scheduled for the following month instead — see the returned plan).
 */
export function buildSalaryReminderPlan(
  enabled: boolean,
  salaryDay: number,
  adjustments: readonly AccountBalanceAdjustment[],
  now: Date
): PlannedSalaryReminder | null {
  if (!enabled || !Number.isFinite(salaryDay) || salaryDay < 1 || salaryDay > 31) return null;

  let at = nextOccurrenceAfter(salaryDay, now);

  // A salary credit recorded within the grace window before the upcoming
  // occurrence means this month is covered — plan the following month.
  // (The plan is recomputed on every adjustment change, so a salary recorded
  // later — e.g. via the SMS prompt on salary day — pushes it out then.)
  const suppressFrom = addDays(at, -EARLY_SALARY_GRACE_DAYS);
  const alreadyRecorded = adjustments.some((adjustment) => {
    if (!isSalaryCredit(adjustment)) return false;
    const createdAt = new Date(adjustment.createdAt);
    return createdAt >= suppressFrom && createdAt <= now;
  });
  if (alreadyRecorded) {
    at = nextOccurrenceAfter(salaryDay, at);
  }

  return {
    id: SALARY_REMINDER_NOTIFICATION_ID,
    title: 'Salary day — update your account',
    body: "Received your salary? Add it to your account so balances and budgets stay accurate.",
    at,
  };
}
