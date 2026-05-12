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
import { SyncService } from '../../core/services/sync.service';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { ThemeService } from '../../core/services/theme.service';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { BackupModeService } from '../../core/services/backup-mode.service';
import { GoogleDriveService, BackupDocument } from '../../core/services/google-drive.service';
import { METADATA_MONTHLY_INCOME } from '../../core/models';
import { SectionCardComponent, ModalComponent } from '../../shared/components';
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
  imports: [FormsModule, SectionCardComponent, ModalComponent, LucideAngularModule],
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
        <h1 class="text-2xl font-semibold tracking-tight md:text-3xl">Settings</h1>
        <p class="mt-1 text-sm text-muted-foreground">Personalize the app and manage your data.</p>
      </div>

      <!-- Appearance -->
      <app-section-card 
        title="Appearance"
        description="Switch between the playful light mode and premium glass dark mode."
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

      <!-- Google Drive Backup -->
      <app-section-card title="Google Drive Backup">

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

          <!-- Shared File ID read-only field with Copy button -->
          <div class="mt-3 flex items-center gap-2">
            <input
              type="text"
              [value]="backupModeService.sharedFileId() ?? ''"
              readonly
              aria-label="Shared File ID"
              class="flex-1 rounded-2xl border border-border bg-muted/40 px-4 py-2.5 font-mono text-xs text-foreground outline-none cursor-default"
            />
            <button
              type="button"
              (click)="onCopySharedFileId()"
              aria-label="Copy shared file ID"
              class="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card/40 px-3 py-2.5 text-xs font-medium hover:border-primary/40"
            >
              <lucide-icon [img]="copyIcon" class="h-4 w-4" />
              Copy
            </button>
          </div>

          <!-- Google Drive link -->
          @if (backupModeService.sharedFileId()) {
            <a
              [href]="'https://drive.google.com/file/d/' + backupModeService.sharedFileId() + '/view'"
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
              Sign out
            </button>
          } @else {
            <button
              type="button"
              (click)="onSignIn()"
              class="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-xs font-semibold text-primary-foreground gradient-primary shadow-glow"
            >
              Sign in with Google
            </button>
          }

          <!-- ── Switch backup mode (always shown) ───────────────────────────── -->
          <button
            type="button"
            (click)="onSwitchBackupMode()"
            class="inline-flex items-center gap-2 rounded-xl border border-border bg-card/40 px-4 py-2.5 text-xs font-medium hover:border-primary/40"
          >
            <lucide-icon [img]="arrowLeftRightIcon" class="h-4 w-4" />
            Switch backup mode
          </button>
        </div>

      </app-section-card>

      <!-- Import from Google Sheets -->
      <app-section-card title="Import from Google Sheets" description="One-time migration: copy all your existing expense data into Google Drive.">
        <p class="text-xs text-muted-foreground mb-3">
          Paste your Google Spreadsheet ID below. Found in the URL:
          <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit</code>
        </p>

        <div class="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            [(ngModel)]="importSheetId"
            placeholder="Paste spreadsheet ID here"
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
              Importing…
            } @else {
              <lucide-icon [img]="importIcon" class="h-4 w-4" />
              Import
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
      <app-section-card class="relative z-50" title="Push Notifications" description="Get reminders to log your expenses.">
        <div class="space-y-4">

          <!-- Enable/Disable Toggle -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                <lucide-icon [img]="bellIcon" class="h-5 w-5" />
              </span>
              <div>
                <p class="text-sm font-medium">Enable reminders</p>
                <p class="text-xs text-muted-foreground">Get notifications to log your expenses.</p>
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

      <!-- Data Management -->
      <app-section-card  title="Data Management" description="Export your data or clear local cache.">
        <button
          type="button"
          (click)="onExportCsv()"
          class="inline-flex items-center gap-2 rounded-xl border border-border bg-card/40 px-4 py-2.5 text-sm font-medium hover:border-primary/40"
        >
          <lucide-icon [img]="downloadIcon" class="h-4 w-4" />
          Export to CSV
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
      title="Clear Local Data"
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
      title="Switch Backup Mode"
      [isOpen]="isSwitchModeModalOpen()"
      (confirmed)="onSwitchModeConfirmed()"
      (cancelled)="onSwitchModeCancelled()"
    >
      <p class="text-sm text-gray-700">
        Switching modes will disconnect you from your current backup. Your existing data will not be deleted from Google Drive. Continue?
      </p>
    </app-modal>

    <!-- Switch backup mode — Owner secondary warning modal -->
    <app-modal
      title="Partner Access Warning"
      [isOpen]="isOwnerSwitchWarningOpen()"
      (confirmed)="onOwnerSwitchWarningConfirmed()"
      (cancelled)="onOwnerSwitchWarningCancelled()"
    >
      <p class="text-sm text-gray-700">
        Your partner can still access the shared file until you remove their access in Google Drive.
      </p>
      @if (backupModeService.sharedFileId()) {
        <a
          [href]="'https://drive.google.com/file/d/' + backupModeService.sharedFileId() + '/view'"
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
  readonly syncService = inject(SyncService);
  readonly expenseStore = inject(ExpenseStore);
  readonly themeService = inject(ThemeService);
  private readonly sheetsService = inject(GoogleSheetsService);
  readonly backupModeService = inject(BackupModeService);
  private readonly googleDriveService = inject(GoogleDriveService);
  private readonly router = inject(Router);

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
        `Imported ${allExpenses.length} expenses, ${limits.length} budget limits, and monthly income ₹${monthlyIncome.toLocaleString()}.`
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
      await this.notificationService.requestPermission();
      if (this.notificationService.permissionState() === 'granted') {
        await this.notificationService.enable();
      }
    } else {
      await this.notificationService.disable();
    }
  }

  async onNotificationToggleClick(): Promise<void> {
    const isEnabled = this.notificationService.isEnabled();
    if (!isEnabled) {
      await this.notificationService.requestPermission();
      if (this.notificationService.permissionState() === 'granted') {
        await this.notificationService.enable();
      }
    } else {
      await this.notificationService.disable();
    }
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
    const fileId = this.backupModeService.sharedFileId();
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
          currency: 'INR',
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
