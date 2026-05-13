export interface LocalNotificationSchema {
  id: string;
  title: string;
  body: string;
  schedule?: {
    on?: { hour: number; minute: number };
    every?: 'day' | 'week' | 'month';
    at?: Date;
  };
  extra?: Record<string, any>;
}

export interface NotificationTapEvent {
  notification: LocalNotificationSchema;
  actionId?: string;
}

export interface BudgetThresholdEvent {
  category: string;
  percent: number;
  timestamp: number;
}
