import { Injectable, inject } from '@angular/core';
import { ExpenseEntry, ExpenseLimit } from '../models';
import { AuthService } from './auth.service';

// ─── Data Models ──────────────────────────────────────────────────────────────

export interface BackupDocument {
  version: string;
  lastUpdated: string;
  metadata: {
    monthlyIncome: number;
    currency: string;
  };
  expenses: ExpenseEntry[];
  limits: ExpenseLimit[];
}

// ─── Error Types ──────────────────────────────────────────────────────────────

export interface DriveApiError {
  status: number;
  message: string;
  operation: string;
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
  };
}

// ─── Config Document ──────────────────────────────────────────────────────────

export interface SpenzaConfig {
  version: string;
  mode: 'single' | 'family' | null;
  sharedFileId: string | null;
  ownerRole: 'owner' | 'partner' | null;
  lastUpdated: string;
}

export function buildInitialConfig(): SpenzaConfig {
  return {
    version: '1.0',
    mode: null,
    sharedFileId: null,
    ownerRole: null,
    lastUpdated: new Date().toISOString(),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class GoogleDriveService {
  readonly #authService = inject(AuthService);

  /**
   * Queries Drive for an existing spenza-backup.json in appDataFolder.
   * Returns the file's Drive resource ID, or null if not found.
   */
  async findBackupFile(): Promise<string | null> {
    const token = await this.#authService.ensureToken();

    const response = await fetch(
      "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D'spenza-backup.json'&fields=files(id)",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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

  /**
   * Searches My Drive root for an existing spenza-backup.json.
   * Returns the file's Drive resource ID, or null if not found.
   */
  async findBackupFileInMyDrive(): Promise<string | null> {
    const token = await this.#authService.ensureToken();

    const q = encodeURIComponent("name='spenza-backup.json' and 'root' in parents and trashed=false");
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
      {
        headers: { Authorization: `Bearer ${token}` },
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

  /**
   * Serializes document and uploads it to the backup file identified by
   * fileId. Stamps document.lastUpdated before uploading.
   */
  async writeBackupFile(fileId: string, document: BackupDocument): Promise<void> {
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
      throw { status: response.status, message, operation: 'writeBackupFile' } as DriveApiError;
    }
  }

  /**
   * Searches appDataFolder for spenza-config.json.
   * Returns the file's Drive resource ID, or null if not found.
   */
  async findConfigFile(): Promise<string | null> {
    const token = await this.#authService.ensureToken();
    const response = await fetch(
      "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D'spenza-config.json'&fields=files(id)",
      { headers: { Authorization: `Bearer ${token}` } }
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
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
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
}
