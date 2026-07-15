/**
 * Device-local notification inbox.
 *
 * Items are written by the Android `SpendNotificationListenerService` into
 * Capacitor Preferences under `spenza_notification_inbox_v1` BEFORE the review
 * prompt is posted, so cleared/missed prompts can be recovered from the
 * in-app Notifications screen.
 *
 * PRIVACY: `comment` contains SMS-derived text. Inbox items must NEVER be
 * merged into the Drive backup document or family Firestore sync. Only the
 * resulting ExpenseEntry / DebtPayment / adjustment leaves the device.
 */

export const NOTIFICATION_INBOX_STORAGE_KEY = 'spenza_notification_inbox_v1';

export type NotificationInboxKind =
  | 'expense'
  | 'income'
  | 'salary'
  | 'cc-spend'
  | 'cc-payment';

export type NotificationInboxStatus =
  | 'pending'
  | 'logged'
  | 'dismissed'
  | 'auto-handled';

export interface NotificationInboxItem {
  id: string;
  /** Google email active when the detection was captured; null on legacy items. */
  userEmail: string | null;
  /** ISO datetime (UTC) of detection. */
  detectedAt: string;
  kind: NotificationInboxKind;
  amount: number;
  currency: string;
  /** Normalized SMS text — device-local only. */
  comment: string;
  /** Source Android package name. */
  sourceApp: string;
  cardLast4?: string;
  status: NotificationInboxStatus;
  /** Id of the ExpenseEntry / DebtPayment / adjustment created from this item. */
  linkedEntryId?: string;
  statusChangedAt?: string;
}
