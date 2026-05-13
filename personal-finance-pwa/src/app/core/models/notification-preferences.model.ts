export interface NotificationPreferences {
  dailyReminderEnabled: boolean;
  reminderHour: number;        // 0-23
  reminderMinute: number;      // 0-59
  budgetWarningsEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  dailyReminderEnabled: false,
  reminderHour: 21,
  reminderMinute: 0,
  budgetWarningsEnabled: true
};
