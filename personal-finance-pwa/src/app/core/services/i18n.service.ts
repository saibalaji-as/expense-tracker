import { Injectable, signal } from '@angular/core';
import { StorageService } from './storage.service';

export type AppLanguage = 'en' | 'ta' | 'hi';

export interface LanguageOption {
  code: AppLanguage;
  label: string;
  nativeLabel: string;
  locale: string;
  speechLang: string;
}

const STORAGE_KEY = 'spenza_language';

const FALLBACK_TRANSLATIONS: Record<string, string> = {
  'settings.appearance.title': 'Appearance',
  'settings.appearance.description': 'Switch between the playful light mode and premium glass dark mode.',
  'settings.language.title': 'Language',
  'settings.language.description': 'Choose the app language and voice input language.',
  'settings.language.appLanguage': 'App language',
  'settings.language.voiceInput': 'Voice input',
  'settings.language.voiceInputHint': 'Mic transcription follows the selected language.',
  'settings.currency.title': 'Currency',
  'settings.currency.description': 'Choose how money is displayed across Spenza.',
  'settings.currency.selected': 'Selected',
  'settings.currency.preview': 'Preview',
  'currency.INR.name': 'Indian Rupee',
  'currency.INR.region': 'India · default for household budgets',
  'currency.INR.hint': 'Best when your income and expenses are in INR.',
  'currency.USD.name': 'US Dollar',
  'currency.USD.region': 'United States · global reference currency',
  'currency.USD.hint': 'Use for dollar budgets, travel spends, or US accounts.',
  'currency.AED.name': 'UAE Dirham',
  'currency.AED.region': 'United Arab Emirates · Gulf region',
  'currency.AED.hint': 'Use for UAE income, local bills, and AED spending.',
  'settings.backup.title': 'Google Drive Backup',
  'settings.push.title': 'Push Notifications',
  'settings.push.description': 'Get reminders to log your expenses.',
  'settings.push.enable': 'Enable reminders',
  'settings.push.enableHint': 'Get notifications to log your expenses.',
  'settings.localNotifications.title': 'Local Notifications',
  'settings.localNotifications.description': 'Schedule reminders and budget alerts on your device.',
  'settings.data.title': 'Data Management',
  'settings.data.description': 'Export your data or clear local cache.',
  'settings.data.exportCsv': 'Export to CSV',
  'daily.voiceUnsupported': 'Voice recognition is not supported in your browser. Please use Chrome or Edge.',
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly languageOptions: readonly LanguageOption[] = [
    { code: 'en', label: 'English', nativeLabel: 'English', locale: 'en-IN', speechLang: 'en-IN' },
    { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', locale: 'ta-IN', speechLang: 'ta-IN' },
    { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', locale: 'hi-IN', speechLang: 'hi-IN' },
  ];

  readonly language = signal<AppLanguage>('en');
  readonly translations = signal<Record<string, string>>(FALLBACK_TRANSLATIONS);

  readonly initialized: Promise<void>;

  constructor(private readonly storageService: StorageService) {
    this.initialized = this.initialize();
  }

  async setLanguage(language: AppLanguage): Promise<void> {
    this.language.set(language);
    await this.storageService.set(STORAGE_KEY, language);
    await this.loadTranslations(language);
    document.documentElement.lang = language;
  }

  t(key: string, params?: Record<string, string | number>): string {
    const template = this.translations()[key] ?? FALLBACK_TRANSLATIONS[key] ?? key;
    if (!params) return template;

    return Object.entries(params).reduce(
      (text, [paramKey, value]) => text.replaceAll(`{{${paramKey}}}`, String(value)),
      template
    );
  }

  locale(): string {
    return this.currentOption().locale;
  }

  speechRecognitionLang(): string {
    return this.currentOption().speechLang;
  }

  private async initialize(): Promise<void> {
    const stored = await this.storageService.get(STORAGE_KEY);
    const language = this.isLanguage(stored) ? stored : 'en';
    this.language.set(language);
    await this.loadTranslations(language);
    document.documentElement.lang = language;
  }

  private async loadTranslations(language: AppLanguage): Promise<void> {
    try {
      const response = await fetch(`/assets/i18n/${language}.json`, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Failed to load ${language} translations`);
      const loaded = await response.json() as Record<string, string>;
      this.translations.set({ ...FALLBACK_TRANSLATIONS, ...loaded });
    } catch (error) {
      console.warn('[I18nService] Falling back to built-in English translations:', error);
      this.translations.set(FALLBACK_TRANSLATIONS);
    }
  }

  private currentOption(): LanguageOption {
    return this.languageOptions.find((option) => option.code === this.language()) ?? this.languageOptions[0];
  }

  private isLanguage(value: string | null): value is AppLanguage {
    return value === 'en' || value === 'ta' || value === 'hi';
  }
}
