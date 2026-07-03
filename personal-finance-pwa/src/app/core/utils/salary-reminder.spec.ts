import { buildSalaryReminderPlan, isSalaryCredit, SALARY_REMINDER_NOTIFICATION_ID } from './salary-reminder';
import { AccountBalanceAdjustment } from '../models';

function salaryAdjustment(createdAt: string, reason = 'Salary · July'): AccountBalanceAdjustment {
  return {
    id: `adj-${createdAt}`,
    accountId: 'acc-1',
    amount: 50000,
    kind: 'increase',
    reason,
    createdAt,
  };
}

describe('salary-reminder planner', () => {
  const now = new Date(2026, 6, 3, 12, 0); // 3 Jul 2026 noon

  it('returns null when disabled', () => {
    expect(buildSalaryReminderPlan(false, 1, [], now)).toBeNull();
  });

  it('schedules the next salary-day occurrence at 20:00', () => {
    const plan = buildSalaryReminderPlan(true, 5, [], now)!;
    expect(plan.id).toBe(SALARY_REMINDER_NOTIFICATION_ID);
    expect(plan.at.getDate()).toBe(5);
    expect(plan.at.getMonth()).toBe(6); // July
    expect(plan.at.getHours()).toBe(20);
  });

  it('rolls to next month when salary day already passed', () => {
    const plan = buildSalaryReminderPlan(true, 1, [], now)!;
    expect(plan.at.getMonth()).toBe(7); // August
    expect(plan.at.getDate()).toBe(1);
  });

  it('pushes to the following month when salary was already recorded this cycle', () => {
    // Salary day 5; salary credited on 2 Jul (within the 5-day grace window before 5 Jul).
    const plan = buildSalaryReminderPlan(true, 5, [salaryAdjustment('2026-07-02T09:00:00Z')], now)!;
    expect(plan.at.getMonth()).toBe(7); // August, not July
  });

  it('ignores old salary credits from previous cycles', () => {
    const plan = buildSalaryReminderPlan(true, 5, [salaryAdjustment('2026-06-04T09:00:00Z')], now)!;
    expect(plan.at.getMonth()).toBe(6); // July still scheduled
  });

  it('ignores non-salary credits', () => {
    const cashback = salaryAdjustment('2026-07-02T09:00:00Z', 'Cashback');
    const plan = buildSalaryReminderPlan(true, 5, [cashback], now)!;
    expect(plan.at.getMonth()).toBe(6); // July still scheduled
  });

  it('detects salary credits by reason keywords, increases only', () => {
    expect(isSalaryCredit(salaryAdjustment('2026-07-01T00:00:00Z', 'SALARY june'))).toBe(true);
    expect(isSalaryCredit(salaryAdjustment('2026-07-01T00:00:00Z', 'monthly payroll'))).toBe(true);
    expect(isSalaryCredit({ ...salaryAdjustment('2026-07-01T00:00:00Z'), kind: 'decrease' })).toBe(false);
    expect(isSalaryCredit(salaryAdjustment('2026-07-01T00:00:00Z', 'refund'))).toBe(false);
  });

  it('clamps day 31 in short months', () => {
    const plan = buildSalaryReminderPlan(true, 31, [], new Date(2026, 3, 1))!; // April
    expect(plan.at.getDate()).toBe(30);
    expect(plan.at.getMonth()).toBe(3);
  });
});
