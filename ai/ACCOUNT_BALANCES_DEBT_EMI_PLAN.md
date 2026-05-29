# Account Balances & Debt/EMI Action Plan

## Goal
Add optional account balance and debt/EMI tracking so Spenza can show cash on hand, liabilities, and net worth without forcing complexity on users who only want expense tracking.

## Current Code Fit
- `ExpenseStore` is the right central owner for accounts, debts, and balance-affecting mutations because it already owns Drive-backed state, cached startup snapshots, family-mode sync, and expense create/update/delete persistence.
- `BackupDocument` currently stores `metadata`, `expenses`, and `limits`. Add optional `accounts`, `debts`, and later `balanceAdjustments`/`debtPayments` arrays while keeping `version: '1.0'` and tolerating missing fields for older backups.
- `ExpenseEntry` should get optional account/debt links, not a breaking schema rewrite.
- Daily expense creation/edit/delete already flows through `ExpenseStore.addEntry`, `addEntries`, `updateEntry`, and `deleteEntry`; these methods should become the balance-safe transaction boundary.
- A new `/finances` standalone feature should own account/debt management UI. Dashboard should only show summarized net worth cards.

## Data Model
- `AssetAccount`
  - `id`, `name`, `type: 'bank' | 'wallet' | 'cash' | 'other'`
  - `balance`
  - `initialBalance`
  - `allowOverdraft`
  - `isDefault`
  - `archived`
  - `createdAt`, `updatedAt`
  - actor metadata for family mode changes
- `AccountBalanceAdjustment`
  - `id`, `accountId`, `amount`, `kind: 'increase' | 'decrease'`, `reason`, `createdAt`
  - No expense entry is created for manual adjustments.
- `ExpenseEntry` optional fields
  - `accountId?: string`
  - `debtId?: string`
  - `source?: 'manual' | 'widget' | 'notification-prompt' | 'debt-payment'`
- `DebtAccount`
  - `id`, `name`, `type: 'credit-card' | 'personal-loan' | 'vehicle-loan' | 'home-loan' | 'other'`
  - `principalAmount`, `remainingBalance`
  - `interestRate?: number`
  - `monthlyEmi?: number`
  - `startDate`, `nextDueDate?: string`
  - `status: 'active' | 'paid' | 'archived'`
  - `createdAt`, `updatedAt`
- `DebtPayment`
  - `id`, `debtId`, `expenseId`, `accountId`, `amount`, `date`, `createdAt`
  - Useful for audit/history and for reversing a payment if needed.

## Phase 1: Asset Accounts
1. Add account models and exports under `src/app/core/models/`.
2. Extend `BackupDocument`, `buildInitialDocument`, restore/export parsing, local snapshot validation, and `ExpenseStore` state with `accounts: AssetAccount[]`.
3. Add store computed values:
   - `activeAccounts`
   - `defaultAccount`
   - `totalAssets`
4. Add store methods:
   - `addAccount`
   - `updateAccount`
   - `setDefaultAccount`
   - `adjustAccountBalance`
   - `deleteAccount`, blocked when linked expenses exist
5. Add `/finances` route and nav item.
6. Build `FinancesComponent` with account list, add/edit modal, default marker, balance adjustment flow, delete confirmation, and empty state.
7. Add i18n keys in English, Tamil, and Hindi.
8. Tests:
   - Backup docs without `accounts` load as empty arrays.
   - Only one default account is allowed.
   - Delete is blocked when expenses reference the account.
   - Manual adjustments persist and do not create expenses.

## Phase 2: Link Expenses To Accounts
1. Add optional `accountId` to `ExpenseEntry`.
2. Add account selector to Daily form, defaulting to `ExpenseStore.defaultAccount()` when accounts exist.
3. Update `DailyExpenseDraftService` so unsaved account selection survives same-session navigation.
4. Move account balance mutation into `ExpenseStore` methods:
   - `addEntry` deducts from linked account.
   - `addEntries` deducts each linked entry, using all-or-nothing validation.
   - `updateEntry` reverses the old linked account effect, applies the new one.
   - `deleteEntry` reverses the linked account effect.
5. Enforce overdraft rule:
   - If `allowOverdraft === false` and deduction would make balance negative, reject before patching state and show a guided error.
6. Update entry detail/list UI to show payment source when present.
7. Widget and notification-prompt expenses should remain valid without `accountId` at first; optionally prefill the default account later once native queue/schema is extended.
8. Tests:
   - Create deducts.
   - Edit amount/account reverses then applies.
   - Delete restores.
   - Overdraft rejection leaves entries/accounts unchanged.
   - Old expenses without accounts do not affect balances.

## Phase 3: Debts And EMIs
1. Add debt models and `debts`/`debtPayments` to `BackupDocument` and `ExpenseStore`.
2. Add a canonical predefined category: `Debt Payment`.
   - Recommended percentage should default to `0` unless budget defaults are intentionally redesigned.
   - Treat as a user-visible category for limits and reporting.
3. Extend Finances with liability list, progress bars, add/edit debt modal, record-payment flow, and paid/active filters.
4. Store method `recordDebtPayment({ debtId, accountId, amount, date, comment })` should atomically:
   - Validate debt/account/overdraft.
   - Create an `ExpenseEntry` with type `Debt Payment`, `accountId`, `debtId`, and source `debt-payment`.
   - Deduct the account.
   - Reduce debt remaining balance.
   - Create a `DebtPayment`.
   - Mark debt as `paid` when remaining balance reaches zero.
   - Persist once.
5. Define reversal behavior before implementation:
   - Preferred: debt-payment expense edits/deletes must go through a dedicated flow that also updates `DebtPayment` and debt balance.
   - Simpler first release: block editing debt-payment expense entries from Daily and direct users to Finances.
6. Tests:
   - Payment creates expense, deducts account, reduces debt.
   - Overpayment caps or rejects according to chosen product rule.
   - Paid status toggles at zero.
   - Delete/edit safeguards prevent inconsistent debt state.

## Phase 4: Net Worth And Health
1. Add store computed values:
   - `totalAssets`
   - `totalLiabilities`
   - `netWorth`
   - `activeDebtCount`
   - `nextDebtDue`
2. Add Dashboard net-worth card near the top:
   - Net worth = assets minus liabilities.
   - Show total assets, total debts, and a small asset/liability breakdown.
   - Show clear empty state if no accounts or debts exist.
3. Add optional debt reminder preference later:
   - Local notification for native/PWA when due date is near.
   - FCM scheduled reminder only if debt due dates/preferences are synced to backend.
4. Tests:
   - Computed totals handle empty state, positive net worth, and negative net worth.
   - Dashboard card renders without accounts/debts and with mixed assets/liabilities.

## Phase 5: Debt Payment Edit/Delete Reversal
Current behavior intentionally blocks generic Daily edit/delete for `Debt Payment` entries because each payment mutates four linked pieces of state: the expense entry, account balance, debt remaining balance/status, and the `DebtPayment` audit record.

Recommended implementation:
1. Keep Daily edit/delete blocked for `source: 'debt-payment'` entries.
2. Add payment history under each debt in Finances, grouped by debt.
3. Add store method `deleteDebtPayment(paymentId)` that atomically:
   - Finds the `DebtPayment`, linked `ExpenseEntry`, linked debt, and linked account.
   - Deletes the expense entry.
   - Deletes the payment record.
   - Restores the paid amount to the linked account balance.
   - Increases the debt remaining balance by the payment amount.
   - Reopens the debt status to `active` if it was `paid`.
   - Persists once.
4. Add store method `updateDebtPayment(paymentId, input)` that atomically:
   - Computes the delta between old and new payment amount/account/date/comment.
   - Reverses the old account deduction and debt reduction.
   - Applies the new account deduction and debt reduction with overdraft/overpayment validation.
   - Updates the linked expense and `DebtPayment` record.
   - Persists once.
5. Add Finances-only edit/delete controls for payment history, with confirmation for delete and guided errors for overdraft/overpayment.
6. Tests:
   - Delete restores account and debt, removes expense/payment, and reopens paid debt.
   - Edit amount/account reverses old side effects and applies new side effects.
   - Edit rejects overpayment and account overdraft without partial state changes.
   - Daily still cannot edit/delete debt-payment entries.

## Release Strategy
- Ship Phase 1 first with no Daily form changes. This gives immediate value and low data-risk.
- Ship Phase 2 after store-level transaction tests are solid.
- Ship Phase 3 only after deciding how debt-payment expense edits/deletes behave.
- Ship Phase 4 dashboard after data is available from Phases 1 and 3.
- Ship Phase 5 as a focused transaction feature before exposing any debt-payment edit/delete controls.

## Key Decisions Needed
- Should account balances be stored as mutable current balances, or derived from initial balance plus ledger movements? Recommendation: store current balances in Phase 1/2 for simplicity, but also store adjustment/payment records to enable future audit log.
- Should `Debt Payment` be a predefined category or a special hidden category? Recommendation: predefined visible category with `0%` default budget recommendation.
- Should split bills support one account for the whole split or account per split row? Recommendation: one account for the whole bill in Phase 2; per-row accounts can be future work.
- How should widget-created expenses choose accounts? Recommendation: no account in Phase 2 unless the native widget can safely read the default account from cached backup.
- Should family partners be allowed to delete shared accounts/debts? Recommendation: allow with strong confirmation in first pass; add role-based restrictions only if users ask.

## Main Risks
- Balance double-deduction from edit/delete bugs. Mitigation: centralize all balance effects in `ExpenseStore` and add focused transaction tests.
- Backup compatibility regressions. Mitigation: all new arrays optional on read and included on write/export.
- Family-mode conflicts. Mitigation: keep Drive document as one shared truth and avoid per-device derived balances.
- User confusion during migration. Mitigation: old expenses have no account and do not change balances; Finances empty state explains that users can add accounts and manually adjust.
