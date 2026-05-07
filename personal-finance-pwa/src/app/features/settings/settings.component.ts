import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { SyncService } from '../../core/services/sync.service';
import { ExpenseStore } from '../../core/services/expense-store.service';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { ThemeService } from '../../core/services/theme.service';
import { SectionCardComponent, ModalComponent } from '../../shared/components';
import { ExpenseEntry } from '../../core/models';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Check,
  Copy,
  ExternalLink,
  Download,
  Trash2,
  Bell,
  Sun,
  Moon,
  Monitor,
} from 'lucide-angular';

// Extend the Window interface to include the beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, SectionCardComponent, ModalComponent, LucideAngularModule],
  providers: [
    {
      provide: LUCIDE_ICONS,
      multi: true,
      useValue: new LucideIconProvider({ Check, Copy, ExternalLink, Download, Trash2, Bell, Sun, Moon, Monitor }),
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-8">
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

      <!-- Google Sheets Connection -->
      <app-section-card  title="Google Sheets Connection">
        <!-- Action slot: animated Connected pill -->
        <span action class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style="background-color: color-mix(in oklab, var(--success) 15%, transparent); color: var(--success);">
          <span class="relative grid h-2 w-2 place-items-center">
            <span class="absolute inset-0 animate-ping rounded-full bg-current opacity-60"></span>
            <span class="relative h-2 w-2 rounded-full bg-current"></span>
          </span>
          Connected
        </span>

        <p class="text-xs text-muted-foreground">
          Found in your spreadsheet URL:
          <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit</code>
        </p>

        <div class="mt-3 flex flex-col gap-2 sm:flex-row">
          <!-- Input with copy + open buttons -->
          <div class="flex flex-1 items-center gap-2 rounded-2xl border border-border bg-card/60 px-4 py-2.5 focus-within:border-primary">
            <input
              type="text"
              class="w-full bg-transparent font-mono text-xs outline-none"
              spellcheck="false"
              placeholder="Paste your spreadsheet ID here"
              [value]="spreadsheetId() ?? ''"
              (input)="onSheetIdInput($event)"
              aria-label="Google Spreadsheet ID"
            />
            <button
              type="button"
              (click)="copySheetId()"
              class="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Copy spreadsheet ID"
            >
              @if (copied()) {
                <lucide-icon [img]="checkIcon" class="h-3.5 w-3.5" style="color: var(--success)" />
              } @else {
                <lucide-icon [img]="copyIcon" class="h-3.5 w-3.5" />
              }
            </button>
            <a
              [href]="'https://docs.google.com/spreadsheets/d/' + (spreadsheetId() ?? '') + '/edit'"
              target="_blank"
              rel="noreferrer"
              class="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Open spreadsheet in new tab"
            >
              <lucide-icon [img]="externalLinkIcon" class="h-3.5 w-3.5" />
            </a>
          </div>

          <!-- Save button -->
          <button
            type="button"
            (click)="onSaveSheetId()"
            class="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow gradient-primary"
          >
            Save
          </button>
        </div>

        @if (sheetIdSaved()) {
          <p class="mt-1 text-xs" style="color: var(--success)" role="status">Spreadsheet ID saved.</p>
        }

        <!-- Sign out -->
        @if (authService.isAuthenticated()) {
          <button
            type="button"
            (click)="onSignOut()"
            class="mt-3 inline-flex items-center justify-center rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        } @else {
          <button
            type="button"
            (click)="onSignIn()"
            class="mt-3 inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold text-primary-foreground gradient-primary shadow-glow"
          >
            Sign in with Google
          </button>
        }
      </app-section-card>

      <!-- Push Notifications -->
      <app-section-card  title="Push Notifications" description="Get reminders to log your expenses at your preferred interval.">
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

            <!-- iOS-style toggle -->
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

          <!-- Interval Selector (shown when enabled) -->
          @if (notificationService.isEnabled()) {
            <div class="rounded-xl border border-border bg-card/40 p-4">
              <label for="interval-range" class="block text-sm font-medium mb-3">
                Reminder interval: {{ intervalControl.value }} minutes
              </label>
              <div class="space-y-2">
                <input
                  type="range"
                  id="interval-range"
                  [formControl]="intervalControl"
                  (input)="onIntervalInput($event)"
                  min="15"
                  max="480"
                  step="15"
                  class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  aria-label="Notification interval in minutes"
                />
                <div class="flex justify-between text-xs text-muted-foreground">
                  <span>15 min</span>
                  <span>1 hour</span>
                  <span>2 hours</span>
                  <span>4 hours</span>
                  <span>8 hours</span>
                </div>
              </div>
              <p class="mt-2 text-xs text-muted-foreground">
                You'll receive a reminder every {{ intervalControl.value }} minutes to log your expenses.
              </p>
            </div>
          }
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
            Removes all locally cached data and the offline queue. This does not delete data from Google Sheets.
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
        synced to Google Sheets will not be affected. Are you sure?
      </p>
    </app-modal>
  `,
})
export class SettingsComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  readonly notificationService = inject(NotificationService);
  readonly syncService = inject(SyncService);
  readonly expenseStore = inject(ExpenseStore);
  readonly sheetsService = inject(GoogleSheetsService);
  readonly themeService = inject(ThemeService);

  // ─── Theme options ────────────────────────────────────────────────────────────
  readonly themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun, desc: 'Playful & colorful' },
    { value: 'dark' as const, label: 'Dark', icon: Moon, desc: 'Premium glassmorphism' },
    { value: 'system' as const, label: 'System', icon: Monitor, desc: 'Match my device' },
  ];

  // Icon references for template use
  readonly checkIcon = Check;
  readonly copyIcon = Copy;
  readonly externalLinkIcon = ExternalLink;
  readonly downloadIcon = Download;
  readonly trash2Icon = Trash2;
  readonly bellIcon = Bell;

  // ─── Copy state ───────────────────────────────────────────────────────────────
  readonly copied = signal<boolean>(false);

  // ─── Task 12.1: Connection status ────────────────────────────────────────────
  readonly spreadsheetId = signal<string | null>(null);
  readonly sheetIdSaved = signal<boolean>(false);

  // Tracks the current value of the sheet ID input before saving
  #pendingSheetId: string = '';

  // ─── Task 12.3: Interval form control ────────────────────────────────────────
  readonly intervalControl = new FormControl<number>(
    this.notificationService.intervalMinutes(),
    { nonNullable: true }
  );

  // ─── Task 12.4: PWA install prompt ───────────────────────────────────────────
  readonly deferredPrompt = signal<BeforeInstallPromptEvent | null>(null);

  // ─── Task 12.6: Clear modal state ────────────────────────────────────────────
  readonly isClearModalOpen = signal<boolean>(false);
  readonly clearSuccessMessage = signal<string | null>(null);

  private readonly beforeInstallHandler = (event: Event) => {
    event.preventDefault();
    this.deferredPrompt.set(event as BeforeInstallPromptEvent);
  };

  ngOnInit(): void {
    // Capture the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', this.beforeInstallHandler);

    // Load spreadsheet ID from metadata if available
    this.#loadSpreadsheetId();
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeinstallprompt', this.beforeInstallHandler);
  }

  // ─── Connection: sheet ID & sign-out ─────────────────────────────────────────

  onSheetIdInput(event: Event): void {
    this.#pendingSheetId = (event.target as HTMLInputElement).value.trim();
  }

  async copySheetId(): Promise<void> {
    const id = this.spreadsheetId();
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // clipboard not available
    }
  }

  async onSaveSheetId(): Promise<void> {
    const raw = this.#pendingSheetId.trim();
    if (!raw) return;

    // If the user pasted a full Google Sheets URL, extract just the ID.
    // URL pattern: /spreadsheets/d/<ID>/
    const urlMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    const id = urlMatch ? urlMatch[1] : raw;

    localStorage.setItem('pf_sheet_id', id);
    this.spreadsheetId.set(id);
    this.#pendingSheetId = id; // update so input reflects the extracted ID
    this.sheetIdSaved.set(true);
    setTimeout(() => this.sheetIdSaved.set(false), 3000);

    // Initialise sheets and reload data with the new ID
    try {
      await this.sheetsService.authenticate();
      await this.sheetsService.ensureSheets(id);
      await this.expenseStore.loadMonth(new Date().toISOString().slice(0, 7));
      await this.expenseStore.loadLimits();
    } catch {
      // Errors are surfaced via GoogleSheetsService.apiError$ → toast
    }
  }

  async onSignOut(): Promise<void> {
    await this.authService.signOut();
    // Router navigation is handled by the auth guard on the next route access
  }

  async onSignIn(): Promise<void> {
    try {
      await this.authService.signIn();
      // After sign-in, reload limits and current month data
      const currentMonth = new Date().toISOString().slice(0, 7);
      await this.expenseStore.loadMonth(currentMonth);
      await this.expenseStore.loadLimits();
    } catch (err) {
      console.error('[Settings] Sign-in failed:', err);
    }
  }

  // ─── Task 12.2: Notification toggle ──────────────────────────────────────────

  async onNotificationToggle(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      await this.notificationService.requestPermission();
      if (this.notificationService.permissionState() === 'granted') {
        await this.notificationService.enable(this.intervalControl.value);
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
        await this.notificationService.enable(this.intervalControl.value);
      }
    } else {
      await this.notificationService.disable();
    }
  }

  // ─── Task 12.3: Interval input ───────────────────────────────────────────────

  onIntervalInput(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) {
      this.intervalControl.setValue(value);
      this.notificationService.updateInterval(value);
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

  async #loadSpreadsheetId(): Promise<void> {
    const storedId =
      typeof localStorage !== 'undefined' ? localStorage.getItem('pf_sheet_id') : null;
    if (storedId) {
      this.spreadsheetId.set(storedId);
      this.#pendingSheetId = storedId;
    }
  }
}
