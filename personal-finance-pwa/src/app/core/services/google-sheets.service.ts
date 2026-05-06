import { Injectable } from '@angular/core';
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
    // Script may have already loaded (readyState) even if gapi isn't on window yet
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Failed to load gapi script')));
  });
}

// ─── Sheet header rows ────────────────────────────────────────────────────────

const EXPENSES_HEADERS = ['date', 'amount', 'type', 'limit', 'savings', 'timestamp', 'id', 'comment'];
const LIMITS_HEADERS   = ['type', 'recommendedPercentage', 'userPercentage', 'category'];
const METADATA_HEADERS = ['key', 'value'];

@Injectable({ providedIn: 'root' })
export class GoogleSheetsService {

  // ─── Task 4.1: error channel ─────────────────────────────────────────────────
  readonly apiError$ = new Subject<SheetsApiError>();

  /** Single shared promise so gapi.client.init runs exactly once. */
  #initPromise: Promise<void> | null = null;

  constructor(private readonly authService: AuthService) {}

  // ─── Ensures gapi client + Sheets discovery doc are ready ────────────────────

  private ensureReady(): Promise<void> {
    if (this.#initPromise) return this.#initPromise;

    this.#initPromise = (async () => {
      // 1. Wait for the <script> tag to finish loading
      await waitForGapiScript();

      // 2. Load the gapi 'client' module (safe to call multiple times)
      await new Promise<void>((resolve, reject) => {
        gapi.load('client', { callback: resolve, onerror: reject });
      });

      // 3. Load the Sheets discovery doc — this is what creates gapi.client.sheets
      await gapi.client.init({
        discoveryDocs: [
          'https://sheets.googleapis.com/$discovery/rest?version=v4',
        ],
      });
    })();

    return this.#initPromise;
  }

  // ─── Task 4.1: authenticate ──────────────────────────────────────────────────

  async authenticate(): Promise<void> {
    try {
      await this.ensureReady();

      const token = this.authService.getAccessToken();
      if (token) {
        gapi.client.setToken({ access_token: token });
      }
    } catch (error: any) {
      // Reset so a retry is possible after a transient failure
      this.#initPromise = null;
      this.handleError(error, 'authenticate');
    }
  }

  // ─── Task 4.2: ensureSheets ───────────────────────────────────────────────────

  async ensureSheets(sheetId: string): Promise<void> {
    try {
      await this.ensureReady();
      await this.#applyToken();

      const response = await gapi.client.sheets.spreadsheets.get({
        spreadsheetId: sheetId,
      });

      const existingSheets: string[] = (response.result.sheets ?? []).map(
        (s: any) => s.properties?.title as string
      );

      const required: Array<{ name: string; headers: string[] }> = [
        { name: 'expenses', headers: EXPENSES_HEADERS },
        { name: 'limits',   headers: LIMITS_HEADERS   },
        { name: 'metadata', headers: METADATA_HEADERS },
      ];

      for (const sheet of required) {
        if (!existingSheets.includes(sheet.name)) {
          // Add the sheet tab
          await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: sheetId,
            resource: {
              requests: [
                {
                  addSheet: {
                    properties: { title: sheet.name },
                  },
                },
              ],
            },
          });

          // Write the header row
          await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `${sheet.name}!A1`,
            valueInputOption: 'RAW',
            resource: {
              values: [sheet.headers],
            },
          });
        }
      }
    } catch (error: any) {
      this.handleError(error, 'ensureSheets');
    }
  }

  // ─── Task 4.3: serialization helpers ─────────────────────────────────────────

  private serializeExpenseEntry(entry: ExpenseEntry): string[] {
    return [
      entry.date,
      entry.amount.toString(),
      entry.type,
      entry.limit.toString(),
      entry.savings.toString(),
      entry.timestamp,
      entry.id,
      entry.comment ?? '',  // Add comment in column H
    ];
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
      comment:   row[7] || undefined,  // Read comment from column H
    };
  }

  // ─── Task 4.4: readExpenses ───────────────────────────────────────────────────

  async readExpenses(sheetId: string, month: string): Promise<ExpenseEntry[]> {
    console.log('[GoogleSheetsService] readExpenses called for month:', month);
    try {
      await this.ensureReady();
      await this.#applyToken();

      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'expenses!A2:H',  // Include column H for comments
      });

      const rows: string[][] = response.result.values ?? [];
      console.log('[GoogleSheetsService] readExpenses - fetched', rows.length, 'rows from sheet');
      console.log('[GoogleSheetsService] readExpenses - first 3 rows:', rows.slice(0, 3));

      const filtered = rows.filter((row) => row.length >= 7 && row[0]?.startsWith(month));
      console.log('[GoogleSheetsService] readExpenses - filtered to', filtered.length, 'rows for month', month);
      console.log('[GoogleSheetsService] readExpenses - first filtered row:', filtered[0]);

      const deserialized = filtered.map((row) => this.deserializeExpenseEntry(row));
      console.log('[GoogleSheetsService] readExpenses - first deserialized entry:', deserialized[0]);
      
      return deserialized;
    } catch (error: any) {
      console.error('[GoogleSheetsService] readExpenses - error:', error);
      this.handleError(error, 'readExpenses');
      return [];
    }
  }

  // ─── Task 4.5: writeExpense ───────────────────────────────────────────────────

  async writeExpense(sheetId: string, entry: ExpenseEntry): Promise<void> {
    try {
      await this.ensureReady();
      await this.#applyToken();

      const response = await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'expenses!A2:H',  // Include column H for comments
        valueInputOption: 'RAW',
        resource: {
          values: [this.serializeExpenseEntry(entry)],
        },
      });

      const status: number = response.status ?? 200;
      if (status < 200 || status >= 300) {
        throw {
          status,
          result: { error: { message: `Unexpected status ${status}` } },
        };
      }
    } catch (error: any) {
      this.handleError(error, 'writeExpense');
    }
  }

  // ─── Task 4.6: batchUpdate ────────────────────────────────────────────────────

  async batchUpdate(sheetId: string, rows: ExpenseEntry[]): Promise<void> {
    console.log('[GoogleSheetsService] batchUpdate called with', rows.length, 'rows');
    try {
      await this.ensureReady();
      await this.#applyToken();

      // Use append instead of batchUpdate to add new rows instead of replacing
      // Use A2:H range to ensure we append after the header row
      for (const entry of rows) {
        const serialized = this.serializeExpenseEntry(entry);
        console.log('[GoogleSheetsService] Appending entry:', entry.id, '| data:', serialized);
        
        const response = await gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: 'expenses!A2:H',  // Include column H for comments
          valueInputOption: 'RAW',
          resource: {
            values: [serialized],
          },
        });
        
        console.log('[GoogleSheetsService] Append response:', response);
      }
      console.log('[GoogleSheetsService] batchUpdate completed successfully');
    } catch (error: any) {
      console.error('[GoogleSheetsService] batchUpdate error:', error);
      this.handleError(error, 'batchUpdate');
      throw error;
    }
  }

  // ─── Delete Expense ───────────────────────────────────────────────────────────

  async deleteExpense(sheetId: string, entryId: string): Promise<void> {
    console.log('[GoogleSheetsService] deleteExpense called for entry:', entryId);
    try {
      await this.ensureReady();
      await this.#applyToken();

      // First, read all expenses to find the row index
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'expenses!A2:H',
      });

      const rows: string[][] = response.result.values ?? [];
      console.log('[GoogleSheetsService] deleteExpense - fetched', rows.length, 'rows');

      // Find the row index (0-based in the array, but we need sheet row number)
      const rowIndex = rows.findIndex((row) => row[6] === entryId); // Column G (index 6) contains the ID

      if (rowIndex === -1) {
        console.warn('[GoogleSheetsService] deleteExpense - entry not found:', entryId);
        return; // Entry not found, nothing to delete
      }

      // Calculate the actual sheet row number (add 2: 1 for header, 1 for 0-based to 1-based)
      const sheetRowNumber = rowIndex + 2;
      console.log('[GoogleSheetsService] deleteExpense - deleting row:', sheetRowNumber);

      // Delete the row using batchUpdate with DeleteDimensionRequest
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        resource: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: await this.getSheetIdByName(sheetId, 'expenses'),
                  dimension: 'ROWS',
                  startIndex: sheetRowNumber - 1, // 0-based for API
                  endIndex: sheetRowNumber, // Exclusive end
                },
              },
            },
          ],
        },
      });

      console.log('[GoogleSheetsService] deleteExpense - successfully deleted entry:', entryId);
    } catch (error: any) {
      console.error('[GoogleSheetsService] deleteExpense error:', error);
      this.handleError(error, 'deleteExpense');
    }
  }

  // ─── Update Expense ───────────────────────────────────────────────────────────

  async updateExpense(sheetId: string, entry: ExpenseEntry): Promise<void> {
    console.log('[GoogleSheetsService] updateExpense called for entry:', entry.id);
    try {
      await this.ensureReady();
      await this.#applyToken();

      // First, read all expenses to find the row index
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'expenses!A2:H',
      });

      const rows: string[][] = response.result.values ?? [];
      console.log('[GoogleSheetsService] updateExpense - fetched', rows.length, 'rows');

      // Find the row index (0-based in the array, but we need sheet row number)
      const rowIndex = rows.findIndex((row) => row[6] === entry.id); // Column G (index 6) contains the ID

      if (rowIndex === -1) {
        console.warn('[GoogleSheetsService] updateExpense - entry not found, creating new:', entry.id);
        // If not found, create it as a new entry
        await this.writeExpense(sheetId, entry);
        return;
      }

      // Calculate the actual sheet row number (add 2: 1 for header, 1 for 0-based to 1-based)
      const sheetRowNumber = rowIndex + 2;
      console.log('[GoogleSheetsService] updateExpense - updating row:', sheetRowNumber);

      // Update the row
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `expenses!A${sheetRowNumber}:H${sheetRowNumber}`,
        valueInputOption: 'RAW',
        resource: {
          values: [this.serializeExpenseEntry(entry)],
        },
      });

      console.log('[GoogleSheetsService] updateExpense - successfully updated entry:', entry.id);
    } catch (error: any) {
      console.error('[GoogleSheetsService] updateExpense error:', error);
      this.handleError(error, 'updateExpense');
    }
  }

  // ─── Helper: Get Sheet ID by Name ────────────────────────────────────────────

  private async getSheetIdByName(spreadsheetId: string, sheetName: string): Promise<number> {
    const response = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheet = response.result.sheets?.find(
      (s: any) => s.properties?.title === sheetName
    );

    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found in spreadsheet`);
    }

    return sheet.properties.sheetId;
  }

  // ─── Task 4.7: readLimits / writeLimits ──────────────────────────────────────

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

  async writeLimits(sheetId: string, limits: ExpenseLimit[]): Promise<void> {
    try {
      await this.ensureReady();
      await this.#applyToken();

      await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: 'limits!A2:D',
      });

      if (limits.length > 0) {
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: 'limits!A2',
          valueInputOption: 'RAW',
          resource: {
            values: limits.map((limit) => this.serializeExpenseLimit(limit)),
          },
        });
      }
    } catch (error: any) {
      this.handleError(error, 'writeLimits');
    }
  }

  private serializeExpenseLimit(limit: ExpenseLimit): string[] {
    return [
      limit.type,
      limit.recommendedPercentage.toString(),
      limit.userPercentage.toString(),
      limit.category,
    ];
  }

  private deserializeExpenseLimit(row: string[]): ExpenseLimit {
    return {
      type:                  row[0],
      recommendedPercentage: parseFloat(row[1]),
      userPercentage:        parseFloat(row[2]),
      category:              row[3] as ExpenseLimit['category'],
    };
  }

  // ─── Task 4.8: readMetadata / writeMetadata ───────────────────────────────────

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

  async writeMetadata(sheetId: string, key: string, value: string): Promise<void> {
    try {
      await this.ensureReady();
      await this.#applyToken();

      // Read existing metadata to find the row index for this key
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'metadata!A2:B',
      });

      const rows: string[][] = response.result.values ?? [];
      const rowIndex = rows.findIndex((row) => row[0] === key);

      if (rowIndex !== -1) {
        // Update the existing row (rowIndex is 0-based; row 2 in sheet = index 0)
        const sheetRow = rowIndex + 2; // +1 for header, +1 for 1-based index
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `metadata!A${sheetRow}:B${sheetRow}`,
          valueInputOption: 'RAW',
          resource: {
            values: [[key, value]],
          },
        });
      } else {
        // Append a new row
        await gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: 'metadata!A:B',
          valueInputOption: 'RAW',
          resource: {
            values: [[key, value]],
          },
        });
      }
    } catch (error: any) {
      this.handleError(error, 'writeMetadata');
    }
  }

  // ─── Private error helper ─────────────────────────────────────────────────────

  /** Attaches the current OAuth token to every gapi request. */
  async #applyToken(): Promise<void> {
    const token = await this.authService.ensureToken();
    gapi.client.setToken({ access_token: token });
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
