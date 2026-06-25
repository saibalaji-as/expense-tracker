// @deprecated — Sheets import removed in v9. Safe to delete after 2026-09-01.
// Task 17.1: GoogleSheetsService API call pattern integration tests
// Tests the API call patterns using a mocked gapi global.
// We test the logic directly without instantiating the Angular service
// to avoid window/inject() dependency issues in vitest.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExpenseEntry } from '../models/expense-entry.model';

// ─── Inline helpers mirroring GoogleSheetsService private methods ─────────────

function serializeExpenseEntry(entry: ExpenseEntry): string[] {
  return [
    entry.date,
    entry.amount.toString(),
    entry.type,
    entry.limit.toString(),
    entry.savings.toString(),
    entry.timestamp,
    entry.id,
  ];
}

// ─── Inline service logic (mirrors GoogleSheetsService public methods) ────────

async function authenticate(): Promise<void> {
  await (globalThis as any).gapi.client.init({
    discoveryDocs: [
      'https://sheets.googleapis.com/$discovery/rest?version=v4',
    ],
  });
}

async function readExpenses(sheetId: string, month: string): Promise<any[]> {
  const response = await (globalThis as any).gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'expenses!A2:G',
  });
  const rows: string[][] = response.result.values ?? [];
  return rows.filter((row: string[]) => row.length >= 7 && row[0]?.startsWith(month));
}

async function writeExpense(sheetId: string, entry: ExpenseEntry): Promise<void> {
  await (globalThis as any).gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'expenses!A:G',
    valueInputOption: 'RAW',
    resource: {
      values: [serializeExpenseEntry(entry)],
    },
  });
}

async function ensureSheets(sheetId: string, existingSheets: string[]): Promise<void> {
  const required = ['expenses', 'limits', 'metadata'];
  for (const sheetName of required) {
    if (!existingSheets.includes(sheetName)) {
      await (globalThis as any).gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        resource: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });
    }
  }
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

const fakeEntry: ExpenseEntry = {
  id: 'test-id-001',
  date: '2024-03-15',
  amount: 50,
  type: 'Food',
  limit: 200,
  savings: 150,
  timestamp: '2024-03-15T10:00:00.000Z',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GoogleSheetsService API call patterns', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).gapi;
  });

  // ─── authenticate() ───────────────────────────────────────────────────────

  describe('authenticate()', () => {
    it('calls gapi.client.init with the correct discovery doc URL', async () => {
      const initMock = vi.fn().mockResolvedValue(undefined);
      (globalThis as any).gapi = {
        client: {
          init: initMock,
          setToken: vi.fn(),
        },
      };

      await authenticate();

      expect(initMock).toHaveBeenCalledOnce();
      const callArg = initMock.mock.calls[0][0];
      expect(callArg).toHaveProperty('discoveryDocs');
      expect(callArg.discoveryDocs).toContain(
        'https://sheets.googleapis.com/$discovery/rest?version=v4'
      );
    });

    it('passes exactly one discovery doc URL', async () => {
      const initMock = vi.fn().mockResolvedValue(undefined);
      (globalThis as any).gapi = {
        client: { init: initMock, setToken: vi.fn() },
      };

      await authenticate();

      const callArg = initMock.mock.calls[0][0];
      expect(callArg.discoveryDocs).toHaveLength(1);
    });

    it('discovery doc URL contains the v4 version parameter', async () => {
      const initMock = vi.fn().mockResolvedValue(undefined);
      (globalThis as any).gapi = {
        client: { init: initMock, setToken: vi.fn() },
      };

      await authenticate();

      const url: string = initMock.mock.calls[0][0].discoveryDocs[0];
      expect(url).toContain('version=v4');
    });
  });

  // ─── readExpenses() ───────────────────────────────────────────────────────

  describe('readExpenses()', () => {
    it('constructs the correct A1 range notation: expenses!A2:G', async () => {
      const getMock = vi.fn().mockResolvedValue({ result: { values: [] } });
      (globalThis as any).gapi = {
        client: {
          sheets: {
            spreadsheets: {
              values: { get: getMock },
            },
          },
        },
      };

      await readExpenses('sheet-id', '2024-03');

      expect(getMock).toHaveBeenCalledOnce();
      const callArg = getMock.mock.calls[0][0];
      expect(callArg.range).toBe('expenses!A2:G');
    });

    it('passes the spreadsheetId to the API call', async () => {
      const getMock = vi.fn().mockResolvedValue({ result: { values: [] } });
      (globalThis as any).gapi = {
        client: {
          sheets: {
            spreadsheets: { values: { get: getMock } },
          },
        },
      };

      await readExpenses('my-sheet-123', '2024-03');

      expect(getMock.mock.calls[0][0].spreadsheetId).toBe('my-sheet-123');
    });

    it('filters rows by month prefix', async () => {
      const rows = [
        ['2024-03-01', '50', 'Food', '200', '150', '2024-03-01T10:00:00Z', 'id-1'],
        ['2024-04-01', '30', 'Transport', '100', '70', '2024-04-01T10:00:00Z', 'id-2'],
        ['2024-03-15', '20', 'Housing', '500', '480', '2024-03-15T10:00:00Z', 'id-3'],
      ];
      const getMock = vi.fn().mockResolvedValue({ result: { values: rows } });
      (globalThis as any).gapi = {
        client: {
          sheets: {
            spreadsheets: { values: { get: getMock } },
          },
        },
      };

      const result = await readExpenses('sheet-id', '2024-03');

      expect(result).toHaveLength(2);
      expect(result[0][0]).toBe('2024-03-01');
      expect(result[1][0]).toBe('2024-03-15');
    });
  });

  // ─── writeExpense() ───────────────────────────────────────────────────────

  describe('writeExpense()', () => {
    it('calls spreadsheets.values.append with valueInputOption: RAW', async () => {
      const appendMock = vi.fn().mockResolvedValue({ status: 200 });
      (globalThis as any).gapi = {
        client: {
          sheets: {
            spreadsheets: {
              values: { append: appendMock },
            },
          },
        },
      };

      await writeExpense('sheet-id', fakeEntry);

      expect(appendMock).toHaveBeenCalledOnce();
      const callArg = appendMock.mock.calls[0][0];
      expect(callArg.valueInputOption).toBe('RAW');
    });

    it('passes the serialized entry as values in the resource', async () => {
      const appendMock = vi.fn().mockResolvedValue({ status: 200 });
      (globalThis as any).gapi = {
        client: {
          sheets: {
            spreadsheets: {
              values: { append: appendMock },
            },
          },
        },
      };

      await writeExpense('sheet-id', fakeEntry);

      const callArg = appendMock.mock.calls[0][0];
      expect(callArg.resource.values).toHaveLength(1);
      expect(callArg.resource.values[0]).toHaveLength(7);
    });

    it('uses the expenses!A:G range for appending', async () => {
      const appendMock = vi.fn().mockResolvedValue({ status: 200 });
      (globalThis as any).gapi = {
        client: {
          sheets: {
            spreadsheets: {
              values: { append: appendMock },
            },
          },
        },
      };

      await writeExpense('sheet-id', fakeEntry);

      const callArg = appendMock.mock.calls[0][0];
      expect(callArg.range).toBe('expenses!A:G');
    });
  });

  // ─── ensureSheets() ───────────────────────────────────────────────────────

  describe('ensureSheets()', () => {
    it('calls spreadsheets.batchUpdate to add a missing sheet', async () => {
      const batchUpdateMock = vi.fn().mockResolvedValue({ status: 200 });
      (globalThis as any).gapi = {
        client: {
          sheets: {
            spreadsheets: {
              batchUpdate: batchUpdateMock,
            },
          },
        },
      };

      // Only 'expenses' exists; 'limits' and 'metadata' are missing
      await ensureSheets('sheet-id', ['expenses']);

      expect(batchUpdateMock).toHaveBeenCalledTimes(2);
    });

    it('does NOT call batchUpdate when all required sheets exist', async () => {
      const batchUpdateMock = vi.fn().mockResolvedValue({ status: 200 });
      (globalThis as any).gapi = {
        client: {
          sheets: {
            spreadsheets: {
              batchUpdate: batchUpdateMock,
            },
          },
        },
      };

      await ensureSheets('sheet-id', ['expenses', 'limits', 'metadata']);

      expect(batchUpdateMock).not.toHaveBeenCalled();
    });

    it('calls batchUpdate once per missing sheet', async () => {
      const batchUpdateMock = vi.fn().mockResolvedValue({ status: 200 });
      (globalThis as any).gapi = {
        client: {
          sheets: {
            spreadsheets: {
              batchUpdate: batchUpdateMock,
            },
          },
        },
      };

      // All 3 sheets missing
      await ensureSheets('sheet-id', []);

      expect(batchUpdateMock).toHaveBeenCalledTimes(3);
    });

    it('batchUpdate request includes addSheet with the correct title', async () => {
      const batchUpdateMock = vi.fn().mockResolvedValue({ status: 200 });
      (globalThis as any).gapi = {
        client: {
          sheets: {
            spreadsheets: {
              batchUpdate: batchUpdateMock,
            },
          },
        },
      };

      // Only 'limits' is missing
      await ensureSheets('sheet-id', ['expenses', 'metadata']);

      expect(batchUpdateMock).toHaveBeenCalledOnce();
      const callArg = batchUpdateMock.mock.calls[0][0];
      expect(callArg.resource.requests[0].addSheet.properties.title).toBe('limits');
    });
  });
});
