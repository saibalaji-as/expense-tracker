import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { LocalNotificationService } from '../../core/services/local-notification.service';
import { FcmService } from '../../core/services/fcm.service';
import { SyncService } from '../../core/services/sync.service';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { ThemeService } from '../../core/services/theme.service';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { BackupModeService } from '../../core/services/backup-mode.service';
import { GoogleDriveService, BackupDocument } from '../../core/services/google-drive.service';
import { StorageService } from '../../core/services/storage.service';
import { AppLanguage, I18nService } from '../../core/services/i18n.service';
import { AppCurrency, CurrencyService } from '../../core/services/currency.service';
import { METADATA_MONTHLY_INCOME } from '../../core/models';
import { NotificationPreferences, DEFAULT_NOTIFICATION_PREFERENCES } from '../../core/models/notification-preferences.model';
import { SectionCardComponent, ModalComponent } from '../../shared/components';
import { TranslatePipe } from '../../shared/pipes';
import { ExpenseEntry } from '../../core/models';
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
} from 'lucide-angular';

// Extend the Window interface to include the beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, SectionCardComponent, ModalComponent, LucideAngularModule, TranslatePipe],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ Check, Download, Trash2, Bell, Sun, Moon, Monitor, ArrowDownToLine, Copy, RefreshCw, ExternalLink, ArrowLeftRight }),
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

      <!-- Appearance -->
      <app-section-card 
        [title]="'settings.appearance.title' | translate"
        [description]="'settings.appearance.description' | translate"
      >
        <div class="grid gap-3 sm:grid-cols-3">
          @for (opt of themeOptions; track opt.value) {
            <button
              type="button"
              (click)="themeService.setTheme(opt.value)"
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
      </app-section-card>

      <!-- Language -->
      <app-section-card
        [title]="'settings.language.title' | translate"
        [description]="'settings.language.description' | translate"
      >
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label for="app-language" class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {{ 'settings.language.appLanguage' | translate }}
            </label>
            <select
              id="app-language"
              [ngModel]="i18n.language()"
              (ngModelChange)="onLanguageChange($event)"
              class="mt-2 w-full rounded-2xl border border-border bg-card/60 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            >
              @for (language of i18n.languageOptions; track language.code) {
                <option [value]="language.code">
                  {{ language.nativeLabel }} ({{ language.label }})
                </option>
              }
            </select>
          </div>

          <div class="rounded-2xl border border-border bg-card/40 p-4">
            <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {{ 'settings.language.voiceInput' | translate }}
            </p>
            <p class="mt-2 text-sm font-semibold">{{ currentSpeechLanguageLabel() }}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ 'settings.language.voiceInputHint' | translate }}
            </p>
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

        <!-- ── Family mode — Owner ──────────────────────────────────────────── -->
        @if (backupModeService.mode() === 'family' && backupModeService.ownerRole() === 'owner') {
          <p class="text-sm font-medium">Family Backup — Owner</p>

          <!-- Shared Family ID read-only field with Copy button -->
          <div class="mt-3 flex items-center gap-2">
            <input
              type="text"
              [value]="backupModeService.familyFolderId() ?? backupModeService.sharedFileId() ?? ''"
              readonly
              aria-label="Shared Family ID"
              class="flex-1 rounded-2xl border border-border bg-muted/40 px-4 py-2.5 font-mono text-xs text-foreground outline-none cursor-default"
            />
            <button
              type="button"
              (click)="onCopySharedFileId()"
              aria-label="Copy shared family ID"
              class="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card/40 px-3 py-2.5 text-xs font-medium hover:border-primary/40"
            >
              <lucide-icon [img]="copyIcon" class="h-4 w-4" />
              Copy
            </button>
          </div>

          <!-- Google Drive link -->
          @if (backupModeService.familyFolderId() || backupModeService.sharedFileId()) {
            <a
              [href]="familyDriveUrl()"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <lucide-icon [img]="externalLinkIcon" class="h-3.5 w-3.5" />
              Open in Google Drive
            </a>
          }

          <!-- Rotate shared file button — DISABLED (use Switch Backup Mode instead) -->
          <!--
          <button
            type="button"
            (click)="onRotateSharedFile()"
            [disabled]="isRotating()"
            class="mt-3 inline-flex items-center gap-2 rounded-xl border border-border bg-card/40 px-4 py-2.5 text-xs font-medium hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            @if (isRotating()) {
              <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
              Rotating…
            } @else {
              <lucide-icon [img]="refreshCwIcon" class="h-4 w-4" />
              Rotate shared file
            }
          </button>

          @if (rotateError()) {
            <p class="mt-2 text-xs" style="color: var(--destructive)" role="alert">
              {{ rotateError() }}
            </p>
          }

          @if (rotatedFileId()) {
            <div class="mt-3 rounded-2xl border border-border bg-muted/40 p-3 space-y-2">
              <p class="text-xs font-medium">New File ID created successfully</p>
              <div class="flex items-center gap-2">
                <input
                  type="text"
                  [value]="rotatedFileId() ?? ''"
                  readonly
                  aria-label="New shared File ID"
                  class="flex-1 rounded-xl border border-border bg-card/60 px-3 py-2 font-mono text-xs text-foreground outline-none cursor-default"
                />
                <button
                  type="button"
                  (click)="onCopyRotatedFileId()"
                  aria-label="Copy new shared file ID"
                  class="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card/40 px-3 py-2 text-xs font-medium hover:border-primary/40"
                >
                  <lucide-icon [img]="copyIcon" class="h-4 w-4" />
                  Copy
                </button>
              </div>
              <p class="text-xs text-muted-foreground">
                Share this new File ID with your partner. The old file is no longer used by this app.
              </p>
            </div>
          }
          -->

          @if (copyFileIdSuccess()) {
            <p class="mt-2 text-xs" style="color: var(--success)" role="status">File ID copied to clipboard.</p>
          }
        }

        <!-- ── Family mode — Partner ────────────────────────────────────────── -->
        @if (backupModeService.mode() === 'family' && backupModeService.ownerRole() === 'partner') {
          <p class="text-sm font-medium">Family Backup — Partner</p>

          <!-- Shared File ID read-only field -->
          <div class="mt-3">
            <input
              type="text"
              [value]="backupModeService.sharedFileId() ?? ''"
              readonly
              aria-label="Shared File ID"
              class="w-full rounded-2xl border border-border bg-muted/40 px-4 py-2.5 font-mono text-xs text-foreground outline-none cursor-default"
            />
          </div>
        }

        <!-- ── Sign out / Sign in ───────────────────────────────────────────── -->
        <div class="mt-3 flex flex-wrap items-center gap-2">
          @if (authService.isAuthenticated()) {
            <button
              type="button"
              (click)="onSignOut()"
              class="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {{ 'settings.action.signOut' | translate }}
            </button>
          } @else {
            <button
              type="button"
              (click)="onSignIn()"
              class="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-xs font-semibold text-primary-foreground gradient-primary shadow-glow"
            >
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

      <!-- Receipt folder sharing -->
      <app-section-card
        [title]="'settings.receipts.title' | translate"
        [description]="'settings.receipts.description' | translate"
      >
        <div class="rounded-2xl border border-border bg-card/40 p-4">
          @if (expenseStore.receiptFolderId()) {
            <p class="text-sm font-semibold">{{ 'settings.receipts.ready' | translate }}</p>
            <p class="mt-1 text-xs text-muted-foreground">{{ 'settings.receipts.shareHint' | translate }}</p>
            <a
              [href]="receiptFolderUrl()"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs font-semibold text-primary hover:border-primary/40"
            >
              <lucide-icon [img]="externalLinkIcon" class="h-3.5 w-3.5" />
              {{ 'settings.receipts.openFolder' | translate }}
            </a>
          } @else {
            <p class="text-sm font-semibold">{{ 'settings.receipts.notReady' | translate }}</p>
            <p class="mt-1 text-xs text-muted-foreground">{{ 'settings.receipts.setupHint' | translate }}</p>
            <button
              type="button"
              (click)="onSetupReceiptFolder()"
              [disabled]="isSettingUpReceiptFolder()"
              class="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-primary-foreground gradient-primary shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
            >
              @if (isSettingUpReceiptFolder()) {
                <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
              }
              {{ 'settings.receipts.setup' | translate }}
            </button>
          }
        </div>
      </app-section-card>

      <!-- Import from Google Sheets -->
      <app-section-card [title]="'settings.import.title' | translate" [description]="'settings.import.description' | translate">
        <p class="text-xs text-muted-foreground mb-3">
          Paste your Google Spreadsheet ID below. Found in the URL:
          <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit</code>
        </p>

        <div class="flex flex-col gap-2 sm:flex-row">
          <input
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

          <!-- Daily Reminder Toggle -->
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">{{ 'settings.local.dailyReminder' | translate }}</p>
              <p class="text-xs text-muted-foreground">
                {{ 'settings.local.dailyReminderHint' | translate }}
              </p>
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
              <input
                type="time"
                [value]="formatTime(notificationPrefs().reminderHour, notificationPrefs().reminderMinute)"
                (change)="onReminderTimeChange($event)"
                class="mt-1 w-full rounded-2xl border border-border bg-card/60 px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                aria-label="Daily reminder time"
              />
            </div>
          }

          <!-- Budget Warnings Toggle -->
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
          (click)="onExportCsv()"
          class="inline-flex items-center gap-2 rounded-xl border border-border bg-card/40 px-4 py-2.5 text-sm font-medium hover:border-primary/40"
        >
          <lucide-icon [img]="downloadIcon" class="h-4 w-4" />
          {{ 'settings.data.exportCsv' | translate }}
        </button>

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

        @if (clearSuccessMessage()) {
          <p class="mt-3 text-sm text-center" style="color: var(--success)" role="status">
            {{ clearSuccessMessage() }}
          </p>
        }
      </app-section-card>
    </div>

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

  // ─── Theme options ────────────────────────────────────────────────────────────
  readonly themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun, desc: 'Playful & colorful' },
    { value: 'dark' as const, label: 'Dark', icon: Moon, desc: 'Premium glassmorphism' },
    { value: 'system' as const, label: 'System', icon: Monitor, desc: 'Match my device' },
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

  // ─── Import from Sheets ───────────────────────────────────────────────────────
  importSheetId = '';
  readonly isImporting = signal(false);
  readonly importMessage = signal<string | null>(null);
  readonly importError = signal(false);
  readonly isSettingUpReceiptFolder = signal(false);

  // ─── Local Notification Preferences ──────────────────────────────────────────
  readonly notificationPrefs = signal<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);

  // ─── Task 12.4: PWA install prompt ───────────────────────────────────────────
  readonly deferredPrompt = signal<BeforeInstallPromptEvent | null>(null);

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

  private readonly beforeInstallHandler = (event: Event) => {
    event.preventDefault();
    this.deferredPrompt.set(event as BeforeInstallPromptEvent);
  };

  ngOnInit(): void {
    // Capture the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', this.beforeInstallHandler);
    
    // Load notification preferences from storage
    this.loadNotificationPreferences();
    
    // Reschedule notifications if they were previously enabled
    this.rescheduleNotificationsIfNeeded();
  }

  async onLanguageChange(language: AppLanguage): Promise<void> {
    await this.i18n.setLanguage(language);
  }

  async onCurrencyChange(currency: AppCurrency): Promise<void> {
    await this.currencyService.setCurrency(currency);
  }

  currencyPreview(currency: AppCurrency): string {
    const option = this.currencyService.option(currency);
    return this.currencyService.format(option.sampleAmount, this.i18n.locale(), currency);
  }

  currentSpeechLanguageLabel(): string {
    const current = this.i18n.languageOptions.find((language) => language.code === this.i18n.language());
    return current ? `${current.nativeLabel} · ${current.speechLang}` : 'English · en-IN';
  }

  receiptFolderUrl(): string {
    const folderId = this.expenseStore.receiptFolderId();
    return folderId ? this.googleDriveService.getDriveFolderUrl(folderId) : '#';
  }

  async onSetupReceiptFolder(): Promise<void> {
    this.isSettingUpReceiptFolder.set(true);
    try {
      const folderId = await this.googleDriveService.ensureReceiptsFolder();
      this.expenseStore.patchReceiptFolderId(folderId);
    } finally {
      this.isSettingUpReceiptFolder.set(false);
    }
  }

  private async loadNotificationPreferences(): Promise<void> {
    try {
      const prefs = await this.storageService.getNotificationPreferences();
      this.notificationPrefs.set(prefs);
      console.log('[Settings] Loaded notification preferences:', prefs);
    } catch (error) {
      console.error('[Settings] Failed to load notification preferences:', error);
      // Keep default preferences on error
    }
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
        console.log('[Settings] Rescheduling notifications on app start');
        await this.localNotificationService.scheduleDailyReminder(
          prefs.reminderHour,
          prefs.reminderMinute
        );
        await this.localNotificationService.scheduleMonthlyNudge();
        console.log('[Settings] Notifications rescheduled successfully');
      } else {
        console.log('[Settings] Notifications not rescheduled:', {
          permissionGranted: permissionStatus === 'granted',
          reminderEnabled: prefs.dailyReminderEnabled
        });
      }
    } catch (error) {
      console.error('[Settings] Failed to reschedule notifications:', error);
      // Don't throw - allow app to continue
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeinstallprompt', this.beforeInstallHandler);
  }

  // ─── Connection: sign-out / sign-in ──────────────────────────────────────────

  async onSignOut(): Promise<void> {
    await this.authService.signOut();
    // Router navigation is handled by the auth guard on the next route access
  }

  async onSignIn(): Promise<void> {
    try {
      await this.authService.signIn();
      await this.expenseStore.loadFromDrive();
    } catch (err) {
      console.error('[Settings] Sign-in failed:', err);
    }
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
      this.expenseStore.importFromSheets(allExpenses, limits, monthlyIncome);

      this.importMessage.set(
        `Imported ${allExpenses.length} expenses, ${limits.length} budget limits, and monthly income ${this.currencyService.format(monthlyIncome, this.i18n.locale())}.`
      );
      this.importSheetId = '';
    } catch (err: any) {
      console.error('[Settings] Import from Sheets failed:', err);
      this.importError.set(true);
      this.importMessage.set(err?.message ?? 'Import failed. Check the spreadsheet ID and try again.');
    } finally {
      this.isImporting.set(false);
    }
  }

  // ─── Notification toggle ──────────────────────────────────────────────────────

  async onNotificationToggle(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      // Enable notifications via notification service
      await this.notificationService.requestPermission();
      if (this.notificationService.permissionState() === 'granted') {
        await this.notificationService.enable();
      }
    } else {
      // Disable notifications via notification service
      await this.notificationService.disable();
    }
  }

  async onNotificationToggleClick(): Promise<void> {
    const isEnabled = this.notificationService.isEnabled();
    if (!isEnabled) {
      // Enable notifications via notification service
      await this.notificationService.requestPermission();
      if (this.notificationService.permissionState() === 'granted') {
        await this.notificationService.enable();
        
        // Log the FCM token for debugging
        const token = this.fcmService.getToken();
        console.log('[Settings] Push notifications enabled. FCM Token:', token);
      } else {
        console.log('[Settings] Push notification permission denied');
      }
    } else {
      // Disable notifications via notification service
      await this.notificationService.disable();
      
      console.log('[Settings] Push notifications disabled');
    }
  }

  // ─── Local Notification Handlers (Tasks 9.2-9.6) ─────────────────────────────

  /**
   * Task 9.2: Request notification permission from the user
   */
  async onRequestNotificationPermission(): Promise<void> {
    await this.localNotificationService.requestPermission();
    // UI updates automatically via permissionStatus signal
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
          console.log('[Settings] Permission denied, cannot enable daily reminder');
          return;
        }
      }

      // Enable: schedule both daily reminder and monthly nudge
      await this.localNotificationService.scheduleDailyReminder(
        updated.reminderHour,
        updated.reminderMinute
      );
      await this.localNotificationService.scheduleMonthlyNudge();
      
      console.log('[Settings] Daily reminder enabled and scheduled');
    } else {
      // Disable: cancel both notifications
      await this.localNotificationService.cancelDailyReminder();
      await this.localNotificationService.cancelMonthlyNudge();
      
      console.log('[Settings] Daily reminder disabled and cancelled');
    }

    // Save updated preferences
    await this.storageService.setNotificationPreferences(updated);
    this.notificationPrefs.set(updated);
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

    // Save updated preferences
    await this.storageService.setNotificationPreferences(updated);
    this.notificationPrefs.set(updated);
  }

  /**
   * Task 9.5: Toggle budget warnings on/off
   * Updates preferences and saves to storage
   */
  async onBudgetWarningsToggle(): Promise<void> {
    const current = this.notificationPrefs();
    const updated = { ...current, budgetWarningsEnabled: !current.budgetWarningsEnabled };

    // Save updated preferences
    await this.storageService.setNotificationPreferences(updated);
    this.notificationPrefs.set(updated);
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
    console.log('[Settings] Triggering test notification...');
    await this.localNotificationService.scheduleTestNotification();
    alert('Test notification scheduled! It will appear in 10 seconds.');
  }

  // ─── Task 12.4: PWA install ───────────────────────────────────────────────────

  async onInstallClick(): Promise<void> {
    const prompt = this.deferredPrompt();
    if (!prompt) return;

    this.deferredPrompt.set(null);
    await prompt.prompt();
  }

  // ─── Task 12.5: Export CSV ────────────────────────────────────────────────────

  onExportCsv(): void {
    const entries = this.expenseStore.entries();
    const csv = this.#entriesToCsv(entries);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
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
    setTimeout(() => this.clearSuccessMessage.set(null), 4000);
  }

  onClearCancelled(): void {
    this.isClearModalOpen.set(false);
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
      setTimeout(() => this.copyFileIdSuccess.set(false), 3000);
    } catch (err) {
      console.error('[Settings] Failed to copy file ID:', err);
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
      setTimeout(() => this.copyFileIdSuccess.set(false), 3000);
    } catch (err) {
      console.error('[Settings] Failed to copy rotated file ID:', err);
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
            metadata: sharedDoc.metadata.monthlyIncome > 0 ? sharedDoc.metadata : privateDoc.metadata,
            lastUpdated: new Date().toISOString(),
          };

          // Write merged data back to the private file
          await this.googleDriveService.writeBackupFile(privateFileId, mergedDoc);
          console.log(`[Settings] Merged ${sharedDoc.expenses.length} shared + ${privateDoc.expenses.length} private entries → ${mergedExpenses.length} total`);
        } catch (err) {
          // Non-critical — if merge fails, private file keeps its existing data
          // The shared file data is still accessible in Google Drive
          console.warn('[Settings] Could not merge family backup into private backup:', err);
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
      };

      // Step 3: Write current data to the new file
      await this.googleDriveService.writeBackupFile(newFileId, currentDoc);

      // Step 4: Update BackupModeService and ExpenseStore with the new file ID
      await this.backupModeService.setSharedFileId(newFileId);
      this.expenseStore.patchDriveFileId(newFileId);

      // Step 5: Show the new file ID to the user
      this.rotatedFileId.set(newFileId);
    } catch (err: any) {
      console.error('[Settings] File rotation failed:', err);
      const message = err?.message ?? 'Rotation failed. Please try again.';
      this.rotateError.set(message);
    } finally {
      this.isRotating.set(false);
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  #entriesToCsv(entries: ExpenseEntry[]): string {
    const header = 'id,date,amount,type,limit,savings,timestamp';
    const rows = entries.map((e) => {
      // Escape fields that may contain commas or quotes
      const escape = (val: string | number) => {
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      return [
        escape(e.id),
        escape(e.date),
        escape(e.amount),
        escape(e.type),
        escape(e.limit),
        escape(e.savings),
        escape(e.timestamp),
      ].join(',');
    });
    return [header, ...rows].join('\n');
  }
}
