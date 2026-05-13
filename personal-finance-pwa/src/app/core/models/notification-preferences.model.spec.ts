import { describe, it, expect } from 'vitest';
import { NotificationPreferences, DEFAULT_NOTIFICATION_PREFERENCES } from './notification-preferences.model';

describe('NotificationPreferences Model', () => {
  it('should define NotificationPreferences interface', () => {
    const prefs: NotificationPreferences = {
      dailyReminderEnabled: true,
      reminderHour: 9,
      reminderMinute: 30,
      budgetWarningsEnabled: false
    };

    expect(prefs.dailyReminderEnabled).toBe(true);
    expect(prefs.reminderHour).toBe(9);
    expect(prefs.reminderMinute).toBe(30);
    expect(prefs.budgetWarningsEnabled).toBe(false);
  });

  it('should have correct default values', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.dailyReminderEnabled).toBe(false);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.reminderHour).toBe(21);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.reminderMinute).toBe(0);
    expect(DEFAULT_NOTIFICATION_PREFERENCES.budgetWarningsEnabled).toBe(true);
  });

  it('should validate reminderHour is within 0-23 range', () => {
    const validPrefs: NotificationPreferences = {
      dailyReminderEnabled: true,
      reminderHour: 23,
      reminderMinute: 59,
      budgetWarningsEnabled: true
    };

    expect(validPrefs.reminderHour).toBeGreaterThanOrEqual(0);
    expect(validPrefs.reminderHour).toBeLessThanOrEqual(23);
  });

  it('should validate reminderMinute is within 0-59 range', () => {
    const validPrefs: NotificationPreferences = {
      dailyReminderEnabled: true,
      reminderHour: 12,
      reminderMinute: 59,
      budgetWarningsEnabled: true
    };

    expect(validPrefs.reminderMinute).toBeGreaterThanOrEqual(0);
    expect(validPrefs.reminderMinute).toBeLessThanOrEqual(59);
  });
});
