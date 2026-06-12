import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal, isDevMode } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

interface ExpenseWidgetPlugin {
  refresh(): Promise<void>;
  isSupported(): Promise<{ supported: boolean }>;
  requestPin(): Promise<{ supported: boolean }>;
}
const ExpenseWidget = registerPlugin<ExpenseWidgetPlugin>('ExpenseWidget');
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { NotificationService } from '../../core/services/notification.service';
import { LocalNotificationService } from '../../core/services/local-notification.service';
import { FcmService } from '../../core/services/fcm.service';
import { SyncService } from '../../core/services/sync.service';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { ThemeService, AppPalette } from '../../core/services/theme.service';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { BackupModeService } from '../../core/services/backup-mode.service';
import { GoogleDriveService, BackupDocument } from '../../core/services/google-drive.service';
import { StorageService } from '../../core/services/storage.service';
import { AppLanguage, I18nService } from '../../core/services/i18n.service';
import { AppCurrency, CurrencyService } from '../../core/services/currency.service';
import { AiProviderMode, AiSettingsService } from '../../core/services/ai-settings.service';
import { SpendNotificationAccessService } from '../../core/services/spend-notification-access.service';
import { UserFeedbackService } from '../../core/services/user-feedback.service';
import { DailyExpenseDraftService } from '../../core/services/daily-expense-draft.service';
import { PaymentService } from '../../core/services/payment.service';
import { METADATA_MONTHLY_INCOME } from '../../core/models';
import { NotificationPreferences, DEFAULT_NOTIFICATION_PREFERENCES } from '../../core/models/notification-preferences.model';
import { FamilyDocument } from '../../core/models/family-sync.model';
import { FamilyApiService } from '../../core/services/family-api.service';
import { FamilySyncService } from '../../core/services/family-sync.service';
import { firebaseConfig } from '../../core/config/firebase.config';
import { ClearableInputDirective, SectionCardComponent, ModalComponent, NotificationDisclosureComponent } from '../../shared/components';
import { TranslatePipe } from '../../shared/pipes';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Check,
  Download,
  Trash2,
  Bell,
  Sun,
  Moon,
  Monitor,
  ArrowDownToLine,
  Copy,
  RefreshCw,
  ExternalLink,
  ArrowLeftRight,
  KeyRound,
  Sparkles,
  Pencil,
  Languages,
  Mic,
  XCircle,
} from 'lucide-angular';

// Extend the Window interface to include the beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, ClearableInputDirective, SectionCardComponent, ModalComponent, NotificationDisclosureComponent, LucideAngularModule, TranslatePipe],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ Check, Download, Trash2, Bell, Sun, Moon, Monitor, ArrowDownToLine, Copy, RefreshCw, ExternalLink, ArrowLeftRight, KeyRound, Sparkles, Pencil, Languages, Mic, XCircle }),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-1 gap-6">
      <!-- Page header -->
      <div>
        <h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{{ 'settings.title' | translate }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'settings.description' | translate }}</p>
      </div>

      <!-- Spenza Pro -->
      @if (subscriptionService.isPro()) {
        <div class="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 px-5 py-4">
          <div class="flex items-center gap-3">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-white text-lg">💎</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-foreground">Spenza Pro — Active</p>
              @if (subscriptionService.status().expiresAt) {
                @if (subscriptionService.status().cancelPending) {
                  <p class="text-xs font-medium text-amber-600 dark:text-amber-400">
                    Cancels {{ subscriptionService.status().expiresAt | date:'mediumDate' }} · Access until then
                  </p>
                } @else {
                  <p class="text-xs text-muted-foreground">
                    Renews {{ subscriptionService.status().expiresAt | date:'mediumDate' }}
                  </p>
                }
              }
            </div>
            <span class="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Pro</span>
          </div>
          @if (!subscriptionService.status().cancelPending) {
            <div class="mt-3 border-t border-primary/15 pt-3">
              <button
                type="button"
                (click)="showCancelConfirm.set(true)"
                [disabled]="cancelling()"
                class="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <lucide-icon [img]="xCircleIcon" class="h-3.5 w-3.5" />
                Cancel subscription
              </button>
            </div>
          }
        </div>
      } @else {
        <div class="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 via-white to-primary/10 p-5 dark:border-primary/40 dark:from-primary/10 dark:to-primary/5">
          <div class="flex items-start gap-4">
            <span class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground text-xl shadow-lg">💸</span>
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-gray-900 dark:text-white">Upgrade to Spenza Pro</p>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Advanced insights · Family sync · Receipt scanner · Priority support</p>
              <div class="mt-3 flex flex-wrap gap-2">
                @if (isNativePlatform) {
                  <button
                    type="button"
                    (click)="openSubscribePage()"
                    [disabled]="isOpeningSubscribePage()"
                    class="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    @if (isOpeningSubscribePage()) {
                      <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                    } @else {
                      ✨
                    }
                    Manage Subscription
                  </button>
                } @else {
                  <a
                    routerLink="/subscribe"
                    class="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
                  >
                    ✨ Upgrade — ₹499/month
                  </a>
                  <a
                    routerLink="/subscribe"
                    class="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-white px-4 py-2 text-sm font-semibold text-primary hover:border-primary/60 transition-colors dark:bg-transparent dark:border-primary/40 dark:text-primary"
                  >
                    ₹3,999/year — Save 33%
                  </a>
                }
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Appearance -->
      <app-section-card
        [title]="'settings.appearance.title' | translate"
        [description]="'settings.appearance.description' | translate"
      >
        <div class="grid gap-3 sm:grid-cols-3">
          @for (opt of themeOptions; track opt.value) {
            <button
              type="button"
              (click)="onThemeChange(opt.value)"
              [attr.aria-label]="opt.label + ' theme'"
              [attr.aria-pressed]="themeService.theme() === opt.value"
              [class]="
                'group relative flex items-center gap-3 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
                (themeService.theme() === opt.value
                  ? 'border-primary bg-accent shadow-glow'
                  : 'border-border bg-card/40 hover:border-primary/40')
              "
            >
              <span
                [class]="
                  'grid h-10 w-10 place-items-center rounded-xl transition-all ' +
                  (themeService.theme() === opt.value
                    ? 'gradient-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground')
                "
              >
                <lucide-icon [img]="opt.icon" class="h-5 w-5" />
              </span>
              <div>
                <p class="text-sm font-semibold">{{ opt.label }}</p>
                <p class="text-xs text-muted-foreground">{{ opt.desc }}</p>
              </div>
              @if (themeService.theme() === opt.value) {
                <span class="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                  <lucide-icon [img]="checkIcon" class="h-3 w-3" />
                </span>
              }
            </button>
          }
        </div>

        <!-- Color Palette -->
        <div class="mt-5">
          <p class="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Color Palette</p>
          <div class="flex flex-wrap gap-3">
            @for (opt of paletteOptions; track opt.value) {
              <button
                type="button"
                (click)="onPaletteChange(opt.value)"
                [attr.aria-label]="opt.label + ' palette'"
                [attr.aria-pressed]="themeService.palette() === opt.value"
                [class]="
                  'group relative flex flex-col items-center gap-2 rounded-2xl border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
                  (themeService.palette() === opt.value
                    ? 'border-primary bg-accent shadow-glow'
                    : 'border-border bg-card/40 hover:border-primary/40')
                "
              >
                <span
                  class="h-8 w-8 rounded-full border-2 border-white/30 shadow-md"
                  [style.background-color]="themeService.effectiveTheme() === 'dark' ? opt.dark : opt.light"
                ></span>
                <span class="text-xs font-medium text-foreground">{{ opt.label }}</span>
                @if (themeService.palette() === opt.value) {
                  <span class="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground">
                    <lucide-icon [img]="checkIcon" class="h-2.5 w-2.5" />
                  </span>
                }
              </button>
            }
          </div>
        </div>
      </app-section-card>

      <!-- Language -->
      <app-section-card
        [title]="'settings.language.title' | translate"
        [description]="'settings.language.description' | translate"
      >
        <div class="space-y-4">
          <div>
            <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {{ 'settings.language.appLanguage' | translate }}
            </p>
            <div class="mt-3 grid gap-3 md:grid-cols-3">
              @for (language of i18n.languageOptions; track language.code) {
                <button
                  type="button"
                  (click)="onLanguageChange(language.code)"
                  [attr.aria-pressed]="i18n.language() === language.code"
                  [class]="languageOptionClass(language.code)"
                >
                  <span
                    [class]="
                      'grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-black transition-all ' +
                      (i18n.language() === language.code
                        ? 'gradient-primary text-primary-foreground shadow-glow'
                        : 'bg-muted text-muted-foreground group-hover:text-primary')
                    "
                  >
                    {{ language.code.toUpperCase() }}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-semibold text-foreground">{{ language.nativeLabel }}</span>
                    <span class="mt-0.5 block truncate text-xs text-muted-foreground">{{ language.label }}</span>
                  </span>
                  @if (i18n.language() === language.code) {
                    <span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                      <lucide-icon [img]="checkIcon" class="h-3.5 w-3.5" />
                    </span>
                  }
                </button>
              }
            </div>
          </div>

          <div class="overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-primary-glow/10 to-success/10 p-0.5 shadow-sm">
            <div class="rounded-[calc(1rem-2px)] border border-white/40 bg-background/75 p-4 backdrop-blur dark:border-white/10 dark:bg-card/60">
              <div class="flex items-start gap-3">
                <span class="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <lucide-icon name="mic" class="h-5 w-5" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {{ 'settings.language.voiceInput' | translate }}
                  </p>
                  <p class="mt-1 text-sm font-semibold text-foreground">{{ currentSpeechLanguageLabel() }}</p>
                  <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {{ 'settings.language.voiceInputHint' | translate }}
                  </p>
                </div>
                <span class="hidden rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary sm:inline-flex">
                  {{ i18n.speechRecognitionLang() }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </app-section-card>

      <!-- Currency -->
      <app-section-card
        [title]="'settings.currency.title' | translate"
        [description]="'settings.currency.description' | translate"
      >
        <div class="grid gap-3 lg:grid-cols-3">
          @for (option of currencyService.currencyOptions; track option.code) {
            <button
              type="button"
              (click)="onCurrencyChange(option.code)"
              [attr.aria-pressed]="currencyService.currency() === option.code"
              [class]="
                'group relative overflow-hidden rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
                (currencyService.currency() === option.code
                  ? 'border-primary bg-accent shadow-glow'
                  : 'border-border bg-card/40 hover:border-primary/40 hover:bg-card/70')
              "
            >
              <div class="absolute inset-x-0 top-0 h-1 gradient-primary opacity-0 transition-opacity group-hover:opacity-60"
                   [class.opacity-100]="currencyService.currency() === option.code"></div>
              <div class="flex items-start gap-3">
                <span
                  [class]="
                    'grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl font-black transition-all ' +
                    (currencyService.currency() === option.code
                      ? 'gradient-primary text-primary-foreground shadow-glow'
                      : 'bg-muted text-foreground')
                  "
                >
                  {{ option.symbol }}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-semibold">{{ option.code }}</p>
                    @if (currencyService.currency() === option.code) {
                      <span class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <lucide-icon [img]="checkIcon" class="h-3 w-3" />
                        {{ 'settings.currency.selected' | translate }}
                      </span>
                    }
                  </div>
                  <p class="mt-0.5 text-xs font-medium text-foreground">{{ option.nameKey | translate }}</p>
                  <p class="mt-1 text-[11px] text-muted-foreground">{{ option.regionKey | translate }}</p>
                </div>
              </div>
              <div class="mt-4 rounded-xl border border-border/70 bg-background/45 px-3 py-2">
                <p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {{ 'settings.currency.preview' | translate }}
                </p>
                <p class="mt-1 text-sm font-semibold tabular-nums">{{ currencyPreview(option.code) }}</p>
                <p class="mt-1 text-[11px] text-muted-foreground">{{ option.hintKey | translate }}</p>
              </div>
            </button>
          }
        </div>
      </app-section-card>

      <!-- AI Insights -->
      <app-section-card
        [title]="'settings.ai.title' | translate"
        [description]="'settings.ai.description' | translate"
      >
        <div class="space-y-4">
          <!-- Mode selector -->
          <div class="grid gap-3 md:grid-cols-3">
            <button
              type="button"
              (click)="onAiProviderChange('hosted')"
              [attr.aria-pressed]="aiProviderMode() === 'hosted'"
              [class]="aiProviderButtonClass('hosted')"
            >
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <lucide-icon name="sparkles" class="h-5 w-5" />
              </span>
              <span>
                <span class="block text-sm font-semibold">{{ 'settings.ai.hosted.title' | translate }}</span>
                <span class="mt-1 block text-xs text-muted-foreground">{{ 'settings.ai.hosted.description' | translate }}</span>
              </span>
            </button>

            <button
              type="button"
              (click)="onAiProviderChange('byok')"
              [attr.aria-pressed]="aiProviderMode() === 'byok'"
              [class]="aiProviderButtonClass('byok')"
            >
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <lucide-icon name="key-round" class="h-5 w-5" />
              </span>
              <span>
                <span class="block text-sm font-semibold">{{ 'settings.ai.byok.title' | translate }}</span>
                <span class="mt-1 block text-xs text-muted-foreground">{{ 'settings.ai.byok.description' | translate }}</span>
              </span>
            </button>

            <button
              type="button"
              (click)="onAiProviderChange('disabled')"
              [attr.aria-pressed]="aiProviderMode() === 'disabled'"
              [class]="aiProviderButtonClass('disabled')"
            >
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                <lucide-icon [img]="monitorIcon" class="h-5 w-5" />
              </span>
              <span>
                <span class="block text-sm font-semibold">{{ 'settings.ai.disabled.title' | translate }}</span>
                <span class="mt-1 block text-xs text-muted-foreground">{{ 'settings.ai.disabled.description' | translate }}</span>
              </span>
            </button>
          </div>

          <!-- BYOK status panel (read-only) -->
          @if (aiProviderMode() === 'byok') {
            <div class="rounded-2xl border border-border bg-card/40 p-4">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div class="space-y-3 min-w-0">
                  <!-- Key status badges -->
                  <div class="flex flex-wrap gap-2">
                    <div class="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
                      [class]="aiSettingsService.settings().geminiApiKey
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'border-border bg-muted/50 text-muted-foreground'">
                      <span class="h-1.5 w-1.5 rounded-full"
                        [class]="aiSettingsService.settings().geminiApiKey ? 'bg-emerald-500' : 'bg-muted-foreground/50'"></span>
                      Gemini
                      @if (aiSettingsService.settings().geminiApiKey) {
                        <span class="opacity-60">· {{ aiSettingsService.maskedGeminiKey() }}</span>
                      } @else {
                        <span class="opacity-60">· Not set</span>
                      }
                    </div>
                    <div class="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
                      [class]="aiSettingsService.settings().groqApiKey
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'border-border bg-muted/50 text-muted-foreground'">
                      <span class="h-1.5 w-1.5 rounded-full"
                        [class]="aiSettingsService.settings().groqApiKey ? 'bg-emerald-500' : 'bg-muted-foreground/50'"></span>
                      Groq
                      @if (aiSettingsService.settings().groqApiKey) {
                        <span class="opacity-60">· {{ aiSettingsService.maskedGroqKey() }}</span>
                      } @else {
                        <span class="opacity-60">· Not set</span>
                      }
                    </div>
                  </div>
                  <!-- Active preference badge -->
                  <div class="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{{ 'settings.ai.preference.label' | translate }}:</span>
                    @if (aiSettingsService.settings().byokPreference === 'groq') {
                      <span class="font-semibold text-foreground">⚡ {{ 'settings.ai.preference.groq' | translate }}</span>
                    } @else if (aiSettingsService.settings().byokPreference === 'gemini') {
                      <span class="font-semibold text-foreground">✦ {{ 'settings.ai.preference.gemini' | translate }}</span>
                    } @else {
                      <span class="font-semibold text-foreground">⚡ + ✦ {{ 'settings.ai.preference.both' | translate }}</span>
                    }
                  </div>
                </div>
                <!-- Manage button -->
                <button
                  type="button"
                  (click)="onOpenAiKeysDialog()"
                  class="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
                >
                  <lucide-icon [img]="editIcon" class="h-4 w-4" />
                  {{ 'settings.ai.manageKeys' | translate }}
                </button>
              </div>
            </div>
          }

          @if (aiSettingsService.lastMessage()) {
            <p class="text-sm text-emerald-600">{{ aiSettingsService.lastMessage() }}</p>
          }
          @if (aiSettingsService.lastError()) {
            <p class="text-sm text-destructive">{{ aiSettingsService.lastError() }}</p>
          }
        </div>
      </app-section-card>

      <!-- Manage AI Keys dialog -->
      <app-modal
        [title]="'settings.ai.manageKeys' | translate"
        [isOpen]="isAiKeysDialogOpen()"
        [showActions]="false"
        (cancelled)="isAiKeysDialogOpen.set(false)"
      >
        <div class="space-y-5">
          <!-- Gemini key -->
          <div>
            <label for="dialog-gemini-key" class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 text-[10px] font-bold">G</span>
              {{ 'settings.ai.apiKey' | translate }}
            </label>
            <div class="mt-2 flex gap-2">
              <input appClearable
                id="dialog-gemini-key"
                type="password"
                autocomplete="off"
                [(ngModel)]="dialogGeminiKey"
                [placeholder]="aiSettingsService.maskedGeminiKey() || ('settings.ai.apiKeyPlaceholder' | translate)"
                class="flex-1 rounded-2xl border border-border bg-background/70 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 rounded-2xl border border-border px-3 py-2.5 text-xs font-semibold hover:border-primary/50 transition-colors whitespace-nowrap"
              >
                <lucide-icon [img]="externalLinkIcon" class="h-3.5 w-3.5" />
                {{ 'settings.ai.getKey' | translate }}
              </a>
            </div>
            @if (aiSettingsService.settings().geminiApiKey) {
              <p class="mt-1.5 text-xs text-muted-foreground">Saved: {{ aiSettingsService.maskedGeminiKey() }} · <button type="button" (click)="dialogGeminiKey = '__CLEAR__'" class="text-destructive hover:underline">Clear</button></p>
            }
          </div>

          <!-- Groq key -->
          <div>
            <label for="dialog-groq-key" class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 text-[10px]">⚡</span>
              {{ 'settings.ai.groqKey' | translate }}
            </label>
            <div class="mt-2 flex gap-2">
              <input appClearable
                id="dialog-groq-key"
                type="password"
                autocomplete="off"
                [(ngModel)]="dialogGroqKey"
                [placeholder]="aiSettingsService.maskedGroqKey() || ('settings.ai.groqKeyPlaceholder' | translate)"
                class="flex-1 rounded-2xl border border-border bg-background/70 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 rounded-2xl border border-border px-3 py-2.5 text-xs font-semibold hover:border-primary/50 transition-colors whitespace-nowrap"
              >
                <lucide-icon [img]="externalLinkIcon" class="h-3.5 w-3.5" />
                {{ 'settings.ai.getGroqKey' | translate }}
              </a>
            </div>
            @if (aiSettingsService.settings().groqApiKey) {
              <p class="mt-1.5 text-xs text-muted-foreground">Saved: {{ aiSettingsService.maskedGroqKey() }} · <button type="button" (click)="dialogGroqKey = '__CLEAR__'" class="text-destructive hover:underline">Clear</button></p>
            }
          </div>

          <!-- Preference selector -->
          <div>
            <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ 'settings.ai.preference.label' | translate }}</p>
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                (click)="dialogPreference = 'groq'"
                [class]="dialogPreference === 'groq'
                  ? 'flex-1 rounded-2xl border border-primary bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary transition-all'
                  : 'flex-1 rounded-2xl border border-border px-3 py-2.5 text-sm font-medium text-muted-foreground hover:border-primary/40 transition-all'"
              >
                ⚡ {{ 'settings.ai.preference.groq' | translate }}
              </button>
              <button
                type="button"
                (click)="dialogPreference = 'gemini'"
                [class]="dialogPreference === 'gemini'
                  ? 'flex-1 rounded-2xl border border-primary bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary transition-all'
                  : 'flex-1 rounded-2xl border border-border px-3 py-2.5 text-sm font-medium text-muted-foreground hover:border-primary/40 transition-all'"
              >
                ✦ {{ 'settings.ai.preference.gemini' | translate }}
              </button>
              <button
                type="button"
                (click)="dialogPreference = 'both'"
                [class]="dialogPreference === 'both'
                  ? 'flex-1 rounded-2xl border border-primary bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary transition-all'
                  : 'flex-1 rounded-2xl border border-border px-3 py-2.5 text-sm font-medium text-muted-foreground hover:border-primary/40 transition-all'"
              >
                ↔ {{ 'settings.ai.preference.both' | translate }}
              </button>
            </div>
            @if (dialogPreference === 'both') {
              <p class="mt-2 flex items-start gap-1.5 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <lucide-icon name="info" class="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {{ 'settings.ai.preference.bothHint' | translate }}
              </p>
            }
          </div>

          <p class="text-xs text-muted-foreground">{{ 'settings.ai.privateHint' | translate }}</p>

          <!-- Dialog actions -->
          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              (click)="isAiKeysDialogOpen.set(false)"
              class="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-accent transition-colors"
            >
              {{ 'common.cancel' | translate }}
            </button>
            <button
              type="button"
              (click)="onSaveAiKeys()"
              [disabled]="aiSettingsService.isLoading()"
              class="inline-flex items-center gap-2 rounded-2xl gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              <lucide-icon [img]="checkIcon" class="h-4 w-4" />
              {{ 'settings.ai.save' | translate }}
            </button>
          </div>
        </div>
      </app-modal>

      <!-- Google Drive Backup -->
      <app-section-card [title]="'settings.backup.title' | translate">

        <!-- ── Single User mode ─────────────────────────────────────────────── -->
        @if (backupModeService.mode() === 'single' || backupModeService.mode() === null) {
          <!-- Action slot: status pill -->
          @if (expenseStore.driveFileId()) {
            <span action class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style="background-color: color-mix(in oklab, var(--success) 15%, transparent); color: var(--success);">
              <span class="relative grid h-2 w-2 place-items-center">
                <span class="absolute inset-0 animate-ping rounded-full bg-current opacity-60"></span>
                <span class="relative h-2 w-2 rounded-full bg-current"></span>
              </span>
              Connected
            </span>
          } @else {
            <span action class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold bg-muted text-muted-foreground">
              Setting up…
            </span>
          }

          <p class="text-sm font-medium">Single User Backup</p>
          @if (expenseStore.driveFileId()) {
            <p class="text-sm text-muted-foreground">Data synced to Google Drive</p>
          } @else {
            <p class="text-sm text-muted-foreground">Connecting to Google Drive…</p>
          }
        }

        <!-- ── Old shared-Drive family mode — migration prompt ─────────────── -->
        @if (backupModeService.mode() === 'family' && !backupModeService.firestoreFamilyId()) {
          <div class="mt-3 rounded-xl border border-amber-400/60 bg-amber-50/60 dark:bg-amber-900/20 p-4">
            <p class="text-sm font-medium text-amber-800 dark:text-amber-200">Your family setup needs to be updated to continue syncing with your partner.</p>
            <button
              type="button"
              routerLink="/family-setup"
              class="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-primary-foreground gradient-primary shadow-glow"
            >
              Update now
            </button>
            <p class="mt-2 text-xs text-muted-foreground">This takes less than a minute. Both you and your partner will need to reconnect.</p>
          </div>
        }

        <!-- ── Family mode — Owner ──────────────────────────────────────────── -->
        @if (backupModeService.mode() === 'family' && backupModeService.firestoreFamilyId() && backupModeService.ownerRole() === 'owner') {
          <p class="text-sm font-medium">Family mode — {{ 'settings.family.owner' | translate }}</p>

          @if (familyDoc()?.partnerEmail) {
            <p class="mt-1 text-sm text-muted-foreground">
              {{ 'settings.family.partner' | translate }}: {{ familyDoc()!.partnerEmail }}
            </p>
          } @else {
            <p class="mt-1 text-sm text-muted-foreground">{{ 'settings.family.noPartner' | translate }}</p>
          }

          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              (click)="onGenerateInvite()"
              [disabled]="isGeneratingInvite()"
              class="inline-flex items-center gap-2 rounded-xl border border-border bg-card/40 px-4 py-2.5 text-xs font-medium hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              @if (isGeneratingInvite()) {
                <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
              } @else {
                <lucide-icon [img]="refreshCwIcon" class="h-4 w-4" />
              }
              {{ 'settings.family.generateInvite' | translate }}
            </button>

            <button
              type="button"
              (click)="onLeaveFamily()"
              class="inline-flex items-center gap-2 rounded-xl border border-destructive/40 px-4 py-2.5 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              Leave family mode
            </button>
          </div>
        }

        <!-- ── Family mode — Partner ────────────────────────────────────────── -->
        @if (backupModeService.mode() === 'family' && backupModeService.firestoreFamilyId() && backupModeService.ownerRole() === 'partner') {
          <p class="text-sm font-medium">Family mode — {{ 'settings.family.partner' | translate }}</p>

          @if (familyDoc()?.ownerEmail) {
            <p class="mt-1 text-sm text-muted-foreground">
              {{ 'settings.family.owner' | translate }}: {{ familyDoc()!.ownerEmail }}
            </p>
          }

          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              (click)="onLeaveFamily()"
              class="inline-flex items-center gap-2 rounded-xl border border-destructive/40 px-4 py-2.5 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              Leave family mode
            </button>
          </div>
        }

        <!-- ── Sign out / Sign in ───────────────────────────────────────────── -->
        <div class="mt-3 flex flex-wrap items-center gap-2">
          @if (authService.isAuthenticated()) {
            <button
              type="button"
              (click)="onSignOut()"
              [disabled]="isSigningOut()"
              class="inline-flex items-center gap-2 justify-center rounded-xl border border-border px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              @if (isSigningOut()) {
                <span class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
              }
              {{ 'settings.action.signOut' | translate }}
            </button>
          } @else {
            <button
              type="button"
              (click)="onSignIn()"
              [disabled]="isSigningIn()"
              class="inline-flex items-center gap-2 justify-center rounded-xl px-4 py-2.5 text-xs font-semibold text-primary-foreground gradient-primary shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              @if (isSigningIn()) {
                <span class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
              }
              {{ 'settings.action.signInGoogle' | translate }}
            </button>
          }

          <!-- ── Switch backup mode (always shown) ───────────────────────────── -->
          <button
            type="button"
            (click)="onSwitchBackupMode()"
            class="inline-flex items-center gap-2 rounded-xl border border-border bg-card/40 px-4 py-2.5 text-xs font-medium hover:border-primary/40"
          >
            <lucide-icon [img]="arrowLeftRightIcon" class="h-4 w-4" />
            {{ 'settings.action.switchBackupMode' | translate }}
          </button>
        </div>

      </app-section-card>

      <!-- Receipt folder card removed: receipts now live in the private Drive
           appDataFolder (drive.appdata scope) — no user-visible folder to set up. -->

      <!-- Import from Google Sheets -->
      <app-section-card [title]="'settings.import.title' | translate" [description]="'settings.import.description' | translate">
        <p class="text-xs text-muted-foreground mb-3">
          Paste your Google Spreadsheet ID below. Found in the URL:
          <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit</code>
        </p>

        <div class="flex flex-col gap-2 sm:flex-row">
          <input appClearable
            type="text"
            [(ngModel)]="importSheetId"
            [placeholder]="'settings.import.placeholder' | translate"
            class="flex-1 rounded-2xl border border-border bg-card/60 px-4 py-2.5 font-mono text-xs text-foreground outline-none focus:border-primary"
            aria-label="Google Spreadsheet ID for import"
          />
          <button
            type="button"
            (click)="onImportFromSheets()"
            [disabled]="isImporting() || !importSheetId.trim()"
            class="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-primary-foreground gradient-primary shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            @if (isImporting()) {
              <span class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
              {{ 'settings.import.importing' | translate }}
            } @else {
              <lucide-icon [img]="importIcon" class="h-4 w-4" />
              {{ 'settings.import.button' | translate }}
            }
          </button>
        </div>

        @if (importMessage()) {
          <p
            class="mt-2 text-xs"
            [style.color]="importError() ? 'var(--destructive)' : 'var(--success)'"
            role="status"
          >
            {{ importMessage() }}
          </p>
        }
      </app-section-card>

      <!-- Push Notifications -->
      <app-section-card class="relative z-50" [title]="'settings.push.title' | translate" [description]="'settings.push.description' | translate">
        <div class="space-y-4">

          <!-- Enable/Disable Toggle -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                <lucide-icon [img]="bellIcon" class="h-5 w-5" />
              </span>
              <div>
                <p class="text-sm font-medium">{{ 'settings.push.enable' | translate }}</p>
                <p class="text-xs text-muted-foreground">{{ 'settings.push.enableHint' | translate }}</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              [attr.aria-checked]="notificationService.isEnabled()"
              (click)="onNotificationToggleClick()"
              [class]="
                'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
                (notificationService.isEnabled() ? 'bg-primary' : 'bg-muted')
              "
              aria-label="Toggle reminders"
            >
              <span
                [class]="
                  'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ' +
                  (notificationService.isEnabled() ? 'translate-x-5' : 'translate-x-0')
                "
              ></span>
            </button>
          </div>

        </div>
      </app-section-card>

      <!-- Local Notifications -->
      <app-section-card [title]="'settings.localNotifications.title' | translate" [description]="'settings.localNotifications.description' | translate">
        <div class="space-y-4">

          <!-- Permission Request Button (shown if permission not granted) -->
          @if (localNotificationService.permissionStatus() === 'default') {
            <button
              type="button"
              (click)="onRequestNotificationPermission()"
              class="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-primary-foreground gradient-primary shadow-glow"
            >
              <lucide-icon [img]="bellIcon" class="h-4 w-4" />
              {{ 'settings.localNotifications.requestPermission' | translate }}
            </button>
          }

          <!-- Permission Denied Message -->
          @if (localNotificationService.permissionStatus() === 'denied') {
            <p class="text-xs text-destructive">
              Notification permission denied. Enable notifications in your device settings to use this feature.
            </p>
          }

          @if (spendNotificationAccess.supported()) {
            <div class="rounded-2xl border border-border bg-card/40 p-4">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="text-sm font-medium">{{ 'settings.spendPrompts.title' | translate }}</p>
                  <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {{ 'settings.spendPrompts.description' | translate }}
                  </p>
                  <p
                    [class]="
                      'mt-2 text-xs font-medium ' +
                      (spendNotificationAccess.permissionGranted() ? 'text-success' : 'text-amber-600 dark:text-amber-400')
                    "
                  >
                    {{
                      (spendNotificationAccess.permissionGranted()
                        ? 'settings.spendPrompts.accessGranted'
                        : 'settings.spendPrompts.accessNeeded') | translate
                    }}
                  </p>
                </div>
                @if (subscriptionService.isPro()) {
                  <button
                    type="button"
                    role="switch"
                    [attr.aria-checked]="spendNotificationAccess.promptEnabled()"
                    (click)="onSpendPromptToggle()"
                    [disabled]="spendNotificationAccess.isLoading()"
                    [class]="
                      'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ' +
                      (spendNotificationAccess.promptEnabled() ? 'bg-primary' : 'bg-muted')
                    "
                    aria-label="Toggle spend prompts"
                  >
                    <span
                      [class]="
                        'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ' +
                        (spendNotificationAccess.promptEnabled() ? 'translate-x-5' : 'translate-x-0')
                      "
                    ></span>
                  </button>
                } @else {
                  <div class="flex items-center gap-2">
                    <span class="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary dark:bg-primary/20 dark:text-primary">Pro</span>
                    <button
                      type="button"
                      routerLink="/subscribe"
                      class="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-muted opacity-50"
                      aria-label="Upgrade to Pro to enable spend prompts"
                    >
                      <span class="pointer-events-none block h-5 w-5 translate-x-0 rounded-full bg-white shadow-lg ring-0"></span>
                    </button>
                  </div>
                }
              </div>

              <div class="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  (click)="onOpenSpendNotificationAccess()"
                  class="inline-flex items-center gap-2 rounded-xl border border-border bg-background/60 px-4 py-2.5 text-sm font-medium hover:border-primary/40"
                >
                  <lucide-icon [img]="externalLinkIcon" class="h-4 w-4" />
                  {{ 'settings.spendPrompts.openSettings' | translate }}
                </button>
                <button
                  type="button"
                  (click)="onRefreshSpendNotificationAccess()"
                  class="inline-flex items-center gap-2 rounded-xl border border-border bg-background/60 px-4 py-2.5 text-sm font-medium hover:border-primary/40"
                >
                  <lucide-icon [img]="refreshCwIcon" class="h-4 w-4" />
                  {{ 'settings.spendPrompts.refresh' | translate }}
                </button>
              </div>
            </div>
          }

          <!-- Daily Reminder Toggle -->
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">{{ 'settings.local.dailyReminder' | translate }}</p>
              <p class="text-xs text-muted-foreground">
                {{ 'settings.local.dailyReminderHint' | translate }}
              </p>
              <p class="text-xs text-muted-foreground">Required for reliable daily expense reminders</p>
            </div>
            <button
              type="button"
              role="switch"
              [attr.aria-checked]="notificationPrefs().dailyReminderEnabled"
              (click)="onDailyReminderToggle()"
              [disabled]="localNotificationService.permissionStatus() === 'denied'"
              [class]="
                'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ' +
                (notificationPrefs().dailyReminderEnabled ? 'bg-primary' : 'bg-muted')
              "
              aria-label="Toggle daily reminder"
            >
              <span
                [class]="
                  'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ' +
                  (notificationPrefs().dailyReminderEnabled ? 'translate-x-5' : 'translate-x-0')
                "
              ></span>
            </button>
          </div>

          <!-- Time Picker (shown when daily reminder enabled) -->
          @if (notificationPrefs().dailyReminderEnabled) {
            <div class="mt-3">
              <label class="text-xs font-medium text-muted-foreground">Reminder Time</label>
              <input appClearable
                type="time"
                [value]="formatTime(notificationPrefs().reminderHour, notificationPrefs().reminderMinute)"
                (change)="onReminderTimeChange($event)"
                class="mt-1 w-full rounded-2xl border border-border bg-card/60 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                aria-label="Daily reminder time"
              />
            </div>
          }

          <!-- Budget Warnings Toggle -->
          @if (subscriptionService.isPro()) {
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">{{ 'settings.local.budgetWarnings' | translate }}</p>
                <p class="text-xs text-muted-foreground">
                  {{ 'settings.local.budgetWarningsHint' | translate }}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                [attr.aria-checked]="notificationPrefs().budgetWarningsEnabled"
                (click)="onBudgetWarningsToggle()"
                [disabled]="localNotificationService.permissionStatus() === 'denied'"
                [class]="
                  'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ' +
                  (notificationPrefs().budgetWarningsEnabled ? 'bg-primary' : 'bg-muted')
                "
                aria-label="Toggle budget warnings"
              >
                <span
                  [class]="
                    'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ' +
                    (notificationPrefs().budgetWarningsEnabled ? 'translate-x-5' : 'translate-x-0')
                  "
                ></span>
              </button>
            </div>
          } @else {
            <div class="flex items-center justify-between cursor-pointer" routerLink="/subscribe">
              <div>
                <div class="flex items-center gap-2">
                  <p class="text-sm font-medium">{{ 'settings.local.budgetWarnings' | translate }}</p>
                  <span class="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary dark:bg-primary/20 dark:text-primary">Pro</span>
                </div>
                <p class="text-xs text-muted-foreground">
                  {{ 'settings.local.budgetWarningsHint' | translate }}
                </p>
              </div>
              <div class="pointer-events-none opacity-50">
                <div class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent bg-muted">
                  <span class="pointer-events-none block h-5 w-5 translate-x-0 rounded-full bg-white shadow-lg ring-0"></span>
                </div>
              </div>
            </div>
          }

          <!-- Test Notification Button (for debugging) -->
          @if (localNotificationService.permissionStatus() === 'granted') {
            <div class="mt-4 pt-4 border-t border-border">
              <button
                type="button"
                (click)="onTestNotification()"
                class="inline-flex items-center gap-2 rounded-xl border border-border bg-card/40 px-4 py-2.5 text-sm font-medium hover:border-primary/40"
              >
                <lucide-icon [img]="bellIcon" class="h-4 w-4" />
                {{ 'settings.localNotifications.test' | translate }}
              </button>
              <p class="mt-2 text-xs text-muted-foreground">
                Click to test if notifications are working. A test notification will appear in 10 seconds.
              </p>
            </div>
          }

        </div>
      </app-section-card>

      <!-- Data Management -->
      <app-section-card  [title]="'settings.data.title' | translate" [description]="'settings.data.description' | translate">
        <button
          type="button"
          (click)="onExportBackupJson()"
          class="inline-flex items-center gap-2 rounded-xl border border-border bg-card/40 px-4 py-2.5 text-sm font-medium hover:border-primary/40"
        >
          <lucide-icon [img]="downloadIcon" class="h-4 w-4" />
          {{ 'settings.data.exportBackupJson' | translate }}
        </button>

        <input
          #jsonRestoreInput
          type="file"
          accept="application/json,.json"
          class="hidden"
          (change)="onRestoreJsonSelected($event)"
        />

        <button
          type="button"
          (click)="jsonRestoreInput.click()"
          [disabled]="isRestoringJson()"
          class="ml-2 inline-flex items-center gap-2 rounded-xl border border-border bg-card/40 px-4 py-2.5 text-sm font-medium hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          @if (isRestoringJson()) {
            <span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
          } @else {
            <lucide-icon [img]="importIcon" class="h-4 w-4" />
          }
          Restore JSON Backup
        </button>

        <p class="mt-2 text-xs text-muted-foreground">
          Restores a local <code class="rounded bg-muted px-1 py-0.5">spenza-backup.json</code> file into the active Drive backup.
        </p>

        @if (restoreJsonMessage()) {
          <p
            class="mt-2 text-sm"
            [style.color]="restoreJsonError() ? 'var(--destructive)' : 'var(--success)'"
            [attr.role]="restoreJsonError() ? 'alert' : 'status'"
          >
            {{ restoreJsonMessage() }}
          </p>
        }

        <!-- Danger zone -->
        <div class="mt-5 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <p class="text-xs text-muted-foreground">
            Removes all locally cached data and the offline queue. This does not delete data from Google Drive.
          </p>
          <button
            type="button"
            (click)="openClearModal()"
            class="mt-3 inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground shadow transition-all hover:opacity-95"
          >
            <lucide-icon [img]="trash2Icon" class="h-4 w-4" />
            Clear Local Data
          </button>
        </div>

        <div class="mt-4 rounded-2xl border border-destructive bg-destructive/10 p-4">
          <p class="text-sm font-semibold text-destructive">Delete Spenza Account Data</p>
          <p class="mt-1 text-xs text-muted-foreground">
            Testing reset: permanently deletes Spenza-created Drive files and folders, clears this device, cancels local reminders, and signs out.
          </p>
          <button
            type="button"
            (click)="openDeleteAccountWarning()"
            [disabled]="isDeletingAccount()"
            class="mt-3 inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground shadow transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <lucide-icon [img]="trash2Icon" class="h-4 w-4" />
            Delete Account Data
          </button>
          @if (deleteAccountError()) {
            <p class="mt-2 text-xs text-destructive" role="alert">{{ deleteAccountError() }}</p>
          }
        </div>

        @if (clearSuccessMessage()) {
          <p class="mt-3 text-sm text-center" style="color: var(--success)" role="status">
            {{ clearSuccessMessage() }}
          </p>
        }
      </app-section-card>

      <!-- Legal -->
      <app-section-card [title]="'settings.legal.title' | translate">
        <div class="space-y-2">
          <button
            type="button"
            (click)="openPrivacyPolicy()"
            class="flex w-full items-center gap-3 rounded-xl border border-border bg-card/40 px-4 py-3 text-left text-sm font-medium hover:border-primary/40"
          >
            <lucide-icon [img]="externalLinkIcon" class="h-4 w-4 shrink-0 text-muted-foreground" />
            {{ 'settings.privacyPolicy' | translate }}
          </button>
          <button
            type="button"
            (click)="openTerms()"
            class="flex w-full items-center gap-3 rounded-xl border border-border bg-card/40 px-4 py-3 text-left text-sm font-medium hover:border-primary/40"
          >
            <lucide-icon [img]="externalLinkIcon" class="h-4 w-4 shrink-0 text-muted-foreground" />
            {{ 'settings.terms' | translate }}
          </button>
        </div>
      </app-section-card>

      @if (!isProduction) {
        <div style="border: 2px dashed orange; padding: 16px; border-radius: 12px; margin-top: 24px;">
          <p style="font-size: 12px; font-weight: 600; color: orange;">DEV ONLY — Subscription Debug</p>
          <p style="font-size: 11px; color: var(--color-text-secondary); margin: 4px 0 12px;">
            Tier: {{ subscriptionService.status().tier }} |
            Active: {{ subscriptionService.status().isActive }} |
            Loaded: {{ subscriptionService.loaded() }} |
            Expires: {{ subscriptionService.status().expiresAt | date:'short' }}
          </p>
          <button (click)="devForceRefreshSubscription()"
            style="padding: 8px 16px; border: 1px solid orange; border-radius: 8px; font-size: 12px; cursor: pointer;">
            Force refresh subscription from Firestore
          </button>
          <button (click)="devClearSubscriptionCache()"
            style="padding: 8px 16px; border: 1px solid red; border-radius: 8px; font-size: 12px; cursor: pointer; margin-left: 8px;">
            Reset to free (clear cache)
          </button>
        </div>
      }
    </div>

    <!-- Cancel subscription confirmation modal -->
    <app-modal
      title="Cancel subscription?"
      [isOpen]="showCancelConfirm()"
      [showActions]="false"
      (cancelled)="showCancelConfirm.set(false)"
    >
      <p class="text-sm text-muted-foreground">
        Your Pro access continues until
        <strong>{{ subscriptionService.status().expiresAt | date:'mediumDate' }}</strong>.
        After that date, your subscription will not renew and your account will move to the free plan.
      </p>
      <div class="mt-6 flex justify-end gap-3">
        <button
          type="button"
          (click)="showCancelConfirm.set(false)"
          class="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
        >
          Keep Pro
        </button>
        <button
          type="button"
          (click)="cancelSubscription()"
          [disabled]="cancelling()"
          class="rounded-xl border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          @if (cancelling()) {
            <span class="inline-flex items-center gap-2">
              <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
              Cancelling…
            </span>
          } @else {
            Cancel subscription
          }
        </button>
      </div>
    </app-modal>

    <!-- Clear Local Data confirmation modal -->
    <app-modal
      [title]="'settings.clear.title' | translate"
      [isOpen]="isClearModalOpen()"
      (confirmed)="onClearConfirmed()"
      (cancelled)="onClearCancelled()"
    >
      <p class="text-sm text-gray-700">
        This will remove all locally cached expense entries and the offline sync queue. Data already
        synced to Google Drive will not be affected. Are you sure?
      </p>
    </app-modal>

    @if (isDeleteAccountWarningOpen()) {
      <div class="fixed inset-0 z-40 bg-black/60" aria-hidden="true"></div>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Delete Spenza account data"
        class="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-lg -translate-y-1/2 rounded-2xl border border-destructive bg-card p-6 shadow-2xl"
      >
        <h2 class="text-lg font-semibold text-destructive">Delete all Spenza account data?</h2>
        <div class="mt-4 space-y-2 text-sm text-muted-foreground">
          <p>This is permanent. Spenza will delete every Drive item it can identify as created by Spenza:</p>
          <p>spenza-config.json, spenza-backup.json, Spenza Family folders, Receipts folders, and saved receipt files inside those folders.</p>
          <p>If this account is only a partner on someone else's shared folder, Google Drive may refuse deleting the owner's folder.</p>
        </div>

        <div class="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          @if (deleteAccountCountdown() > 0) {
            <p class="text-sm font-semibold text-destructive">
              Deletion starts in {{ deleteAccountCountdown() }} seconds.
            </p>
            <p class="mt-1 text-xs text-muted-foreground">Close this warning to cancel.</p>
          } @else {
            <p class="text-sm font-semibold text-destructive">Deleting Spenza data...</p>
          }
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            (click)="cancelDeleteAccountWarning()"
            [disabled]="isDeletingAccount()"
            class="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            (click)="deleteAccountNow()"
            [disabled]="isDeletingAccount()"
            class="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            Delete now
          </button>
        </div>
      </div>
    }

    <!-- Switch backup mode — primary confirmation modal -->
    <app-modal
      [title]="'settings.switch.title' | translate"
      [isOpen]="isSwitchModeModalOpen()"
      (confirmed)="onSwitchModeConfirmed()"
      (cancelled)="onSwitchModeCancelled()"
    >
      <p class="text-sm text-gray-700">
        {{ switchModePrimaryMessage() }}
      </p>
      <div class="mt-3 space-y-2 text-xs text-gray-600">
        @for (item of switchModeChecklist(); track item) {
          <p>{{ item }}</p>
        }
      </div>
    </app-modal>

    <!-- Switch backup mode — Owner secondary warning modal -->
    <app-modal
      [title]="'settings.partnerWarning.title' | translate"
      [isOpen]="isOwnerSwitchWarningOpen()"
      (confirmed)="onOwnerSwitchWarningConfirmed()"
      (cancelled)="onOwnerSwitchWarningCancelled()"
    >
      <p class="text-sm text-gray-700">
        Your partner can still access the shared family Drive folder/file until you remove their access in Google Drive. Existing shared data is not deleted by this app.
      </p>
      @if (backupModeService.familyFolderId() || backupModeService.sharedFileId()) {
        <a
          [href]="familyDriveUrl()"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <lucide-icon [img]="externalLinkIcon" class="h-3.5 w-3.5" />
          Open file in Google Drive
        </a>
      }
    </app-modal>

    <!-- Generate invite code modal -->
    <app-modal
      [title]="'settings.family.inviteGenerated' | translate"
      [isOpen]="!!generatedInviteCode()"
      [showActions]="false"
      (cancelled)="generatedInviteCode.set(null); inviteCodeExpiry.set(null)"
    >
      <p class="text-xs text-muted-foreground mb-3">{{ 'settings.family.inviteExpiry' | translate }}</p>
      <div class="flex items-center gap-2">
        <input
          type="text"
          [value]="generatedInviteCode() ?? ''"
          readonly
          aria-label="Invite code"
          class="flex-1 rounded-2xl border border-border bg-muted/40 px-4 py-2.5 font-mono text-sm text-foreground outline-none cursor-default tracking-widest"
        />
        <button
          type="button"
          (click)="onCopyInviteCode()"
          aria-label="Copy invite code"
          class="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card/40 px-3 py-2.5 text-xs font-medium hover:border-primary/40"
        >
          <lucide-icon [img]="copyIcon" class="h-4 w-4" />
          Copy
        </button>
      </div>
      <div class="mt-4 flex justify-end">
        <button
          type="button"
          (click)="generatedInviteCode.set(null); inviteCodeExpiry.set(null)"
          class="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
        >
          Done
        </button>
      </div>
    </app-modal>

    <!-- Leave family mode confirmation modal -->
    <app-modal
      title="Leave family mode?"
      [isOpen]="isLeaveFamilyModalOpen()"
      [showActions]="false"
      (cancelled)="isLeaveFamilyModalOpen.set(false)"
    >
      <p class="text-sm text-muted-foreground">
        @if (backupModeService.ownerRole() === 'owner') {
          This will dissolve the family group. Your partner will lose access. Your expense data will be merged into your private backup.
        } @else {
          You will leave the family group. Your expense history will be merged into your private backup.
        }
      </p>
      <div class="mt-6 flex justify-end gap-3">
        <button
          type="button"
          (click)="isLeaveFamilyModalOpen.set(false)"
          [disabled]="isLeavingFamily()"
          class="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="button"
          (click)="onLeaveFamilyConfirmed()"
          [disabled]="isLeavingFamily()"
          class="rounded-xl border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          @if (isLeavingFamily()) {
            <span class="inline-flex items-center gap-2">
              <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
              Leaving…
            </span>
          } @else {
            Leave family mode
          }
        </button>
      </div>
    </app-modal>

    <!-- Notification access prominent disclosure (shown before opening Android settings) -->
    @if (showNotifDisclosure()) {
      <app-notification-disclosure
        (allow)="onDisclosureAllow()"
        (deny)="onDisclosureDeny()"
      />
    }

    <!-- Rotate shared file — confirmation modal — DISABLED (use Switch Backup Mode instead) -->
    <!--
    <app-modal
      title="Rotate Shared File"
      [isOpen]="isRotateFileModalOpen()"
      (confirmed)="onRotateFileConfirmed()"
      (cancelled)="onRotateFileCancelled()"
    >
      <p class="text-sm text-gray-700">
        This will create a new shared backup file and copy all your current data to it. Your partner will lose access to the old file. You will need to share the new File ID with them. Continue?
      </p>
    </app-modal>
    -->
  `,
})
export class SettingsComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  readonly subscriptionService = inject(SubscriptionService);
  readonly notificationService = inject(NotificationService);
  readonly localNotificationService = inject(LocalNotificationService);
  readonly fcmService = inject(FcmService);
  readonly syncService = inject(SyncService);
  readonly expenseStore = inject(ExpenseStore);
  readonly themeService = inject(ThemeService);
  private readonly sheetsService = inject(GoogleSheetsService);
  readonly backupModeService = inject(BackupModeService);
  private readonly googleDriveService = inject(GoogleDriveService);
  private readonly storageService = inject(StorageService);
  private readonly router = inject(Router);
  readonly i18n = inject(I18nService);
  readonly currencyService = inject(CurrencyService);
  readonly aiSettingsService = inject(AiSettingsService);
  readonly spendNotificationAccess = inject(SpendNotificationAccessService);
  private readonly feedback = inject(UserFeedbackService);
  private readonly dailyExpenseDraftService = inject(DailyExpenseDraftService);
  private readonly payService = inject(PaymentService);
  private readonly familyApiService = inject(FamilyApiService);
  private readonly familySyncService = inject(FamilySyncService);

  readonly isNativePlatform = Capacitor.isNativePlatform();
  readonly isProduction = environment.production;

  // ─── Theme options ────────────────────────────────────────────────────────────
  readonly themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun, desc: 'Playful & colorful' },
    { value: 'dark' as const, label: 'Dark', icon: Moon, desc: 'Premium glassmorphism' },
    { value: 'system' as const, label: 'System', icon: Monitor, desc: 'Match my device' },
  ];

  readonly paletteOptions: { value: AppPalette; label: string; light: string; dark: string }[] = [
    { value: 'violet',  label: 'Violet',  light: 'oklch(0.55 0.22 280)', dark: 'oklch(0.72 0.20 290)' },
    { value: 'rose',    label: 'Rose',    light: 'oklch(0.55 0.22 10)',  dark: 'oklch(0.72 0.20 10)'  },
    { value: 'azure',   label: 'Azure',   light: 'oklch(0.55 0.22 230)', dark: 'oklch(0.72 0.20 230)' },
    { value: 'emerald', label: 'Emerald', light: 'oklch(0.55 0.20 155)', dark: 'oklch(0.72 0.18 155)' },
    { value: 'amber',   label: 'Amber',   light: 'oklch(0.58 0.20 65)',  dark: 'oklch(0.78 0.18 75)'  },
  ];

  // Icon references for template use
  readonly checkIcon = Check;
  readonly downloadIcon = Download;
  readonly trash2Icon = Trash2;
  readonly bellIcon = Bell;
  readonly importIcon = ArrowDownToLine;
  readonly copyIcon = Copy;
  readonly refreshCwIcon = RefreshCw;
  readonly externalLinkIcon = ExternalLink;
  readonly arrowLeftRightIcon = ArrowLeftRight;
  readonly monitorIcon = Monitor;
  readonly editIcon = Pencil;
  readonly xCircleIcon = XCircle;

  // ─── Import from Sheets ───────────────────────────────────────────────────────
  importSheetId = '';
  readonly isImporting = signal(false);
  readonly importMessage = signal<string | null>(null);
  readonly importError = signal(false);
  readonly isRestoringJson = signal(false);
  readonly restoreJsonMessage = signal<string | null>(null);
  readonly restoreJsonError = signal(false);
  readonly isAiKeysDialogOpen = signal(false);
  dialogGeminiKey = '';
  dialogGroqKey = '';
  dialogPreference: 'groq' | 'gemini' | 'both' = 'gemini';

  // ─── Local Notification Preferences ──────────────────────────────────────────
  readonly notificationPrefs = signal<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);

  // ─── Task 12.4: PWA install prompt ───────────────────────────────────────────
  readonly deferredPrompt = signal<BeforeInstallPromptEvent | null>(null);

  // ─── Notification access prominent disclosure ─────────────────────────────────
  readonly showNotifDisclosure = signal(false);

  // ─── Task 12.6: Clear modal state ────────────────────────────────────────────
  readonly isClearModalOpen = signal<boolean>(false);
  readonly clearSuccessMessage = signal<string | null>(null);

  // ─── 12.1: Backup mode UI state ──────────────────────────────────────────────
  /** Feedback signal shown briefly after copying the shared file ID */
  readonly copyFileIdSuccess = signal(false);
  /** Primary mode-switch confirmation dialog */
  readonly isSwitchModeModalOpen = signal(false);
  /** Secondary Owner warning dialog (shown after primary confirm when Owner is in family mode) */
  readonly isOwnerSwitchWarningOpen = signal(false);
  /** File rotation confirmation dialog */
  readonly isRotateFileModalOpen = signal(false);
  /** True while the rotation API calls are in progress */
  readonly isRotating = signal(false);
  /** Error message from a failed rotation attempt */
  readonly rotateError = signal<string | null>(null);
  /** New file ID after a successful rotation — shown with Copy button */
  readonly rotatedFileId = signal<string | null>(null);
  readonly isDeleteAccountWarningOpen = signal(false);
  readonly deleteAccountCountdown = signal(10);
  readonly isDeletingAccount = signal(false);
  readonly deleteAccountError = signal<string | null>(null);
  readonly isSigningOut = signal(false);
  readonly isSigningIn = signal(false);
  readonly isOpeningSubscribePage = signal(false);

  // ─── Family mode doc + invite ─────────────────────────────────────────────────
  readonly familyDoc = signal<FamilyDocument | null>(null);
  readonly isGeneratingInvite = signal(false);
  readonly generatedInviteCode = signal<string | null>(null);
  readonly inviteCodeExpiry = signal<string | null>(null);
  readonly isLeavingFamily = signal(false);
  readonly isLeaveFamilyModalOpen = signal(false);

  // ─── Subscription cancellation ────────────────────────────────────────────────
  protected readonly cancelling = signal(false);
  protected readonly showCancelConfirm = signal(false);

  private deleteAccountTimer: ReturnType<typeof setInterval> | null = null;
  private dissolutionSub: { unsubscribe(): void } | null = null;

  private readonly beforeInstallHandler = (event: Event) => {
    event.preventDefault();
    this.deferredPrompt.set(event as BeforeInstallPromptEvent);
  };
  private readonly visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      void this.spendNotificationAccess.refreshStatus();
    }
  };

  ngOnInit(): void {
    // Capture the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', this.beforeInstallHandler);
    document.addEventListener('visibilitychange', this.visibilityHandler);

    // Load notification preferences from storage
    this.loadNotificationPreferences();
    this.loadAiSettings();
    void this.spendNotificationAccess.refreshStatus();

    // Reschedule notifications if they were previously enabled
    this.rescheduleNotificationsIfNeeded();

    // Load Firestore family doc for family-mode status display
    if (this.backupModeService.mode() === 'family' && this.backupModeService.firestoreFamilyId()) {
      void this.loadFamilyDoc();
    }

    // When the family is dissolved externally (owner dissolves while partner is viewing Settings),
    // clean up and navigate to /daily.
    this.dissolutionSub = this.familySyncService.dissolution$.subscribe(() => {
      void this.router.navigate(['/daily']);
    });
  }

  async onThemeChange(theme: 'light' | 'dark' | 'system'): Promise<void> {
    await this.themeService.setTheme(theme);
    this.feedback.success('Appearance saved.', 'Your theme preference was saved on this device.');
  }

  async onPaletteChange(palette: AppPalette): Promise<void> {
    await this.themeService.setPalette(palette);
    this.feedback.success('Palette saved.', 'Your color palette was saved on this device.');
  }

  async onLanguageChange(language: AppLanguage): Promise<void> {
    await this.i18n.setLanguage(language);
    const selected = this.i18n.languageOptions.find((option) => option.code === language);
    this.feedback.success(
      'Language saved.',
      `Spenza will now use ${selected?.nativeLabel ?? language}.`
    );
  }

  async onCurrencyChange(currency: AppCurrency): Promise<void> {
    await this.currencyService.setCurrency(currency);
    this.feedback.success(
      'Currency saved.',
      `${this.i18n.t(this.currencyService.option(currency).nameKey)} will be used for amounts across Spenza.`
    );
  }

  currencyPreview(currency: AppCurrency): string {
    const option = this.currencyService.option(currency);
    return this.currencyService.format(option.sampleAmount, this.i18n.locale(), currency);
  }

  currentSpeechLanguageLabel(): string {
    const current = this.i18n.languageOptions.find((language) => language.code === this.i18n.language());
    return current ? `${current.nativeLabel} · ${current.speechLang}` : 'English · en-IN';
  }

  languageOptionClass(language: AppLanguage): string {
    return [
      'group relative flex min-h-[5rem] items-center gap-3 rounded-2xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      this.i18n.language() === language
        ? 'border-primary bg-accent shadow-glow'
        : 'border-border bg-card/40 hover:border-primary/40 hover:bg-card/70',
    ].join(' ');
  }

  aiProviderMode(): AiProviderMode {
    return this.aiSettingsService.settings().provider;
  }

  aiProviderButtonClass(mode: AiProviderMode): string {
    return [
      'flex items-start gap-3 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      this.aiProviderMode() === mode
        ? 'border-primary bg-accent shadow-glow'
        : 'border-border bg-card/40 hover:border-primary/40 hover:bg-card/70',
    ].join(' ');
  }

  onOpenAiKeysDialog(): void {
    const current = this.aiSettingsService.settings();
    this.dialogGeminiKey = '';
    this.dialogGroqKey = '';
    this.dialogPreference = current.byokPreference;
    this.isAiKeysDialogOpen.set(true);
  }

  async onAiProviderChange(provider: AiProviderMode): Promise<void> {
    const current = this.aiSettingsService.settings();
    await this.aiSettingsService.save({ ...current, provider });
    if (provider === 'byok' && !current.geminiApiKey && !current.groqApiKey) {
      this.dialogGeminiKey = '';
      this.dialogGroqKey = '';
      this.dialogPreference = current.byokPreference;
      this.isAiKeysDialogOpen.set(true);
    }
    this.feedback.success(
      'AI settings saved.',
      provider === 'disabled' ? 'Spenza will use only on-device insights.' : 'Your AI preference was saved.'
    );
  }

  async onSaveAiKeys(): Promise<void> {
    const current = this.aiSettingsService.settings();
    const geminiKey = this.dialogGeminiKey === '__CLEAR__'
      ? null
      : this.dialogGeminiKey.trim() || current.geminiApiKey;
    const groqKey = this.dialogGroqKey === '__CLEAR__'
      ? null
      : this.dialogGroqKey.trim() || current.groqApiKey;

    if (!geminiKey && !groqKey) {
      this.aiSettingsService.lastError.set('Add at least one API key before saving.');
      return;
    }

    await this.aiSettingsService.save({
      provider: 'byok',
      geminiApiKey: geminiKey,
      groqApiKey: groqKey,
      byokPreference: this.dialogPreference,
    });
    this.dialogGeminiKey = '';
    this.dialogGroqKey = '';
    this.isAiKeysDialogOpen.set(false);
    this.feedback.success('API keys saved.', 'Your keys are stored privately on this device and in Drive.');
  }

  private async loadNotificationPreferences(): Promise<void> {
    try {
      const prefs = await this.storageService.getNotificationPreferences();
      this.notificationPrefs.set(prefs);
      if (isDevMode()) { console.log('[Settings] Loaded notification preferences:', prefs); }
    } catch (error) {
      console.error('[Settings] Failed to load notification preferences:', error);
      // Keep default preferences on error
    }
  }

  private async loadAiSettings(): Promise<void> {
    await this.aiSettingsService.load();
  }

  /**
   * Reschedule notifications if they were previously enabled
   * This ensures notifications continue to work after app restart
   */
  private async rescheduleNotificationsIfNeeded(): Promise<void> {
    try {
      const prefs = await this.storageService.getNotificationPreferences();
      const permissionStatus = this.localNotificationService.permissionStatus();
      
      // Only reschedule if permission is granted and daily reminder was enabled
      if (permissionStatus === 'granted' && prefs.dailyReminderEnabled) {
        if (isDevMode()) { console.log('[Settings] Rescheduling notifications on app start'); }
        await this.localNotificationService.scheduleDailyReminder(
          prefs.reminderHour,
          prefs.reminderMinute
        );
        await this.localNotificationService.scheduleMonthlyNudge();
        if (isDevMode()) { console.log('[Settings] Notifications rescheduled successfully'); }
      } else {
        if (isDevMode()) { console.log('[Settings] Notifications not rescheduled:', {
          permissionGranted: permissionStatus === 'granted',
          reminderEnabled: prefs.dailyReminderEnabled
        }); }
      }
    } catch (error) {
      console.error('[Settings] Failed to reschedule notifications:', error);
      // Don't throw - allow app to continue
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeinstallprompt', this.beforeInstallHandler);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.stopDeleteAccountCountdown();
    this.dissolutionSub?.unsubscribe();
  }

  // ─── Subscription upgrade (Android Reader App exemption) ─────────────────────

  async openSubscribePage(): Promise<void> {
    if (this.isOpeningSubscribePage()) return;
    this.isOpeningSubscribePage.set(true);
    try {
      const url = await this.authService.createSubscriptionPageUrl();
      await Browser.open({ url });
    } catch (err) {
      this.feedback.error(
        'Subscription page could not be opened.',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      this.isOpeningSubscribePage.set(false);
    }
  }

  protected async cancelSubscription(): Promise<void> {
    if (this.cancelling()) return;
    this.cancelling.set(true);
    this.showCancelConfirm.set(false);
    try {
      await this.payService.cancelSubscription();
      // onSnapshot will update cancelPending: true automatically within seconds
      this.feedback.success(
        'Subscription cancelled',
        'You have Pro access until ' +
          (this.subscriptionService.status().expiresAt?.toLocaleDateString() ?? 'end of period')
      );
    } catch (err) {
      this.feedback.error(
        'Could not cancel',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      this.cancelling.set(false);
    }
  }

  // ─── Connection: sign-out / sign-in ──────────────────────────────────────────

  async onSignOut(): Promise<void> {
    if (this.isSigningOut()) return;
    this.isSigningOut.set(true);
    try {
      this.familySyncService.stopListening();
      await Promise.allSettled([
        this.notificationService.disable(),
        this.localNotificationService.cancelDailyReminder(),
        this.localNotificationService.cancelMonthlyNudge(),
        this.authService.signOut(),
      ]);
      await this.clearSignedOutLocalState();
      // Refresh the native widget so it shows the signed-out locked state
      // (storage is now cleared so auth_state key is gone).
      if (this.isNativePlatform) {
        await ExpenseWidget.refresh().catch(() => undefined);
      }
      await this.router.navigate(['/auth/callback'], { replaceUrl: true });
    } finally {
      this.isSigningOut.set(false);
    }
  }

  async onSignIn(): Promise<void> {
    if (this.isSigningIn()) return;
    this.isSigningIn.set(true);
    try {
      const signInResult = await this.authService.signIn();
      if (signInResult.accountChanged) {
        this.familySyncService.stopListening();
        this.expenseStore.clearLocalData();
        await Promise.all([
          this.expenseStore.clearLocalBackupCache(),
          this.backupModeService.clearLocalCacheForAccountSwitch(),
        ]);
      }
      await this.backupModeService.loadFromDrive(true);
      await this.expenseStore.loadFromDrive();
    } catch (err) {
      console.error('[Settings] Sign-in failed:', err);
    } finally {
      this.isSigningIn.set(false);
    }
  }

  private async clearSignedOutLocalState(): Promise<void> {
    this.expenseStore.clearLocalData();
    this.dailyExpenseDraftService.clearDraft();

    await Promise.allSettled([
      this.syncService.clearQueue(),
      this.expenseStore.clearLocalBackupCache(),
      this.backupModeService.clearLocalCacheForAccountSwitch(),
      this.aiSettingsService.clearLocalState(),
    ]);

    await this.storageService.clear();
  }

  // ─── Import from Google Sheets ───────────────────────────────────────────────

  async onImportFromSheets(): Promise<void> {
    const sheetId = this.importSheetId.trim();
    if (!sheetId) return;

    this.isImporting.set(true);
    this.importMessage.set(null);
    this.importError.set(false);

    try {
      // Authenticate gapi for Sheets access
      await this.sheetsService.authenticate();

      // Read all data from Sheets in parallel
      // Pass '' as month so startsWith('') matches every row
      const [allExpenses, limits, metadata] = await Promise.all([
        this.sheetsService.readExpenses(sheetId, ''),
        this.sheetsService.readLimits(sheetId),
        this.sheetsService.readMetadata(sheetId),
      ]);

      const monthlyIncome = parseFloat(metadata[METADATA_MONTHLY_INCOME] ?? '0') || 0;

      // Write everything into the Drive backup via the store
      // setLimitsAndIncome + addEntry would trigger N writes; use patchState directly
      // by calling loadFromDrive after bulk-setting state via a dedicated path.
      // Simplest: update store state then call persistToDrive once.
      await this.expenseStore.importFromSheets(allExpenses, limits, monthlyIncome);

      this.importMessage.set(
        `Imported and saved ${allExpenses.length} expenses, ${limits.length} budget limits, and monthly income ${this.currencyService.format(monthlyIncome, this.i18n.locale())}.`
      );
      this.feedback.success(
        'Import saved.',
        `${allExpenses.length} expenses, ${limits.length} budget limits, and monthly income were saved to your Drive backup.`
      );
      this.importSheetId = '';
    } catch (err: any) {
      console.error('[Settings] Import from Sheets failed:', err);
      this.importError.set(true);
      this.importMessage.set(err?.message ?? 'Import failed. Check the spreadsheet ID and try again.');
      this.feedback.error(
        'Import was not saved.',
        err?.message ?? 'Check the spreadsheet ID, Google access, and internet connection, then try again.'
      );
    } finally {
      this.isImporting.set(false);
    }
  }

  // ─── Notification toggle ──────────────────────────────────────────────────────

  async onNotificationToggle(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    await this.setPushRemindersEnabled(checked);
  }

  async onNotificationToggleClick(): Promise<void> {
    await this.setPushRemindersEnabled(!this.notificationService.isEnabled());
  }

  private async setPushRemindersEnabled(enabled: boolean): Promise<void> {
    try {
      if (enabled) {
        await this.notificationService.requestPermission();
        if (this.notificationService.permissionState() === 'granted') {
          const success = await this.notificationService.enable();
          if (success) {
            this.feedback.success('Push reminders enabled.', 'Spenza can now send reminder notifications.');
          } else {
            this.feedback.error(
              'Push reminders could not be enabled.',
              'FCM registration failed. Check your internet connection and try again.'
            );
          }
        } else {
          this.feedback.warning(
            'Push reminders were not enabled.',
            'Allow notification permission in your browser or device settings, then try again.'
          );
        }
      } else {
        await this.notificationService.disable();
        this.feedback.success('Push reminders turned off.', 'Spenza will stop sending push reminders.');
      }
    } catch (error) {
      this.feedback.error(
        'Notification setting was not saved.',
        error instanceof Error ? error.message : 'Check notification permission and try again.'
      );
    }
  }

  // ─── Local Notification Handlers (Tasks 9.2-9.6) ─────────────────────────────

  /**
   * Task 9.2: Request notification permission from the user
   */
  async onRequestNotificationPermission(): Promise<void> {
    const status = await this.localNotificationService.requestPermission();
    if (status === 'granted') {
      this.feedback.success('Notification permission saved.', 'Local reminders can now be scheduled on this device.');
    } else {
      this.feedback.warning(
        'Notification permission was not granted.',
        'Allow notifications in your device settings, then return here to enable reminders.'
      );
    }
  }

  async onSpendPromptToggle(): Promise<void> {
    const enabled = !this.spendNotificationAccess.promptEnabled();
    if (enabled && this.localNotificationService.permissionStatus() !== 'granted') {
      const status = await this.localNotificationService.requestPermission();
      if (status !== 'granted') {
        this.feedback.warning(
          'Spend prompts were not enabled.',
          'Allow notification permission first so Spenza can show the review prompt.'
        );
        return;
      }
    }

    await this.spendNotificationAccess.setPromptEnabled(enabled);
    if (enabled) {
      if (!this.spendNotificationAccess.permissionGranted()) {
        await this.spendNotificationAccess.openSettings();
        this.feedback.info(
          'Spend prompts enabled.',
          'Turn on Spenza spend prompts in Android notification access to let Spenza detect payment alerts.'
        );
        return;
      }
      this.feedback.success(
        'Spend prompts enabled.',
        'Spenza will suggest expense logs from payment notifications on this device.'
      );
    } else {
      this.feedback.success(
        'Spend prompts turned off.',
        'Spenza will stop reading device notifications for expense suggestions.'
      );
    }
  }

  onOpenSpendNotificationAccess(): void {
    this.showNotifDisclosure.set(true);
  }

  async onDisclosureAllow(): Promise<void> {
    this.showNotifDisclosure.set(false);
    await this.spendNotificationAccess.openSettings();
  }

  onDisclosureDeny(): void {
    this.showNotifDisclosure.set(false);
  }

  async onRefreshSpendNotificationAccess(): Promise<void> {
    await this.spendNotificationAccess.refreshStatus();
    this.feedback.info(
      'Spend prompt status refreshed.',
      this.spendNotificationAccess.permissionGranted()
        ? 'Android notification access is enabled for Spenza.'
        : 'Android notification access is not enabled yet.'
    );
  }

  /**
   * Task 9.3: Toggle daily reminder on/off
   * Schedules or cancels notifications and saves preferences
   */
  async onDailyReminderToggle(): Promise<void> {
    const current = this.notificationPrefs();
    const updated = { ...current, dailyReminderEnabled: !current.dailyReminderEnabled };

    if (updated.dailyReminderEnabled) {
      // First request permission if not granted
      if (this.localNotificationService.permissionStatus() !== 'granted') {
        const status = await this.localNotificationService.requestPermission();
        if (status !== 'granted') {
          if (isDevMode()) { console.log('[Settings] Permission denied, cannot enable daily reminder'); }
          this.feedback.warning(
            'Daily reminder was not enabled.',
            'Allow notification permission first, then turn on the reminder again.'
          );
          return;
        }
      }
    }

    // Optimistically update UI before async operations
    this.notificationPrefs.set(updated);

    try {
      if (updated.dailyReminderEnabled) {
        // Enable: schedule both daily reminder and monthly nudge
        await this.localNotificationService.scheduleDailyReminder(
          updated.reminderHour,
          updated.reminderMinute
        );
        await this.localNotificationService.scheduleMonthlyNudge();
        await this.notificationService.syncDailyReminder(
          true,
          updated.reminderHour,
          updated.reminderMinute
        );
        if (isDevMode()) { console.log('[Settings] Daily reminder enabled and scheduled'); }
      } else {
        // Disable: cancel both notifications
        await this.localNotificationService.cancelDailyReminder();
        await this.localNotificationService.cancelMonthlyNudge();
        await this.notificationService.syncDailyReminder(
          false,
          updated.reminderHour,
          updated.reminderMinute
        );
        if (isDevMode()) { console.log('[Settings] Daily reminder disabled and cancelled'); }
      }

      // Save updated preferences
      await this.storageService.setNotificationPreferences(updated);
      this.feedback.success(
        updated.dailyReminderEnabled ? 'Daily reminder saved.' : 'Daily reminder turned off.',
        updated.dailyReminderEnabled
          ? `Spenza will remind you at ${this.formatTime(updated.reminderHour, updated.reminderMinute)}.`
          : 'Spenza will stop scheduling the daily reminder on this device.'
      );
    } catch (error) {
      // Revert on failure
      this.notificationPrefs.set(current);
      this.feedback.error(
        'Daily reminder setting was not saved.',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  }

  /**
   * Task 9.4: Handle reminder time change
   * Parses time input, cancels existing reminder, schedules new one, and saves preferences
   */
  async onReminderTimeChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const [hourStr, minuteStr] = input.value.split(':');
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    const current = this.notificationPrefs();
    const updated = { ...current, reminderHour: hour, reminderMinute: minute };

    // Cancel existing reminder and schedule new one with updated time
    await this.localNotificationService.cancelDailyReminder();
    await this.localNotificationService.scheduleDailyReminder(hour, minute);
    await this.notificationService.syncDailyReminder(updated.dailyReminderEnabled, hour, minute);

    // Save updated preferences
    await this.storageService.setNotificationPreferences(updated);
    this.notificationPrefs.set(updated);
    this.feedback.success(
      'Reminder time saved.',
      `Your daily reminder is set for ${this.formatTime(hour, minute)}.`
    );
  }

  /**
   * Task 9.5: Toggle budget warnings on/off
   * Updates preferences and saves to storage
   */
  async onBudgetWarningsToggle(): Promise<void> {
    const current = this.notificationPrefs();
    const updated = { ...current, budgetWarningsEnabled: !current.budgetWarningsEnabled };

    this.notificationPrefs.set(updated);

    try {
      await this.storageService.setNotificationPreferences(updated);
      this.feedback.success(
        updated.budgetWarningsEnabled ? 'Budget alerts saved.' : 'Budget alerts turned off.',
        updated.budgetWarningsEnabled
          ? 'Spenza will alert you when a category reaches 80% of its monthly limit.'
          : 'Spenza will stop sending budget limit alerts.'
      );
    } catch (error) {
      this.notificationPrefs.set(current);
      this.feedback.error(
        'Budget alert setting was not saved.',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  }

  /**
   * Task 9.6: Format time as HH:MM string
   * Helper method for binding time picker value
   */
  formatTime(hour: number, minute: number): string {
    const h = hour.toString().padStart(2, '0');
    const m = minute.toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  /**
   * Test notification (fires in 10 seconds)
   * Used for debugging notification issues
   */
  async onTestNotification(): Promise<void> {
    if (isDevMode()) { console.log('[Settings] Triggering test notification...'); }
    await this.localNotificationService.scheduleTestNotification();
    this.feedback.success(this.i18n.t('settings.notifications.testSent'));
  }

  // ─── Task 12.4: PWA install ───────────────────────────────────────────────────

  async onInstallClick(): Promise<void> {
    const prompt = this.deferredPrompt();
    if (!prompt) return;

    this.deferredPrompt.set(null);
    await prompt.prompt();
  }

  // ─── Task 12.5: Export backup JSON ────────────────────────────────────────────

  onExportBackupJson(): void {
    const doc: BackupDocument = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      metadata: {
        monthlyIncome: this.expenseStore.monthlyIncome(),
        currency: this.currencyService.currency(),
        ...(this.expenseStore.receiptFolderId() ? { receiptFolderId: this.expenseStore.receiptFolderId()! } : {}),
      },
      expenses: this.expenseStore.entries(),
      limits: this.expenseStore.limits(),
      accounts: this.expenseStore.accounts(),
      accountAdjustments: this.expenseStore.accountAdjustments(),
      debts: this.expenseStore.debts(),
      debtPayments: this.expenseStore.debtPayments(),
    };
    const json = `${JSON.stringify(doc, null, 2)}\n`;
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `spenza-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    this.feedback.success(
      'Backup exported.',
      'A restore-ready JSON backup was downloaded to this device.'
    );
  }

  async onRestoreJsonSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    this.isRestoringJson.set(true);
    this.restoreJsonMessage.set(null);
    this.restoreJsonError.set(false);

    try {
      const raw = await file.text();
      const doc = this.parseBackupDocument(raw);
      await this.expenseStore.restoreFromBackupDocument(doc);
      this.restoreJsonMessage.set(
        `Restored and saved ${doc.expenses.length} expenses and ${doc.limits.length} budget limits from ${file.name}.`
      );
      this.feedback.success(
        'Backup restored.',
        `${doc.expenses.length} expenses and ${doc.limits.length} budget limits were saved to your Drive backup.`
      );
    } catch (err) {
      console.error('[Settings] JSON restore failed:', err);
      this.restoreJsonError.set(true);
      this.restoreJsonMessage.set(err instanceof Error ? err.message : 'JSON restore failed. Please check the file and try again.');
      this.feedback.error(
        'Backup was not restored.',
        err instanceof Error
          ? `${err.message} Choose a Spenza backup JSON file and try again.`
          : 'Choose a Spenza backup JSON file and try again.'
      );
    } finally {
      this.isRestoringJson.set(false);
    }
  }

  private parseBackupDocument(raw: string): BackupDocument {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('This file is not valid JSON.');
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as BackupDocument).expenses) ||
      !Array.isArray((parsed as BackupDocument).limits)
    ) {
      throw new Error('This is not a valid Spenza backup JSON file.');
    }

    const candidate = parsed as Partial<BackupDocument>;
    const expenses = (parsed as BackupDocument).expenses;
    const limits = (parsed as BackupDocument).limits;
    const accounts = Array.isArray(candidate.accounts) ? candidate.accounts : [];
    const accountAdjustments = Array.isArray(candidate.accountAdjustments) ? candidate.accountAdjustments : [];
    const debts = Array.isArray(candidate.debts) ? candidate.debts : [];
    const debtPayments = Array.isArray(candidate.debtPayments) ? candidate.debtPayments : [];
    const metadata = candidate.metadata ?? { monthlyIncome: 0, currency: this.currencyService.currency() };

    return {
      version: typeof candidate.version === 'string' ? candidate.version : '1.0',
      lastUpdated: typeof candidate.lastUpdated === 'string' ? candidate.lastUpdated : new Date().toISOString(),
      metadata: {
        monthlyIncome: Number(metadata.monthlyIncome ?? 0) || 0,
        currency: typeof metadata.currency === 'string' ? metadata.currency : this.currencyService.currency(),
        ...(typeof metadata.receiptFolderId === 'string' ? { receiptFolderId: metadata.receiptFolderId } : {}),
      },
      expenses,
      limits,
      accounts,
      accountAdjustments,
      debts,
      debtPayments,
    };
  }

  // ─── Task 12.6: Clear local data ─────────────────────────────────────────────

  openClearModal(): void {
    this.isClearModalOpen.set(true);
  }

  async onClearConfirmed(): Promise<void> {
    this.isClearModalOpen.set(false);
    await this.syncService.clearQueue();
    this.expenseStore.clearLocalData();
    this.clearSuccessMessage.set('Local data cleared successfully.');
    this.feedback.success(
      'Local cache cleared.',
      'Only this device cache was cleared. Your Drive backup remains available.'
    );
    setTimeout(() => this.clearSuccessMessage.set(null), 4000);
  }

  onClearCancelled(): void {
    this.isClearModalOpen.set(false);
  }

  openDeleteAccountWarning(): void {
    this.deleteAccountError.set(null);
    this.deleteAccountCountdown.set(10);
    this.isDeleteAccountWarningOpen.set(true);
    this.stopDeleteAccountCountdown();
    this.deleteAccountTimer = setInterval(() => {
      const next = this.deleteAccountCountdown() - 1;
      this.deleteAccountCountdown.set(next);
      if (next <= 0) {
        this.stopDeleteAccountCountdown();
        void this.executeDeleteAccount();
      }
    }, 1000);
  }

  cancelDeleteAccountWarning(): void {
    if (this.isDeletingAccount()) return;
    this.stopDeleteAccountCountdown();
    this.isDeleteAccountWarningOpen.set(false);
  }

  deleteAccountNow(): void {
    this.stopDeleteAccountCountdown();
    this.deleteAccountCountdown.set(0);
    void this.executeDeleteAccount();
  }

  private stopDeleteAccountCountdown(): void {
    if (this.deleteAccountTimer) {
      clearInterval(this.deleteAccountTimer);
      this.deleteAccountTimer = null;
    }
  }

  private async executeDeleteAccount(): Promise<void> {
    if (this.isDeletingAccount()) return;

    this.isDeletingAccount.set(true);
    this.deleteAccountError.set(null);

    try {
      await Promise.allSettled([
        this.notificationService.disable(),
        this.localNotificationService.cancelDailyReminder(),
        this.localNotificationService.cancelMonthlyNudge(),
      ]);

      // Stop Firestore family sync listener before wiping state.
      // Notify the server to clean up the family document — best-effort, never blocks deletion.
      this.familySyncService.stopListening();
      const firestoreFamilyId = this.backupModeService.getFamilyId();
      const ownerRole = this.backupModeService.ownerRole();
      if (firestoreFamilyId) {
        if (ownerRole === 'partner') {
          await this.familyApiService.leaveFamily(firestoreFamilyId).catch((err) => {
            console.warn('[Settings] leaveFamily call failed during account deletion (non-blocking):', err);
          });
        } else if (ownerRole === 'owner') {
          // Dissolve the family so the document is marked inactive. Without this,
          // createFamily would return the stale active document on re-signup (same UID),
          // leaving a ghost family with a stale partnerUid.
          await this.familyApiService.dissolveFamily(firestoreFamilyId).catch((err) => {
            console.warn('[Settings] dissolveFamily call failed during account deletion (non-blocking):', err);
          });
        }
      }

      const deletionResults = await this.googleDriveService.deleteSpenzaDriveData([
        this.expenseStore.driveFileId(),
        this.expenseStore.receiptFolderId(),
        this.backupModeService.getSharedFileId(),
        this.backupModeService.getFamilyFolderId(),
      ]);
      const failed = deletionResults.filter((item) => !item.deleted);
      if (failed.length > 0) {
        if (isDevMode()) { console.warn('[Settings] Some Spenza Drive items could not be deleted:', failed); }
      }

      await this.syncService.clearQueue();
      this.expenseStore.clearLocalData();
      await this.backupModeService.clearAll();
      await this.storageService.clear();
      await this.authService.signOut();

      this.isDeleteAccountWarningOpen.set(false);
      await this.router.navigate(['/auth/callback']);
    } catch (err) {
      console.error('[Settings] Delete account failed:', err);
      this.deleteAccountError.set('Could not delete all Spenza data. Please check Google Drive permissions and try again.');
    } finally {
      this.isDeletingAccount.set(false);
    }
  }

  // ─── 12.1: Backup mode — copy shared file ID ─────────────────────────────────

  async onCopySharedFileId(): Promise<void> {
    const fileId = this.backupModeService.familyFolderId() ?? this.backupModeService.sharedFileId();
    if (!fileId) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fileId);
      } else {
        // Fallback: select a temporary input
        const input = document.createElement('input');
        input.value = fileId;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      this.copyFileIdSuccess.set(true);
      this.feedback.success(
        'Family Folder ID copied.',
        'Share this ID with your partner after sharing the folder in Google Drive.'
      );
      setTimeout(() => this.copyFileIdSuccess.set(false), 3000);
    } catch (err) {
      console.error('[Settings] Failed to copy file ID:', err);
      this.feedback.error(
        'Could not copy the Family Folder ID.',
        'Select the ID manually and copy it, then share it with your partner.'
      );
    }
  }

  // ─── 12.4: Copy rotated file ID ──────────────────────────────────────────────

  async onCopyRotatedFileId(): Promise<void> {
    const fileId = this.rotatedFileId();
    if (!fileId) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fileId);
      } else {
        const input = document.createElement('input');
        input.value = fileId;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      this.copyFileIdSuccess.set(true);
      this.feedback.success('File ID copied.', 'You can now share or store the new backup file ID.');
      setTimeout(() => this.copyFileIdSuccess.set(false), 3000);
    } catch (err) {
      console.error('[Settings] Failed to copy rotated file ID:', err);
      this.feedback.error(
        'Could not copy the file ID.',
        'Select the ID manually and copy it.'
      );
    }
  }

  // ─── 12.3: Switch backup mode flow ──────────────────────────────────────────

  onSwitchBackupMode(): void {
    this.isSwitchModeModalOpen.set(true);
  }

  familyDriveUrl(): string {
    const folderId = this.backupModeService.familyFolderId();
    if (folderId) return this.googleDriveService.getDriveFolderUrl(folderId);

    const fileId = this.backupModeService.sharedFileId();
    return fileId ? `https://drive.google.com/file/d/${fileId}/view` : '#';
  }

  switchModePrimaryMessage(): string {
    if (this.backupModeService.mode() === 'family') {
      return 'Switching to single mode will copy the latest family expenses into your private backup before disconnecting this device from family mode.';
    }

    return 'Switching to family mode will keep your private backup safe. After reconnecting, the owner can create a shared family folder and share one folder ID with the partner.';
  }

  switchModeChecklist(): string[] {
    if (this.backupModeService.mode() === 'family') {
      return [
        '1. Your family Drive folder/file will not be deleted.',
        '2. Your partner will keep access until you remove Drive sharing manually.',
        '3. Receipt files remain in Drive; old links are preserved.',
        '4. You will be signed out and asked to choose a backup mode again.',
      ];
    }

    return [
      '1. Your single-user backup remains in your private Drive app data.',
      '2. During family setup, the app copies your current data into the shared family backup.',
      '3. New family setup uses one shared Drive folder containing the backup file and Receipts folder.',
      '4. You must share that family folder in Google Drive with your partner.',
    ];
  }

  onSwitchModeCancelled(): void {
    this.isSwitchModeModalOpen.set(false);
  }

  onSwitchModeConfirmed(): void {
    this.isSwitchModeModalOpen.set(false);
    // If Owner is in family mode AND sharedFileId is set, show secondary warning
    // before executing switch (Requirement 13.5: skip warning if sharedFileId is null/empty)
    if (
      this.backupModeService.mode() === 'family' &&
      this.backupModeService.ownerRole() === 'owner' &&
      !!this.backupModeService.sharedFileId()
    ) {
      this.isOwnerSwitchWarningOpen.set(true);
    } else {
      void this.#executeModeSwitch();
    }
  }

  onOwnerSwitchWarningCancelled(): void {
    this.isOwnerSwitchWarningOpen.set(false);
  }

  onOwnerSwitchWarningConfirmed(): void {
    this.isOwnerSwitchWarningOpen.set(false);
    void this.#executeModeSwitch();
  }

  /** Merges family backup data into private backup, then clears mode state, signs out, and navigates. */
  async #executeModeSwitch(): Promise<void> {
    const currentMode = this.backupModeService.mode();

    // ── Family → Single migration: merge shared file entries into private backup ──
    // This ensures data logged during the family period is not lost.
    if (currentMode === 'family') {
      const sharedFileId = this.backupModeService.getSharedFileId();
      if (sharedFileId) {
        try {
          // Read the shared (family) backup
          const sharedDoc = await this.googleDriveService.readBackupFile(sharedFileId);

          // Find or create the private (appDataFolder) backup
          let privateFileId = await this.googleDriveService.findBackupFile();
          if (!privateFileId) {
            privateFileId = await this.googleDriveService.createBackupFile();
          }

          // Read the private backup
          const privateDoc = await this.googleDriveService.readBackupFile(privateFileId);

          // Merge: deduplicate by entry ID, shared entries take precedence for conflicts
          const mergedById = new Map<string, typeof sharedDoc.expenses[0]>();
          for (const entry of privateDoc.expenses) {
            mergedById.set(entry.id, entry);
          }
          for (const entry of sharedDoc.expenses) {
            mergedById.set(entry.id, entry);
          }
          const mergedExpenses = Array.from(mergedById.values())
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          // Use shared file's limits and income (most recent settings)
          const mergedDoc = {
            ...privateDoc,
            expenses: mergedExpenses,
            limits: sharedDoc.limits.length > 0 ? sharedDoc.limits : privateDoc.limits,
            accounts: (sharedDoc.accounts?.length ?? 0) > 0 ? sharedDoc.accounts : privateDoc.accounts ?? [],
            accountAdjustments: [
              ...(privateDoc.accountAdjustments ?? []),
              ...(sharedDoc.accountAdjustments ?? []),
            ],
            debts: (sharedDoc.debts?.length ?? 0) > 0 ? sharedDoc.debts : privateDoc.debts ?? [],
            debtPayments: [
              ...(privateDoc.debtPayments ?? []),
              ...(sharedDoc.debtPayments ?? []),
            ],
            metadata: sharedDoc.metadata.monthlyIncome > 0 ? sharedDoc.metadata : privateDoc.metadata,
            lastUpdated: new Date().toISOString(),
          };

          // Write merged data back to the private file
          await this.googleDriveService.writeBackupFile(privateFileId, mergedDoc);
          if (isDevMode()) { console.log(`[Settings] Merged ${sharedDoc.expenses.length} shared + ${privateDoc.expenses.length} private entries → ${mergedExpenses.length} total`); }
        } catch (err) {
          // Non-critical — if merge fails, private file keeps its existing data
          // The shared file data is still accessible in Google Drive
          if (isDevMode()) { console.warn('[Settings] Could not merge family backup into private backup:', err); }
        }
      }
    }

    await this.backupModeService.clearAll();
    await this.authService.signOut();
    await this.router.navigate(['/auth/callback']);
  }

  // ─── 12.1: File rotation — stub (full flow in task 12.4) ─────────────────────

  onRotateSharedFile(): void {
    this.isRotateFileModalOpen.set(true);
  }

  onRotateFileCancelled(): void {
    this.isRotateFileModalOpen.set(false);
  }

  async onRotateFileConfirmed(): Promise<void> {
    this.isRotateFileModalOpen.set(false);
    this.isRotating.set(true);
    this.rotateError.set(null);
    this.rotatedFileId.set(null);

    try {
      // Step 1: Create a new shared backup file in My Drive
      const newFileId = await this.googleDriveService.createBackupFileInMyDrive();

      // Step 2: Build the current BackupDocument from store state
      const currentDoc: BackupDocument = {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        metadata: {
          monthlyIncome: this.expenseStore.monthlyIncome(),
          currency: this.currencyService.currency(),
          ...(this.expenseStore.receiptFolderId() ? { receiptFolderId: this.expenseStore.receiptFolderId()! } : {}),
        },
        expenses: this.expenseStore.entries(),
        limits: this.expenseStore.limits(),
        accounts: this.expenseStore.accounts(),
        accountAdjustments: this.expenseStore.accountAdjustments(),
        debts: this.expenseStore.debts(),
        debtPayments: this.expenseStore.debtPayments(),
      };

      // Step 3: Write current data to the new file
      await this.googleDriveService.writeBackupFile(newFileId, currentDoc);

      // Step 4: Update BackupModeService and ExpenseStore with the new file ID
      await this.backupModeService.setSharedFileId(newFileId);
      this.expenseStore.patchDriveFileId(newFileId);

      // Step 5: Show the new file ID to the user
      this.rotatedFileId.set(newFileId);
      this.feedback.success(
        'New backup file created.',
        'Copy the new file ID and make sure the right people have access in Google Drive.'
      );
    } catch (err: any) {
      console.error('[Settings] File rotation failed:', err);
      const message = err?.message ?? 'Rotation failed. Please try again.';
      this.rotateError.set(message);
      this.feedback.error(
        'Backup file rotation failed.',
        `${message} Check Google Drive access and try again.`
      );
    } finally {
      this.isRotating.set(false);
    }
  }

  // ─── Family mode: doc load, invite generation, leave flow ────────────────────

  private async loadFamilyDoc(): Promise<void> {
    const familyId = this.backupModeService.firestoreFamilyId();
    if (!familyId) return;
    try {
      const { getApps, initializeApp } = await import('firebase/app');
      const { getFirestore, doc, getDoc } = await import('firebase/firestore');
      const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
      const db = getFirestore(app);
      const snap = await getDoc(doc(db, 'families', familyId));
      if (snap.exists()) {
        this.familyDoc.set(snap.data() as FamilyDocument);
      }
    } catch (err) {
      console.warn('[Settings] Failed to load family doc:', err);
    }
  }

  async onGenerateInvite(): Promise<void> {
    if (this.isGeneratingInvite()) return;
    const familyId = this.backupModeService.firestoreFamilyId();
    if (!familyId) {
      this.feedback.error('Could not generate invite', 'Family ID not found. Try switching backup mode.');
      return;
    }
    this.isGeneratingInvite.set(true);
    try {
      const result = await this.familyApiService.createFamilyInvite(familyId);
      this.generatedInviteCode.set(result.inviteCode);
      this.inviteCodeExpiry.set(result.expiresAt);
    } catch (err) {
      this.feedback.error(
        'Could not generate invite code.',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      this.isGeneratingInvite.set(false);
    }
  }

  async onCopyInviteCode(): Promise<void> {
    const code = this.generatedInviteCode();
    if (!code) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const input = document.createElement('input');
        input.value = code;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      this.feedback.success('Invite code copied.', 'Share it with your partner — it expires in 24 hours.');
    } catch (err) {
      this.feedback.error('Could not copy the invite code.', 'Select the code manually and copy it.');
    }
  }

  onLeaveFamily(): void {
    this.isLeaveFamilyModalOpen.set(true);
  }

  async onLeaveFamilyConfirmed(): Promise<void> {
    if (this.isLeavingFamily()) return;
    this.isLeavingFamily.set(true);
    try {
      const familyId = this.backupModeService.firestoreFamilyId();
      const role = this.backupModeService.ownerRole();
      if (familyId) {
        if (role === 'owner') {
          try {
            await this.familyApiService.dissolveFamily(familyId);
          } catch (err) {
            console.warn('[Settings] dissolveFamily failed, proceeding with local cleanup:', err);
          }
        } else {
          try {
            await this.familyApiService.leaveFamily(familyId);
          } catch (err) {
            console.warn('[Settings] leaveFamily failed, proceeding with local cleanup:', err);
          }
        }
      }
      this.familySyncService.stopListening();
      await this.backupModeService.clearFamilyState();
      await this.backupModeService.setMode('single');
    } finally {
      this.isLeavingFamily.set(false);
    }
    this.isLeaveFamilyModalOpen.set(false);
    await this.router.navigate(['/daily']);
  }

  // ─── Dev-only debug helpers ───────────────────────────────────────────────────

  async devForceRefreshSubscription(): Promise<void> {
    const uid = this.authService.firebaseUid();
    if (!uid) return;
    await this.subscriptionService.startListening(uid);
    this.feedback.success('Subscription refreshed', 'Pulled latest subscription status from Firestore.');
  }

  devClearSubscriptionCache(): void {
    this.subscriptionService.stopListening();
    this.feedback.success('Cache cleared', 'Local subscription state reset to free — reload to restore real status.');
  }

  // ─── Legal links ──────────────────────────────────────────────────────────────

  openPrivacyPolicy(): void {
    const url = 'https://saibalaji-as.github.io/spenza-legal/';
    if (Capacitor.isNativePlatform()) {
      void Browser.open({ url });
    } else {
      window.open(url, '_blank');
    }
  }

  openTerms(): void {
    const url = 'https://saibalaji-as.github.io/spenza-legal/terms';
    if (Capacitor.isNativePlatform()) {
      void Browser.open({ url });
    } else {
      window.open(url, '_blank');
    }
  }
}
