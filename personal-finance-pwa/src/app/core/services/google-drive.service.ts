import { Injectable, inject } from '@angular/core';
import { AccountBalanceAdjustment, AssetAccount, DebtAccount, DebtPayment, ExpenseEntry, ExpenseLimit, ExpenseReceipt } from '../models';
import { AuthService } from './auth.service';

// ─── Data Models ──────────────────────────────────────────────────────────────

export interface BackupDocument {
  version: string;
  lastUpdated: string;
  metadata: {
    monthlyIncome: number;
    currency: string;
    receiptFolderId?: string;
    ownerUid?: string;   // Firebase UID stamped by owner at setup — marks a legitimate Spenza family backup
    partnerUid?: string; // Firebase UID stamped when a partner connects — enforces single-partner limit
  };
  expenses: ExpenseEntry[];
  limits: ExpenseLimit[];
  accounts?: AssetAccount[];
  accountAdjustments?: AccountBalanceAdjustment[];
  debts?: DebtAccount[];
  debtPayments?: DebtPayment[];
}

// ─── Error Types ──────────────────────────────────────────────────────────────

export interface DriveApiError {
  status: number;
  message: string;
  operation: string;
}

export interface DriveFileMetadata {
  modifiedTime: string;
}

export interface DeletedDriveItem {
  id: string;
  name: string;
  deleted: boolean;
  error?: string;
}

export interface FamilyFolderCandidate {
  id: string;
  backupFileId: string;
  ownedByMe: boolean;
  modifiedTime?: string;
}

export class DriveParseError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = 'DriveParseError';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns an initial BackupDocument for a brand-new backup file.
 * version is always "1.0", expenses and limits are empty arrays,
 * and metadata.monthlyIncome is 0.
 */
export function buildInitialDocument(timestamp: string): BackupDocument {
  return {
    version: '1.0',
    lastUpdated: timestamp,
    metadata: { monthlyIncome: 0, currency: 'INR' },
    expenses: [],
    limits: [],
    accounts: [],
    accountAdjustments: [],
    debts: [],
    debtPayments: [],
  };
}

// ─── Config Document ──────────────────────────────────────────────────────────

export interface SpenzaConfig {
  version: string;
  mode: 'single' | 'family' | null;
  sharedFileId: string | null;
  familyFolderId?: string | null;
  ownerRole: 'owner' | 'partner' | null;
  familySyncMode?: 'firestore' | 'drive';
  firestoreFamilyId?: string | null;
  aiSettings?: {
    provider: 'default' | 'user-key' | 'disabled';
    geminiApiKey?: string | null;
  };
  lastUpdated: string;
}

export function buildInitialConfig(): SpenzaConfig {
  return {
    version: '1.0',
    mode: null,
    sharedFileId: null,
    familyFolderId: null,
    ownerRole: null,
    aiSettings: {
      provider: 'disabled',
      geminiApiKey: null,
    },
    lastUpdated: new Date().toISOString(),
  };
}

function noCacheHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class GoogleDriveService {
  readonly #authService = inject(AuthService);

  private readonly spenzaDriveNames = [
    'spenza-backup.json',
    'spenza-config.json',
    'Spenza Family',
    'Spenza Receipts',
  ];

  private buildMultipartBody(metadata: object, content: string, boundary: string): string {
    return (
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n` +
      `\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n` +
      `\r\n` +
      `${content}\r\n` +
      `--${boundary}--`
    );
  }

  /**
   * Queries Drive for an existing spenza-backup.json in appDataFolder.
   * Returns the file's Drive resource ID, or null if not found.
   */
  async findBackupFile(): Promise<string | null> {
    const token = await this.#authService.ensureToken();

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D'spenza-backup.json'&fields=files(id)&_=${Date.now()}`,
      {
        headers: noCacheHeaders(token),
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'findBackupFile' } as DriveApiError;
    }

    const data = await response.json();
    const files: Array<{ id: string }> = data.files ?? [];

    return files.length > 0 ? files[0].id : null;
  }

  /**
   * Creates a new spenza-backup.json in appDataFolder with an initial
   * BackupDocument. Returns the newly created file's Drive resource ID.
   */
  async createBackupFile(): Promise<string> {
    const token = await this.#authService.ensureToken();
    const initialDocument = buildInitialDocument(new Date().toISOString());
    const boundary = 'spenza_boundary_001';

    const metadata = JSON.stringify({ name: 'spenza-backup.json', parents: ['appDataFolder'] });
    const content = JSON.stringify(initialDocument);

    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n` +
      `\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n` +
      `\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'createBackupFile' } as DriveApiError;
    }

    const data = await response.json();
    return data.id as string;
  }

  /**
   * Downloads and parses the backup file identified by fileId.
   * Throws DriveParseError if the content is not valid JSON or fails
   * BackupDocument structural validation.
   */
  async readBackupFile(fileId: string): Promise<BackupDocument> {
    const token = await this.#authService.ensureToken();

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&_=${Date.now()}`,
      {
        headers: noCacheHeaders(token),
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'readBackupFile' } as DriveApiError;
    }

    const rawText = await response.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new DriveParseError('Failed to parse backup file as JSON', rawText);
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)['version'] !== 'string' ||
      (parsed as Record<string, unknown>)['version'] === '' ||
      !Array.isArray((parsed as Record<string, unknown>)['expenses']) ||
      !Array.isArray((parsed as Record<string, unknown>)['limits'])
    ) {
      throw new DriveParseError('BackupDocument validation failed: missing or invalid fields', rawText);
    }

    return parsed as BackupDocument;
  }

  async getFileModifiedTime(fileId: string): Promise<string> {
    const token = await this.#authService.ensureToken();

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime&_=${Date.now()}`,
      {
        headers: noCacheHeaders(token),
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'getFileModifiedTime' } as DriveApiError;
    }

    const data = await response.json() as DriveFileMetadata;
    return data.modifiedTime;
  }

  async deleteSpenzaDriveData(extraFileIds: Array<string | null | undefined> = []): Promise<DeletedDriveItem[]> {
    const knownItems = new Map<string, string>();

    for (const fileId of extraFileIds) {
      if (fileId) knownItems.set(fileId, 'Saved Spenza item');
    }

    const [
      appDataItems,
      driveItems,
      privateBackupId,
      rootBackupId,
      configId,
    ] = await Promise.all([
      this.findSpenzaItemsInAppDataFolder().catch(() => [] as Array<{ id: string; name: string }>),
      // Full drive scope removed in v8 — silently skip; legacy My Drive files can't be listed.
      this.findSpenzaItemsInMyDrive().catch(() => [] as Array<{ id: string; name: string }>),
      this.findBackupFile().catch(() => null),
      this.findBackupFileInMyDrive().catch(() => null),
      this.findConfigFile().catch(() => null),
    ]);

    for (const item of [...appDataItems, ...driveItems]) {
      knownItems.set(item.id, item.name);
    }
    if (privateBackupId) knownItems.set(privateBackupId, 'spenza-backup.json');
    if (rootBackupId) knownItems.set(rootBackupId, 'spenza-backup.json');
    if (configId) knownItems.set(configId, 'spenza-config.json');

    const results: DeletedDriveItem[] = [];
    for (const [id, name] of knownItems.entries()) {
      results.push(await this.deleteDriveItem(id, name));
    }

    return results;
  }

  private async findSpenzaItemsInAppDataFolder(): Promise<Array<{ id: string; name: string }>> {
    const token = await this.#authService.ensureToken();
    const nameQuery = this.spenzaDriveNames
      .filter((name) => name.startsWith('spenza-'))
      .map((name) => `name='${escapeDriveQueryValue(name)}'`)
      .join(' or ');
    const q = encodeURIComponent(`(${nameQuery}) and trashed=false`);

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name)&_=${Date.now()}`,
      { headers: noCacheHeaders(token) }
    );

    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'findSpenzaItemsInAppDataFolder' } as DriveApiError;
    }

    const data = await response.json();
    return data.files ?? [];
  }

  private async findSpenzaItemsInMyDrive(): Promise<Array<{ id: string; name: string }>> {
    const token = await this.#authService.ensureToken();
    const nameQuery = this.spenzaDriveNames
      .map((name) => `name='${escapeDriveQueryValue(name)}'`)
      .join(' or ');
    const q = encodeURIComponent(`(${nameQuery}) and trashed=false`);

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&_=${Date.now()}`,
      { headers: noCacheHeaders(token) }
    );

    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'findSpenzaItemsInMyDrive' } as DriveApiError;
    }

    const data = await response.json();
    return data.files ?? [];
  }

  private async deleteDriveItem(fileId: string, name: string): Promise<DeletedDriveItem> {
    const token = await this.#authService.ensureToken();

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: 'DELETE',
        headers: noCacheHeaders(token),
      }
    );

    if (response.ok || response.status === 404) {
      return { id: fileId, name, deleted: true };
    }

    const message = await response.text();
    return { id: fileId, name, deleted: false, error: message || `HTTP ${response.status}` };
  }

  /**
   * Searches My Drive root for an existing spenza-backup.json.
   * Returns the file's Drive resource ID, or null if not found.
   */
  async findBackupFileInMyDrive(): Promise<string | null> {
    const token = await this.#authService.ensureToken();

    const q = encodeURIComponent("name='spenza-backup.json' and 'root' in parents and trashed=false");
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&_=${Date.now()}`,
      {
        headers: noCacheHeaders(token),
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'findBackupFileInMyDrive' } as DriveApiError;
    }

    const data = await response.json();
    const files: Array<{ id: string }> = data.files ?? [];
    return files.length > 0 ? files[0].id : null;
  }

  /**
   * Creates a new spenza-backup.json in My Drive root (parents: ['root']).
   * Returns the newly created file's Drive resource ID.
   */
  async createBackupFileInMyDrive(): Promise<string> {
    const token = await this.#authService.ensureToken();
    const initialDocument = buildInitialDocument(new Date().toISOString());
    const boundary = 'spenza_boundary_001';

    const metadata = JSON.stringify({ name: 'spenza-backup.json', parents: ['root'] });
    const content = JSON.stringify(initialDocument);

    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n` +
      `\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n` +
      `\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'createBackupFileInMyDrive' } as DriveApiError;
    }

    const data = await response.json();
    return data.id as string;
  }

  // TODO: Remove after 2026-09-01 — no users should be on old shared-Drive family mode by then.
  /**
   * @deprecated LEGACY — shared Drive folder family mode.
   * No longer called by new Firestore-backed family sync.
   * Safe to delete after confirming no existing users are on old family mode.
   */
  async createFamilyFolderBundle(): Promise<{
    familyFolderId: string;
    backupFileId: string;
    receiptFolderId: string;
  }> {
    const familyFolderId = await this.createDriveFolder('Spenza Family', 'root');
    const receiptFolderId = await this.createDriveFolder('Receipts', familyFolderId);
    const backupFileId = await this.createBackupFileInFolder(familyFolderId);

    return { familyFolderId, backupFileId, receiptFolderId };
  }

  // TODO: Remove after 2026-09-01 — no users should be on old shared-Drive family mode by then.
  /**
   * @deprecated LEGACY — shared Drive folder family mode.
   * No longer called by new Firestore-backed family sync.
   * Safe to delete after confirming no existing users are on old family mode.
   */
  async findExistingFamilyFolderBundle(): Promise<FamilyFolderCandidate | null> {
    const token = await this.#authService.ensureToken();
    const q = encodeURIComponent(
      "name='Spenza Family' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    );
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,ownedByMe,modifiedTime)&orderBy=modifiedTime desc&_=${Date.now()}`,
      { headers: noCacheHeaders(token) }
    );

    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'findExistingFamilyFolderBundle' } as DriveApiError;
    }

    const data = await response.json();
    const folders: Array<{ id: string; ownedByMe?: boolean; modifiedTime?: string }> = data.files ?? [];

    for (const folder of folders) {
      const backupFileId = await this.findBackupFileInFolder(folder.id);
      if (backupFileId) {
        return {
          id: folder.id,
          backupFileId,
          ownedByMe: folder.ownedByMe === true,
          modifiedTime: folder.modifiedTime,
        };
      }
    }

    return null;
  }

  // TODO: Remove after 2026-09-01 — no users should be on old shared-Drive family mode by then.
  /**
   * @deprecated LEGACY — shared Drive folder family mode.
   * No longer called by new Firestore-backed family sync.
   * Safe to delete after confirming no existing users are on old family mode.
   */
  async findBackupFileInFolder(folderId: string): Promise<string | null> {
    const token = await this.#authService.ensureToken();
    const q = encodeURIComponent(
      `name='spenza-backup.json' and '${escapeDriveQueryValue(folderId)}' in parents and trashed=false`
    );
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&_=${Date.now()}`,
      { headers: noCacheHeaders(token) }
    );

    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'findBackupFileInFolder' } as DriveApiError;
    }

    const data = await response.json();
    const files: Array<{ id: string }> = data.files ?? [];
    return files.length > 0 ? files[0].id : null;
  }

  // TODO: Remove after 2026-09-01 — no users should be on old shared-Drive family mode by then.
  /**
   * @deprecated LEGACY — shared Drive folder family mode.
   * No longer called by new Firestore-backed family sync.
   * Safe to delete after confirming no existing users are on old family mode.
   */
  async findOrCreateReceiptsFolderInFamilyFolder(familyFolderId: string): Promise<string> {
    const token = await this.#authService.ensureToken();
    const existing = await this.findFolderInParent(token, 'Receipts', familyFolderId);
    return existing ?? this.createDriveFolder('Receipts', familyFolderId);
  }

  async createBackupFileInFolder(folderId: string): Promise<string> {
    const token = await this.#authService.ensureToken();
    const initialDocument = buildInitialDocument(new Date().toISOString());
    const boundary = 'spenza_boundary_001';
    const body = this.buildMultipartBody(
      { name: 'spenza-backup.json', parents: [folderId] },
      JSON.stringify(initialDocument),
      boundary
    );

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'createBackupFileInFolder' } as DriveApiError;
    }

    const data = await response.json();
    return data.id as string;
  }

  /**
   * Serializes document and uploads it to the backup file identified by
   * fileId. Stamps document.lastUpdated before uploading.
   */
  async writeBackupFile(fileId: string, document: BackupDocument): Promise<string | null> {
    document.lastUpdated = new Date().toISOString();

    const token = await this.#authService.ensureToken();
    const boundary = 'spenza_boundary_001';

    const metadata = JSON.stringify({});
    const content = JSON.stringify(document);

    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n` +
      `\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n` +
      `\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;

    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=modifiedTime`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'writeBackupFile' } as DriveApiError;
    }

    const data = await response.json().catch(() => null) as DriveFileMetadata | null;
    return data?.modifiedTime ?? null;
  }

  /**
   * Searches appDataFolder for spenza-config.json.
   * Returns the file's Drive resource ID, or null if not found.
   */
  async findConfigFile(): Promise<string | null> {
    const token = await this.#authService.ensureToken();
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D'spenza-config.json'&fields=files(id)&_=${Date.now()}`,
      { headers: noCacheHeaders(token) }
    );
    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'findConfigFile' } as DriveApiError;
    }
    const data = await response.json();
    const files: Array<{ id: string }> = data.files ?? [];
    return files.length > 0 ? files[0].id : null;
  }

  /**
   * Creates spenza-config.json in appDataFolder with initial config.
   * Returns the newly created file's Drive resource ID.
   */
  async createConfigFile(): Promise<string> {
    const token = await this.#authService.ensureToken();
    const config = buildInitialConfig();
    const boundary = 'spenza_boundary_001';
    const metadata = JSON.stringify({ name: 'spenza-config.json', parents: ['appDataFolder'] });
    const content = JSON.stringify(config);
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;
    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'createConfigFile' } as DriveApiError;
    }
    const data = await response.json();
    return data.id as string;
  }

  /**
   * Reads and parses spenza-config.json by file ID.
   */
  async readConfigFile(fileId: string): Promise<SpenzaConfig> {
    const token = await this.#authService.ensureToken();
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&_=${Date.now()}`,
      { headers: noCacheHeaders(token) }
    );
    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'readConfigFile' } as DriveApiError;
    }
    const rawText = await response.text();
    try {
      return JSON.parse(rawText) as SpenzaConfig;
    } catch {
      throw new DriveParseError('Failed to parse config file as JSON', rawText);
    }
  }

  /**
   * Writes updated config to spenza-config.json by file ID.
   */
  async writeConfigFile(fileId: string, config: SpenzaConfig): Promise<void> {
    config.lastUpdated = new Date().toISOString();
    const token = await this.#authService.ensureToken();
    const boundary = 'spenza_boundary_001';
    const metadata = JSON.stringify({});
    const content = JSON.stringify(config);
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'writeConfigFile' } as DriveApiError;
    }
  }

  async ensureReceiptsFolder(): Promise<string> {
    const token = await this.#authService.ensureToken();
    return this.findOrCreateReceiptsFolder(token);
  }

  getDriveFolderUrl(folderId: string): string {
    return `https://drive.google.com/drive/folders/${folderId}`;
  }

  async downloadFile(fileId: string): Promise<Blob> {
    const token = await this.#authService.ensureToken();

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&_=${Date.now()}`,
      {
        headers: noCacheHeaders(token),
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'downloadFile' } as DriveApiError;
    }

    return response.blob();
  }

  async uploadReceiptFile(
    file: File,
    entryId: string,
    expenseDate: string,
    receiptFolderId?: string | null,
  ): Promise<ExpenseReceipt> {
    const token = await this.#authService.ensureToken();
    const folderId = receiptFolderId || await this.findOrCreateReceiptsFolder(token);
    const safeName = file.name.replace(/[^\w.\- ()]/g, '_');
    const timestamp = new Date().toISOString();
    const fileName = `${expenseDate}_${entryId}_${safeName}`;
    const boundary = `spenza_receipt_${crypto.randomUUID()}`;
    const metadata = JSON.stringify({
      name: fileName,
      parents: [folderId],
      description: `Spenza receipt for expense ${entryId}`,
    });

    const body = new Blob([
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      metadata,
      '\r\n',
      `--${boundary}\r\n`,
      `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
      file,
      '\r\n',
      `--${boundary}--`,
    ], { type: `multipart/related; boundary=${boundary}` });

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw { status: response.status, message, operation: 'uploadReceiptFile' } as DriveApiError;
    }

    const data = await response.json() as {
      id: string;
      name?: string;
      mimeType?: string;
      size?: string;
      webViewLink?: string;
    };

    return {
      fileId: data.id,
      fileName: data.name ?? file.name,
      mimeType: data.mimeType ?? file.type,
      size: Number(data.size ?? file.size),
      viewUrl: data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`,
      uploadedAt: timestamp,
    };
  }

  private async findOrCreateReceiptsFolder(token: string): Promise<string> {
    const folderName = 'Spenza Receipts';
    const existing = await this.findFolderInParent(token, folderName, 'root');
    if (existing) return existing;

    return this.createDriveFolder(folderName, 'root');
  }

  private async findFolderInParent(
    token: string,
    folderName: string,
    parentId: string,
  ): Promise<string | null> {
    const q = encodeURIComponent(
      `name='${escapeDriveQueryValue(folderName)}' and mimeType='application/vnd.google-apps.folder' and '${escapeDriveQueryValue(parentId)}' in parents and trashed=false`
    );
    const findResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&_=${Date.now()}`,
      { headers: noCacheHeaders(token) }
    );

    if (!findResponse.ok) {
      const message = await findResponse.text();
      throw { status: findResponse.status, message, operation: 'findReceiptsFolder' } as DriveApiError;
    }

    const findData = await findResponse.json();
    const existingFolders: Array<{ id: string }> = findData.files ?? [];
    return existingFolders.length > 0 ? existingFolders[0].id : null;
  }

  private async createDriveFolder(folderName: string, parentId: string): Promise<string> {
    const token = await this.#authService.ensureToken();
    const createResponse = await fetch(
      'https://www.googleapis.com/drive/v3/files?fields=id',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        }),
      }
    );

    if (!createResponse.ok) {
      const message = await createResponse.text();
      throw { status: createResponse.status, message, operation: 'createReceiptsFolder' } as DriveApiError;
    }

    const createData = await createResponse.json();
    return createData.id as string;
  }
}
