import { Injectable, isDevMode } from '@angular/core';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
import {
  ExpenseEntry,
  ExpenseLimit,
  SheetsApiError,
} from '../models';

// Ambient type declaration for the dynamically loaded gapi client
declare const gapi: any;

/** Resolves once the gapi script tag has finished loading. */
function waitForGapiScript(): Promise<void> {
  if (typeof gapi !== 'undefined') return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const script = document.querySelector('script[src*="apis.google.com/js/api"]');
    if (!script) {
      reject(new Error(
        'gapi script not found. Add <script src="https://apis.google.com/js/api.js"> to index.html'
      ));
      return;
    }
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Failed to load gapi script')));
  });
}

@Injectable({ providedIn: 'root' })
export class GoogleSheetsService {

  readonly apiError$ = new Subject<SheetsApiError>();

  /** Single shared promise so gapi.client.init runs exactly once. */
  #initPromise: Promise<void> | null = null;

  constructor(private readonly authService: AuthService) {}

  private ensureReady(): Promise<void> {
    if (this.#initPromise) return this.#initPromise;

    this.#initPromise = (async () => {
      await waitForGapiScript();

      await new Promise<void>((resolve, reject) => {
        gapi.load('client', { callback: resolve, onerror: reject });
      });

      await gapi.client.init({
        discoveryDocs: [
          'https://sheets.googleapis.com/$discovery/rest?version=v4',
        ],
      });
    })();

    return this.#initPromise;
  }

  async authenticate(): Promise<void> {
    try {
      await this.ensureReady();

      const token = this.authService.getAccessToken();
      if (token) {
        gapi.client.setToken({ access_token: token });
      }
    } catch (error: any) {
      this.#initPromise = null;
      this.handleError(error, 'authenticate');
    }
  }

  async readExpenses(sheetId: string, month: string): Promise<ExpenseEntry[]> {
    if (isDevMode()) { console.log('[GoogleSheetsService] readExpenses called for month:', month); }
    try {
      await this.ensureReady();
      await this.#applyToken();

      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'expenses!A2:H',
      });

      const rows: string[][] = response.result.values ?? [];
      const filtered = rows.filter((row) => row.length >= 7 && row[0]?.startsWith(month));
      return filtered.map((row) => this.deserializeExpenseEntry(row));
    } catch (error: any) {
      console.error('[GoogleSheetsService] readExpenses - error:', error);
      this.handleError(error, 'readExpenses');
    }
  }

  async readLimits(sheetId: string): Promise<ExpenseLimit[]> {
    try {
      await this.ensureReady();
      await this.#applyToken();

      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'limits!A2:D',
      });

      const rows: string[][] = response.result.values ?? [];

      return rows
        .filter((row) => row.length >= 4)
        .map((row) => this.deserializeExpenseLimit(row));
    } catch (error: any) {
      this.handleError(error, 'readLimits');
    }
  }

  async readMetadata(sheetId: string): Promise<Record<string, string>> {
    try {
      await this.ensureReady();
      await this.#applyToken();

      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'metadata!A2:B',
      });

      const rows: string[][] = response.result.values ?? [];
      const result: Record<string, string> = {};

      for (const row of rows) {
        if (row.length >= 2) {
          result[row[0]] = row[1];
        }
      }

      return result;
    } catch (error: any) {
      this.handleError(error, 'readMetadata');
    }
  }

  /** Attaches the current OAuth token to every gapi request. */
  async #applyToken(): Promise<void> {
    const token = await this.authService.ensureToken();
    gapi.client.setToken({ access_token: token });
  }

  private deserializeExpenseEntry(row: string[]): ExpenseEntry {
    return {
      date:      row[0],
      amount:    parseFloat(row[1]),
      type:      row[2],
      limit:     parseFloat(row[3]),
      savings:   parseFloat(row[4]),
      timestamp: row[5],
      id:        row[6],
      comment:   row[7] || undefined,
    };
  }

  private deserializeExpenseLimit(row: string[]): ExpenseLimit {
    return {
      type:                  row[0],
      recommendedPercentage: parseFloat(row[1]),
      userPercentage:        parseFloat(row[2]),
      category:              row[3] as ExpenseLimit['category'],
    };
  }

  private handleError(error: any, operation: string): never {
    const apiError: SheetsApiError = {
      status:    error?.status ?? error?.result?.error?.code ?? 0,
      message:   error?.result?.error?.message ?? error?.message ?? 'Unknown error',
      operation,
    };
    this.apiError$.next(apiError);
    throw apiError;
  }
}
