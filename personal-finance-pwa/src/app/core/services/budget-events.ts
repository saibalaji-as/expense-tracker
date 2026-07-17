import { Subject } from 'rxjs';
import { BudgetThresholdEvent } from '../models/local-notification.model';

export const budgetThresholdExceeded$ = new Subject<BudgetThresholdEvent>();

/** A credit card's utilization crossed a 30%/80% threshold upward. */
export interface CardUtilizationEvent {
  cardId: string;
  cardName: string;
  /** Utilization percent AFTER the change. */
  percent: number;
  threshold: 30 | 80;
  timestamp: number;
}

export const cardUtilizationCrossed$ = new Subject<CardUtilizationEvent>();
