import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OfflineBannerComponent } from './shared/components/offline-banner/offline-banner.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { BottomNavComponent } from './shared/components/bottom-nav/bottom-nav.component';
import { ExpenseStore } from './core/services/expense-store.service';
import { GoogleSheetsService } from './core/services/google-sheets.service';

/** Waits for both GSI and gapi scripts to finish loading. */
function waitForScripts(): Promise<void> {
  const pending: Promise<void>[] = [];

  const waitFor = (selector: string): Promise<void> => {
    const script = document.querySelector(selector);
    if (!script) return Promise.resolve();
    // Already loaded (e.g. cached)
    if ((script as any).readyState === 'complete') return Promise.resolve();
    return new Promise<void>((resolve) => {
      script.addEventListener('load', () => resolve(), { once: true });
      script.addEventListener('error', () => resolve(), { once: true }); // resolve anyway
    });
  };

  pending.push(waitFor('script[src*="accounts.google.com/gsi/client"]'));
  pending.push(waitFor('script[src*="apis.google.com/js/api"]'));

  return Promise.all(pending).then(() => void 0);
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, OfflineBannerComponent, ToastComponent, BottomNavComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  private readonly sheetsService = inject(GoogleSheetsService);
  private readonly expenseStore = inject(ExpenseStore);

  async ngOnInit(): Promise<void> {
    console.log('[App] ngOnInit called');
    
    const sheetId =
      typeof localStorage !== 'undefined' ? localStorage.getItem('pf_sheet_id') : null;

    console.log('[App] ngOnInit — sheetId:', sheetId, '| gapi_auth_state:', localStorage.getItem('gapi_auth_state'));

    if (!sheetId || localStorage.getItem('gapi_auth_state') !== '1') {
      console.warn('[App] Skipping bootstrap — missing sheetId or auth state');
      return;
    }

    try {
      console.log('[App] Waiting for scripts...');
      await waitForScripts();
      console.log('[App] Scripts ready. Authenticating...');
      await this.sheetsService.authenticate();
      console.log('[App] Authenticated. Ensuring sheets exist...');
      await this.sheetsService.ensureSheets(sheetId);
      console.log('[App] Sheets ready. Loading data...');

      const currentMonth = new Date().toISOString().slice(0, 7);
      await Promise.all([
        this.expenseStore.loadLimits(),
        this.expenseStore.loadMonth(currentMonth),
      ]);
      console.log('[App] Bootstrap complete. Income:', this.expenseStore.monthlyIncome(), '| Limits:', this.expenseStore.limits().length);
    } catch (err) {
      console.error('[App] Bootstrap data load failed:', err);
      // Even if bootstrap fails, individual components will try to load limits when needed
    }
  }
}
