/**
 * A bank statement message captured on-device by the Android notification
 * listener (SpendNotificationListenerService) and handed to the app through
 * the `spenza_card_statement_detections_v1` storage key. Parsed locally; the
 * message text itself is never stored or sent anywhere.
 */
export interface CardStatementDetection {
  id: string;
  /** Total amount due on the statement. */
  amount: number;
  minDue?: number;
  /** Payment due date from the message, local 'YYYY-MM-DD'. */
  dueDateStr?: string;
  cardLast4?: string;
  /** Local 'YYYY-MM-DD' the message arrived. */
  detectedDateStr: string;
  /** Google account active on the device when the message arrived. */
  userEmail?: string | null;
  /** Card the app resolved this detection to (set once known). */
  debtId?: string;
}
