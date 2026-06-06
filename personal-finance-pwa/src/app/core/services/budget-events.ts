import { Subject } from 'rxjs';
import { BudgetThresholdEvent } from '../models/local-notification.model';

export const budgetThresholdExceeded$ = new Subject<BudgetThresholdEvent>();
