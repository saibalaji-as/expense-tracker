import { Injectable, signal, isDevMode } from '@angular/core';
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
  'settings.push.description': 'Get expense reminders with quick money tips.',
  'settings.push.enable': 'Enable reminders',
  'settings.push.enableHint': 'Get notifications to log your expenses.',
  'settings.localNotifications.title': 'Local Notifications',
  'settings.localNotifications.description': 'Schedule reminders with saving tips and budget alerts on your device.',
  'settings.data.title': 'Data Management',
  'settings.data.description': 'Export your backup file or clear local cache.',
  'settings.data.exportBackupJson': 'Export backup JSON',
  'settings.receipts.title': 'Receipt Folder',
  'settings.receipts.description': 'Use one Drive folder for bills linked to expenses.',
  'settings.receipts.ready': 'Receipt folder is ready',
  'settings.receipts.notReady': 'Receipt folder is not set up yet',
  'settings.receipts.setupHint': 'Create the folder now. In family mode, share it with your partner from Google Drive.',
  'settings.receipts.shareHint': 'In family mode, open this folder in Drive and share it with your partner.',
  'settings.receipts.setup': 'Set up receipt folder',
  'settings.receipts.openFolder': 'Open folder in Drive',
  'limits.onboarding.title': 'Set your monthly income to unlock budgeting.',
  'limits.onboarding.description': 'Spenza needs income before expense tracking so limits, savings, and insights are calculated correctly.',
  'dashboard.insights.hybridBadge': 'Hybrid',
  'dashboard.insights.geminiDeepDiveTitle': 'Gemini deep dives',
  'dashboard.insights.geminiDeepDiveDescription': 'Anomalies, what-if cuts, seasonal pressure, and budget intent checks.',
  'dashboard.insights.geminiLoading': 'Looking for deeper patterns across recent spending...',
  'dashboard.insights.aiButton': 'Ask AI',
  'dashboard.insights.aiButtonLoading': 'Thinking...',
  'dashboard.insights.aiButtonReview': 'View AI',
  'dashboard.insights.cachedStatus': 'Showing the saved AI response because your expense data has not changed.',
  'dashboard.insights.savedFallbackStatus': 'Showing the latest saved AI response to avoid another AI call right now.',
  'dashboard.insights.freshStatus': 'Fresh AI deep dives generated for the latest expense data.',
  'dashboard.insights.unavailableTitle': 'AI could not generate deep dives.',
  'dashboard.insights.unavailableStatus': 'AI deep dives are unavailable. Check AI settings or try again later.',
  'dashboard.insights.rateLimitTitle': 'Gemini credit limit reached.',
  'dashboard.insights.rateLimitStatus': 'Your Gemini API credits or daily AI limit has been reached. Try again after {time}.',
  'dashboard.insights.apiKeyRequiredTitle': 'Add your Gemini API key to unlock AI insights.',
  'dashboard.insights.apiKeyRequiredDetail': 'Your key enables Gemini deep dives, receipt smart-fill, and voice expense smart-fill. Spenza keeps core tracking on-device, and uses Gemini only when you ask for AI features.',
  'dashboard.insights.openAiSettings': 'Open AI settings',
  'daily.clearComment': 'Clear comment',
  'daily.voice.stop': 'Stop',
  'daily.voiceExpense.title': 'Log with your voice',
  'daily.voiceExpense.geminiBadge': 'Gemini smart fill',
  'daily.voiceExpense.hint': 'Say the full expense. Example: "Spent 450 on groceries yesterday."',
  'daily.voiceExpense.action': 'Speak expense',
  'daily.voiceExpense.listening': 'Listening for expense details...',
  'daily.commentVoice.action': 'Dictate comment',
  'daily.commentVoice.listening': 'Listening for your comment...',
  'daily.voiceUnsupportedTitle': 'Voice input is not available.',
  'daily.voiceUnsupported': 'Voice recognition is not supported in your browser. Please use Chrome or Edge.',
  'daily.voiceParsing': 'Understanding your expense...',
  'daily.voiceTranscriptSaved': 'Voice note added.',
  'daily.voiceAiUnavailable': 'AI could not fill the form, so the transcript was saved in comments.',
  'daily.voiceFilledTitle': 'Expense filled from voice.',
  'daily.voiceFilledDetail': 'Review the category, amount, and date before saving.',
  'daily.saving': 'Saving...',
  'daily.receipt.label': 'Bill / receipt',
  'daily.receipt.empty': 'No bill attached',
  'daily.receipt.hint': 'Attach an image or PDF up to 10 MB',
  'daily.receipt.scan': 'Scan',
  'daily.receipt.attach': 'Attach',
  'daily.receipt.change': 'Change',
  'daily.receipt.remove': 'Remove receipt',
  'daily.receipt.keepExisting': 'Existing bill will stay attached',
  'daily.receipt.uploading': 'Uploading bill...',
  'daily.receipt.uploadFailed': 'Could not upload the bill. Please try again.',
  'daily.receipt.invalidType': 'Please attach an image or PDF file.',
  'daily.receipt.tooLarge': 'Bill file must be 10 MB or smaller.',
  'daily.receipt.offline': 'Go online to upload a bill.',
  'daily.receipt.view': 'View bill',
  'daily.receipt.extracting': 'Reading bill and finding expense details...',
  'daily.receipt.smartFill.title': 'Smart fill suggestions',
  'daily.receipt.smartFill.apply': 'Apply',
  'daily.receipt.smartFill.applied': 'Suggestions applied. Please review before saving.',
  'daily.receipt.smartFill.notFound': 'Not found',
  'daily.receipt.smartFill.lowConfidence': 'Please confirm',
  'daily.receipt.smartFill.possibleTotals': 'Possible totals',
  'daily.receipt.smartFill.itemsFound': 'Items found',
  'daily.receipt.smartFill.splitItems': 'Split by items',
  'daily.receipt.smartFill.geminiBadge': 'Gemini AI',
  'daily.receipt.smartFill.localBadge': 'On-device OCR',
  'daily.receipt.smartFill.fallbackHint': 'Gemini was unavailable for this bill, so Spenza used on-device OCR.',
  'daily.receipt.smartFill.unreadable': 'Could not read this bill clearly. You can still save the bill and enter details manually.',
  'daily.receipt.smartFill.failed': 'Smart extraction could not read this bill. You can still enter details manually.',
  'daily.receipt.split.title': 'Split bill',
  'daily.receipt.split.subtitle': '{{count}} categories from receipt items',
  'daily.receipt.split.category': 'Category',
  'daily.receipt.split.amount': 'Amount',
  'daily.receipt.split.total': 'Total',
  'daily.receipt.split.split': 'Split',
  'daily.receipt.split.notePlaceholder': 'Item or note for this split',
  'daily.receipt.split.addCategory': 'Add category',
  'daily.receipt.editor.title': 'Adjust bill image',
  'daily.receipt.editor.subtitle': 'Crop, rotate, and enhance before scanning',
  'daily.receipt.editor.rotate': 'Rotate',
  'daily.receipt.editor.enhance': 'Enhance',
  'daily.receipt.editor.useOriginal': 'Use original',
  'daily.receipt.editor.useEdited': 'Use edited',
  'daily.receipt.editor.cropHint': 'Drag corners or edges to crop · Drag inside to move',
  'daily.receipt.split.logSplit': 'Log split bill',
  'daily.receipt.split.removeRow': 'Remove split row',
  'daily.receipt.split.totalMismatch': 'Split total must match bill total.',
  'daily.receipt.split.adjustmentComment': 'Tax / bill adjustment',
  'family.ownerPaywall.title': 'Pro Required',
  'family.ownerPaywall.description': 'Creating a family backup requires Spenza Pro. Upgrade to sync expenses with your partner.',
  'family.ownerPaywall.upgrade': 'Upgrade to Pro',
  'family.ownerPaywall.back': 'Go Back',
  'family.partner.slotTaken': 'This family backup already has a partner connected. Only one partner per backup is supported.',
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
      (text, [paramKey, value]) => text
        .replaceAll(`{{${paramKey}}}`, String(value))
        .replaceAll(`{${paramKey}}`, String(value)),
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
      if (isDevMode()) { console.warn('[I18nService] Falling back to built-in English translations:', error); }
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
