import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { DriveApiError, GoogleDriveService, SpenzaConfig } from './google-drive.service';

export type BackupMode = 'single' | 'family';
export type OwnerRole = 'owner' | 'partner';

// Local storage cache keys (fast startup, not source of truth)
const CACHE_KEY_MODE = 'spenza_backup_mode';
const CACHE_KEY_SHARED_FILE_ID = 'spenza_shared_file_id';
const CACHE_KEY_FAMILY_FOLDER_ID = 'spenza_family_folder_id';
const CACHE_KEY_OWNER_ROLE = 'spenza_owner_role';
const CACHE_KEY_CONFIG_FILE_ID = 'spenza_config_file_id';
const DRIVE_CONFIG_CACHE_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class BackupModeService {
  private readonly storageService = inject(StorageService);
  private readonly driveService = inject(GoogleDriveService);

  readonly mode = signal<BackupMode | null>(null);
  readonly sharedFileId = signal<string | null>(null);
  readonly familyFolderId = signal<string | null>(null);
  readonly ownerRole = signal<OwnerRole | null>(null);

  // Drive file ID of spenza-config.json (cached locally)
  #configFileId: string | null = null;
  #driveLoadPromise: Promise<void> | null = null;
  #lastDriveLoadAt = 0;

  /**
   * Resolves once local cache has been read.
   * Call loadFromDrive() after sign-in to get the authoritative config.
   */
  readonly initialized: Promise<void>;

  constructor() {
    this.initialized = this.#loadFromCache();
  }

  async #loadFromCache(): Promise<void> {
    const [mode, sharedFileId, familyFolderId, ownerRole, configFileId] = await Promise.all([
      this.storageService.get(CACHE_KEY_MODE),
      this.storageService.get(CACHE_KEY_SHARED_FILE_ID),
      this.storageService.get(CACHE_KEY_FAMILY_FOLDER_ID),
      this.storageService.get(CACHE_KEY_OWNER_ROLE),
      this.storageService.get(CACHE_KEY_CONFIG_FILE_ID),
    ]);
    if (mode === 'single' || mode === 'family') this.mode.set(mode);
    if (sharedFileId) this.sharedFileId.set(sharedFileId);
    if (familyFolderId) this.familyFolderId.set(familyFolderId);
    if (ownerRole === 'owner' || ownerRole === 'partner') this.ownerRole.set(ownerRole);
    if (configFileId) this.#configFileId = configFileId;
  }

  /**
   * Loads config from Drive after sign-in.
   * Creates the config file if it doesn't exist yet.
   * Updates signals and local cache from the Drive config.
   */
  async loadFromDrive(force = false): Promise<void> {
    const now = Date.now();
    if (!force && this.#lastDriveLoadAt > 0 && now - this.#lastDriveLoadAt < DRIVE_CONFIG_CACHE_MS) {
      return;
    }

    if (this.#driveLoadPromise) {
      return this.#driveLoadPromise;
    }

    this.#driveLoadPromise = this.#loadFromDriveNow()
      .finally(() => {
        this.#lastDriveLoadAt = Date.now();
        this.#driveLoadPromise = null;
      });

    return this.#driveLoadPromise;
  }

  async #loadFromDriveNow(): Promise<void> {
    try {
      const { config } = await this.#readConfigWithRecovery();

      if (config.mode === null || (config.mode === 'family' && !config.sharedFileId)) {
        const recoveredFamily = await this.driveService.findExistingFamilyFolderBundle();
        if (recoveredFamily) {
          console.info('[BackupModeService] Recovered family setup from existing Spenza Family folder.');
          await this.setFamilyConfig(
            recoveredFamily.backupFileId,
            recoveredFamily.id,
            recoveredFamily.ownedByMe ? 'owner' : 'partner'
          );
          return;
        }
      }

      // Update signals and cache from Drive config
      const mode = config.mode;
      const sharedFileId = config.sharedFileId;
      const familyFolderId = config.familyFolderId ?? null;
      const ownerRole = config.ownerRole;

      if (mode === 'single' || mode === 'family') {
        this.mode.set(mode);
        await this.storageService.set(CACHE_KEY_MODE, mode);
      } else {
        this.mode.set(null);
        await this.storageService.remove(CACHE_KEY_MODE);
      }

      if (sharedFileId) {
        this.sharedFileId.set(sharedFileId);
        await this.storageService.set(CACHE_KEY_SHARED_FILE_ID, sharedFileId);
      } else {
        this.sharedFileId.set(null);
        await this.storageService.remove(CACHE_KEY_SHARED_FILE_ID);
      }

      if (familyFolderId) {
        this.familyFolderId.set(familyFolderId);
        await this.storageService.set(CACHE_KEY_FAMILY_FOLDER_ID, familyFolderId);
      } else {
        this.familyFolderId.set(null);
        await this.storageService.remove(CACHE_KEY_FAMILY_FOLDER_ID);
      }

      if (ownerRole === 'owner' || ownerRole === 'partner') {
        this.ownerRole.set(ownerRole);
        await this.storageService.set(CACHE_KEY_OWNER_ROLE, ownerRole);
      } else {
        this.ownerRole.set(null);
        await this.storageService.remove(CACHE_KEY_OWNER_ROLE);
      }
    } catch (err) {
      console.error('[BackupModeService] loadFromDrive failed:', err);
      // Fall back to cached values — don't throw, app can still work
    }
  }

  /**
   * Persists a config update to Drive and updates local cache.
   */
  async #saveConfig(updates: Partial<SpenzaConfig>): Promise<void> {
    try {
      const { fileId, config: existing } = await this.#readConfigWithRecovery();
      const updated: SpenzaConfig = {
        ...existing,
        version: '1.0',
        mode: this.mode(),
        sharedFileId: this.sharedFileId(),
        familyFolderId: this.familyFolderId(),
        ownerRole: this.ownerRole(),
        lastUpdated: new Date().toISOString(),
        ...updates,
      };
      await this.driveService.writeConfigFile(fileId, updated);
    } catch (err) {
      console.error('[BackupModeService] Failed to save config to Drive:', err);
    }
  }

  async #readConfigWithRecovery(): Promise<{ fileId: string; config: SpenzaConfig }> {
    const fileId = await this.#ensureConfigFileId();
    try {
      return { fileId, config: await this.driveService.readConfigFile(fileId) };
    } catch (error) {
      if (!this.#isNotFound(error)) throw error;

      console.info('[BackupModeService] Cached Drive config ID was not found. Re-discovering config file.');
      this.#configFileId = null;
      await this.storageService.remove(CACHE_KEY_CONFIG_FILE_ID);

      const recoveredFileId = await this.#ensureConfigFileId();
      return { fileId: recoveredFileId, config: await this.driveService.readConfigFile(recoveredFileId) };
    }
  }

  async #ensureConfigFileId(): Promise<string> {
    let fileId = this.#configFileId ?? await this.driveService.findConfigFile();
    if (!fileId) {
      fileId = await this.driveService.createConfigFile();
    }
    this.#configFileId = fileId;
    await this.storageService.set(CACHE_KEY_CONFIG_FILE_ID, fileId);
    return fileId;
  }

  #isNotFound(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && 'status' in error
      && (error as DriveApiError).status === 404;
  }

  async setMode(mode: BackupMode): Promise<void> {
    this.mode.set(mode);
    await this.storageService.set(CACHE_KEY_MODE, mode);
    await this.#saveConfig({ mode });
  }

  async setSharedFileId(fileId: string): Promise<void> {
    this.sharedFileId.set(fileId);
    await this.storageService.set(CACHE_KEY_SHARED_FILE_ID, fileId);
    await this.#saveConfig({ sharedFileId: fileId });
  }

  async setFamilyFolderId(folderId: string): Promise<void> {
    this.familyFolderId.set(folderId);
    await this.storageService.set(CACHE_KEY_FAMILY_FOLDER_ID, folderId);
    await this.#saveConfig({ familyFolderId: folderId });
  }

  async setOwnerRole(role: OwnerRole): Promise<void> {
    this.ownerRole.set(role);
    await this.storageService.set(CACHE_KEY_OWNER_ROLE, role);
    await this.#saveConfig({ ownerRole: role });
  }

  async setFamilyConfig(fileId: string, folderId: string | null, role: OwnerRole): Promise<void> {
    this.mode.set('family');
    this.sharedFileId.set(fileId);
    this.familyFolderId.set(folderId);
    this.ownerRole.set(role);

    await Promise.all([
      this.storageService.set(CACHE_KEY_MODE, 'family'),
      this.storageService.set(CACHE_KEY_SHARED_FILE_ID, fileId),
      folderId
        ? this.storageService.set(CACHE_KEY_FAMILY_FOLDER_ID, folderId)
        : this.storageService.remove(CACHE_KEY_FAMILY_FOLDER_ID),
      this.storageService.set(CACHE_KEY_OWNER_ROLE, role),
    ]);

    await this.#saveConfig({
      mode: 'family',
      sharedFileId: fileId,
      familyFolderId: folderId,
      ownerRole: role,
    });
    this.#lastDriveLoadAt = Date.now();
  }

  async clearFamilyState(): Promise<void> {
    this.sharedFileId.set(null);
    this.familyFolderId.set(null);
    this.ownerRole.set(null);
    await Promise.all([
      this.storageService.remove(CACHE_KEY_SHARED_FILE_ID),
      this.storageService.remove(CACHE_KEY_FAMILY_FOLDER_ID),
      this.storageService.remove(CACHE_KEY_OWNER_ROLE),
    ]);
    await this.#saveConfig({ sharedFileId: null, familyFolderId: null, ownerRole: null });
  }

  async clearAll(): Promise<void> {
    this.mode.set(null);
    this.sharedFileId.set(null);
    this.familyFolderId.set(null);
    this.ownerRole.set(null);
    await Promise.all([
      this.storageService.remove(CACHE_KEY_MODE),
      this.storageService.remove(CACHE_KEY_SHARED_FILE_ID),
      this.storageService.remove(CACHE_KEY_FAMILY_FOLDER_ID),
      this.storageService.remove(CACHE_KEY_OWNER_ROLE),
    ]);
    await this.#saveConfig({ mode: null, sharedFileId: null, familyFolderId: null, ownerRole: null });
    this.#lastDriveLoadAt = 0;
  }

  getMode(): BackupMode | null { return this.mode(); }
  getSharedFileId(): string | null { return this.sharedFileId(); }
  getFamilyFolderId(): string | null { return this.familyFolderId(); }
  getOwnerRole(): OwnerRole | null { return this.ownerRole(); }
}
