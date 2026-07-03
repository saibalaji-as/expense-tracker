export interface NotificationPreferences {
  dailyReminderEnabled: boolean;
  reminderHour: number;        // 0-23
  reminderMinute: number;      // 0-59
  budgetWarningsEnabled: boolean;
  /** Remind to record salary if no salary credit was detected around salary day. */
  salaryReminderEnabled?: boolean;
  /** Day of month (1-28) salary is usually received. */
  salaryDay?: number;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  dailyReminderEnabled: false,
  reminderHour: 21,
  reminderMinute: 0,
  budgetWarningsEnabled: true,
  salaryReminderEnabled: false,
  salaryDay: 1
};
