export type AssetAccountType = 'bank' | 'wallet' | 'cash' | 'other';

export interface AssetAccount {
  id: string;
  name: string;
  type: AssetAccountType;
  balance: number;
  initialBalance: number;
  allowOverdraft: boolean;
  isDefault: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  createdByEmail?: string;
  createdByRole?: 'owner' | 'partner' | 'single';
  updatedByEmail?: string;
  updatedByRole?: 'owner' | 'partner' | 'single';
}

export type AccountBalanceAdjustmentKind = 'increase' | 'decrease';

export interface AccountBalanceAdjustment {
  id: string;
  accountId: string;
  amount: number;
  kind: AccountBalanceAdjustmentKind;
  reason?: string;
  createdAt: string;
  createdByEmail?: string;
  createdByRole?: 'owner' | 'partner' | 'single';
}

export interface CreateAssetAccountInput {
  name: string;
  type: AssetAccountType;
  balance: number;
  allowOverdraft: boolean;
  isDefault: boolean;
}

export interface UpdateAssetAccountInput {
  name?: string;
  type?: AssetAccountType;
  allowOverdraft?: boolean;
  isDefault?: boolean;
  archived?: boolean;
}

export interface AdjustAccountBalanceInput {
  accountId: string;
  amount: number;
  kind: AccountBalanceAdjustmentKind;
  reason?: string;
}
