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
import {
  CardComponent,
  ButtonComponent,
  ModalComponent,
} from '../../shared/components';
import { ExpenseEntry } from '../../core/models';

// Extend the Window interface to include the beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, CardComponent, ButtonComponent, ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gray-50 p-4 pb-20">
      <h1 class="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <!-- Connection Status card -->
      <app-card class="block mb-4">
        <h2 class="text-lg font-semibold text-gray-800 mb-3">Google Sheets Connection</h2>
        <div class="flex items-center gap-2 mb-3">
          <span
            class="inline-block w-3 h-3 rounded-full"
            [class.bg-green-500]="authService.isAuthenticated()"
            [class.bg-red-500]="!authService.isAuthenticated()"
            aria-hidden="true"
          ></span>
          <span class="text-sm font-medium text-gray-700">
            {{ authService.isAuthenticated() ? 'Connected' : 'Disconnected' }}
          </span>
        </div>

        @if (authService.userEmail()) {
          <p class="text-sm text-gray-500 mb-3">Signed in as: {{ authService.userEmail() }}</p>
        }

        <!-- Spreadsheet ID input -->
        <div class="mb-4">
          <label for="sheet-id" class="block text-sm font-medium text-gray-700 mb-1">
            Google Spreadsheet ID
          </label>
          <p class="text-xs text-gray-500 mb-2">
            Found in the spreadsheet URL:
            <span class="font-mono">docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit</span>
          </p>
          <div class="flex gap-2">
            <input
              id="sheet-id"
              type="text"
              class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Paste your spreadsheet ID here"
              [value]="spreadsheetId() ?? ''"
              (input)="onSheetIdInput($event)"
              aria-label="Google Spreadsheet ID"
            />
            <app-button variant="primary" (click)="onSaveSheetId()">Save</app-button>
          </div>
          @if (sheetIdSaved()) {
            <p class="text-xs text-green-600 mt-1" role="status">Spreadsheet ID saved.</p>
          }
        </div>

        <!-- Sign in / Sign out -->
        @if (authService.isAuthenticated()) {
          <app-button variant="ghost" (click)="onSignOut()">Sign out</app-button>
        } @else {
          <app-button variant="primary" (click)="onSignIn()">Sign in with Google</app-button>
        }
      </app-card>

      <!-- Notifications card -->
      <app-card class="block mb-4">
        <h2 class="text-lg font-semibold text-gray-800 mb-3">Push Notifications</h2>

        <div class="flex items-center justify-between mb-3">
          <label for="notif-toggle" class="text-sm font-medium text-gray-700">
            Enable reminders
          </label>
          <input
            id="notif-toggle"
            type="checkbox"
            class="w-5 h-5 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
            [checked]="notificationService.isEnabled()"
            [disabled]="notificationService.permissionState() === 'denied'"
            (change)="onNotificationToggle($event)"
            aria-describedby="notif-denied-msg"
          />
        </div>

        @if (notificationService.permissionState() === 'denied') {
          <p id="notif-denied-msg" class="text-sm text-red-600 mb-3">
            Notification permission has been denied. Please enable it in your browser settings to
            use reminders.
          </p>
        }

        @if (notificationService.isEnabled()) {
          <div class="mt-4 space-y-3">
            <label for="interval-range" class="block text-sm font-medium text-gray-700">
              Reminder interval: {{ intervalControl.value }} minutes
            </label>
            <input
              id="interval-range"
              type="range"
              min="15"
              max="480"
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              [formControl]="intervalControl"
              (input)="onIntervalInput($event)"
              aria-label="Reminder interval in minutes (range slider)"
            />
            <div class="flex items-center gap-2">
              <label for="interval-number" class="text-sm text-gray-600 whitespace-nowrap">
                Minutes:
              </label>
              <input
                id="interval-number"
                type="number"
                min="15"
                max="480"
                class="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                [formControl]="intervalControl"
                (input)="onIntervalInput($event)"
                aria-label="Reminder interval in minutes (numeric input)"
              />
            </div>
          </div>
        }
      </app-card>

      <!-- PWA Install card -->
      @if (deferredPrompt()) {
        <app-card class="block mb-4">
          <h2 class="text-lg font-semibold text-gray-800 mb-3">Install App</h2>
          <p class="text-sm text-gray-600 mb-3">
            Install Personal Finance on your device for quick access from your home screen.
          </p>
          <app-button variant="primary" (click)="onInstallClick()">
            Install App
          </app-button>
        </app-card>
      }

      <!-- Data Management card -->
      <app-card class="block mb-4">
        <h2 class="text-lg font-semibold text-gray-800 mb-3">Data Management</h2>

        <div class="space-y-3">
          <!-- Export CSV -->
          <div>
            <p class="text-sm text-gray-600 mb-2">
              Download all your expense entries as a CSV file.
            </p>
            <app-button variant="ghost" (click)="onExportCsv()">
              Export to CSV
            </app-button>
          </div>

          <hr class="border-gray-200" />

          <!-- Clear Local Data -->
          <div>
            <p class="text-sm text-gray-600 mb-2">
              Remove all locally cached data and the offline queue. This does not delete data from
              Google Sheets.
            </p>
            <app-button variant="danger" (click)="openClearModal()">
              Clear Local Data
            </app-button>
          </div>
        </div>
      </app-card>

      @if (clearSuccessMessage()) {
        <p class="text-sm text-green-600 mt-2 text-center" role="status">
          {{ clearSuccessMessage() }}
        </p>
      }
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
