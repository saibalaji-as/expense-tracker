import { Injectable, inject, signal, isDevMode } from '@angular/core';
import { AuthService } from './auth.service';
import { DriveApiError, GoogleDriveService, SpenzaConfig } from './google-drive.service';
import { StorageService } from './storage.service';

// 'hosted'   → Spenza-managed AI (Groq for insights/voice, Gemini for receipts). Default for all users.
// 'byok'     → User brings their own Groq and/or Gemini API key.
// 'disabled' → User has explicitly turned AI off in Settings.
export type AiProviderMode = 'hosted' | 'byok' | 'disabled';
export type ByokPreference = 'groq' | 'gemini' | 'both';

export interface AiSettings {
  provider: AiProviderMode;
  geminiApiKey: string | null;
  groqApiKey: string | null;
  byokPreference: ByokPreference;
}

const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'hosted',
  geminiApiKey: null,
  groqApiKey: null,
  byokPreference: 'gemini',
};

@Injectable({ providedIn: 'root' })
export class AiSettingsService {
  private readonly storageService = inject(StorageService);
  private readonly driveService = inject(GoogleDriveService);
  private readonly authService = inject(AuthService);

  private readonly localKey = 'spenza_ai_settings_private';
  private readonly configFileKey = 'spenza_config_file_id';
  private readonly insightCacheKey = 'ai_weekly_insight_cache_v1';
  private readonly insightUsageKeys = ['ai_weekly_insight_usage_v1', 'ai_weekly_insight_usage_v2'];

  readonly settings = signal<AiSettings>(DEFAULT_AI_SETTINGS);
  readonly isLoading = signal(false);
  readonly lastMessage = signal<string | null>(null);
  readonly lastError = signal<string | null>(null);

  private settingsRevision = 0;

  async load(): Promise<void> {
    const loadRevision = this.settingsRevision;
    this.isLoading.set(true);
    this.lastError.set(null);

    try {
      const local = await this.readLocal();
      if (local && loadRevision === this.settingsRevision) this.settings.set(local);

      if (this.authService.isAuthenticated()) {
        const drive = await this.readDrive();
        if (drive && loadRevision === this.settingsRevision) {
          const resolved = this.resolveLoadedSettings(local, drive);
          this.settings.set(resolved);
          await this.writeLocal(resolved);
        }
      }
    } catch (error) {
      if (isDevMode()) { console.warn('[AiSettingsService] Could not load AI settings:', error); }
      this.lastError.set('Could not load AI settings.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async save(settings: AiSettings): Promise<void> {
    const normalized = this.normalize(settings);
    this.settingsRevision++;
    this.isLoading.set(true);
    this.lastError.set(null);
    this.lastMessage.set(null);

    try {
      await this.writeLocal(normalized);
      await this.resetInsightCache();
      this.settings.set(normalized);

      if (this.authService.isAuthenticated()) {
        await this.writeDrive(normalized);
        this.lastMessage.set('AI settings saved privately to this device and your Drive config.');
      } else {
        this.lastMessage.set('AI settings saved on this device. Sign in to sync it privately with Drive.');
      }
    } catch (error) {
      console.error('[AiSettingsService] Could not save AI settings:', error);
      this.lastError.set('Could not save AI settings. Saved locally if possible.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async clearUserKey(): Promise<void> {
    await this.save({ provider: 'disabled', geminiApiKey: null, groqApiKey: null, byokPreference: 'gemini' });
  }

  async clearLocalState(): Promise<void> {
    this.settingsRevision++;
    this.settings.set(DEFAULT_AI_SETTINGS);
    this.lastMessage.set(null);
    this.lastError.set(null);
    this.isLoading.set(false);

    await Promise.all([
      this.storageService.remove(this.localKey),
      this.resetInsightCache(),
    ]);
  }

  async getActiveGeminiKey(): Promise<string | null> {
    let current = this.settings();
    const local = await this.readLocal();
    if (local) {
      current = local;
      this.settings.set(local);
    }

    return current.provider === 'byok' ? current.geminiApiKey : null;
  }

  async getActiveGroqKey(): Promise<string | null> {
    let current = this.settings();
    const local = await this.readLocal();
    if (local) {
      current = local;
      this.settings.set(local);
    }

    return current.provider === 'byok' ? current.groqApiKey : null;
  }

  isDisabled(): boolean {
    return this.settings().provider === 'disabled';
  }

  isHosted(): boolean {
    return this.settings().provider === 'hosted';
  }

  isByok(): boolean {
    return this.settings().provider === 'byok';
  }

  maskedGeminiKey(): string {
    return this.maskKey(this.settings().geminiApiKey);
  }

  maskedGroqKey(): string {
    return this.maskKey(this.settings().groqApiKey);
  }

  /** @deprecated use maskedGeminiKey() */
  maskedKey(): string {
    return this.maskedGeminiKey();
  }

  private maskKey(key: string | null): string {
    if (!key) return '';
    return key.length <= 10 ? 'Saved key' : `${key.slice(0, 6)}...${key.slice(-4)}`;
  }

  private async readLocal(): Promise<AiSettings | null> {
    const json = await this.storageService.get(this.localKey);
    if (!json) return null;

    try {
      return this.normalize(JSON.parse(json) as Partial<AiSettings>);
    } catch {
      await this.storageService.remove(this.localKey);
      return null;
    }
  }

  private async writeLocal(settings: AiSettings): Promise<void> {
    await this.storageService.set(this.localKey, JSON.stringify(settings));
  }

  private async resetInsightCache(): Promise<void> {
    await Promise.all([
      this.storageService.remove(this.insightCacheKey),
      ...this.insightUsageKeys.map((key) => this.storageService.remove(key)),
    ]);
  }

  private async readDrive(): Promise<AiSettings | null> {
    const config = await this.readConfigWithRecovery();
    return config.aiSettings ? this.normalize(config.aiSettings) : null;
  }

  private async writeDrive(settings: AiSettings): Promise<void> {
    const { fileId, config } = await this.readConfigWithIdAndRecovery().catch(async (): Promise<{ fileId: string; config: SpenzaConfig }> => ({
      fileId: await this.ensureConfigFileId(true),
      config: {
      version: '1.0',
      mode: null,
      sharedFileId: null,
      familyFolderId: null,
      ownerRole: null,
      lastUpdated: new Date().toISOString(),
      },
    }));

    await this.driveService.writeConfigFile(fileId, {
      ...config,
      aiSettings: {
        provider: settings.provider,
        // Always persist keys so switching back to 'byok' restores them
        geminiApiKey: settings.geminiApiKey,
        groqApiKey:   settings.groqApiKey,
        byokPreference: settings.byokPreference,
      },
    });
  }

  private async readConfigWithRecovery(): Promise<SpenzaConfig> {
    return (await this.readConfigWithIdAndRecovery()).config;
  }

  private async readConfigWithIdAndRecovery(): Promise<{ fileId: string; config: SpenzaConfig }> {
    const fileId = await this.ensureConfigFileId();
    try {
      return { fileId, config: await this.driveService.readConfigFile(fileId) };
    } catch (error) {
      if (!this.isNotFound(error)) throw error;

      await this.storageService.remove(this.configFileKey);
      const recoveredFileId = await this.ensureConfigFileId(true);
      return { fileId: recoveredFileId, config: await this.driveService.readConfigFile(recoveredFileId) };
    }
  }

  private async ensureConfigFileId(forceRefresh = false): Promise<string> {
    const cached = await this.storageService.get(this.configFileKey);
    if (cached && !forceRefresh) return cached;

    const existing = await this.driveService.findConfigFile();
    const fileId = existing ?? await this.driveService.createConfigFile();
    await this.storageService.set(this.configFileKey, fileId);
    return fileId;
  }

  private isNotFound(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && 'status' in error
      && (error as DriveApiError).status === 404;
  }

  private normalize(settings: { provider?: string; geminiApiKey?: string | null; groqApiKey?: string | null; byokPreference?: string }): AiSettings {
    // Migrate legacy 'user-key' → 'byok', 'default' → 'hosted'
    const provider: AiProviderMode =
      (settings.provider === 'user-key' || settings.provider === 'byok') ? 'byok' :
      settings.provider === 'disabled' ? 'disabled' :
      'hosted';

    const geminiApiKey = typeof settings.geminiApiKey === 'string'
      ? settings.geminiApiKey.trim() || null
      : null;
    const groqApiKey = typeof settings.groqApiKey === 'string'
      ? settings.groqApiKey.trim() || null
      : null;
    const byokPreference: ByokPreference =
      settings.byokPreference === 'groq' ? 'groq' :
      settings.byokPreference === 'both' ? 'both' :
      'gemini';

    return { provider, geminiApiKey, groqApiKey, byokPreference };
  }

  private resolveLoadedSettings(local: AiSettings | null, drive: AiSettings): AiSettings {
    // Merge: take provider/preference from drive, but preserve keys from local if drive lost them
    // (drive wipes keys when provider switches — local is the source of truth for keys)
    return {
      ...drive,
      geminiApiKey: drive.geminiApiKey ?? local?.geminiApiKey ?? null,
      groqApiKey:   drive.groqApiKey   ?? local?.groqApiKey   ?? null,
    };
  }
}
