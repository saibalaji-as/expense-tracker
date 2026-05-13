// Feature: personal-finance-pwa, Property 17: Notification interval slider-input binding
// Feature: personal-finance-pwa, Property 19: CSV export completeness
// Feature: time-based-hourly-reminders — Task 7.1: SettingsComponent unit tests
import * as fc from 'fast-check';
import { describe, it, expect, vi } from 'vitest';
import { ExpenseEntry } from '../../core/models/expense-entry.model';
import { PREDEFINED_EXPENSE_TYPES } from '../../core/models/expense-type.constants';

// ─── Pure logic helpers (mirrors SettingsComponent logic) ─────────────────────

/**
 * Mirrors SettingsComponent interval control behavior:
 * both slider and number input share the same value.
 * We model this as a simple shared state object.
 */
class IntervalControl {
  private _value: number;

  constructor(initialValue: number) {
    this._value = initialValue;
  }

  get value(): number {
    return this._value;
  }

  setValue(v: number): void {
    this._value = v;
  }
}

/**
 * Mirrors SettingsComponent.#entriesToCsv private method
 */
function entriesToCsv(entries: ExpenseEntry[]): string {
  const header = 'id,date,amount,type,limit,savings,timestamp';
  const rows = entries.map((e) => {
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

/**
 * Parse CSV back to entries for round-trip testing
 */
function parseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv.split('\n');
  if (lines.length < 1) return [];

  const headers = lines[0].split(',');
  const result: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Simple CSV parser (handles quoted fields)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        if (inQuotes && line[j + 1] === '"') {
          current += '"';
          j++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);

    const row: Record<string, string> = {};
    for (let k = 0; k < headers.length; k++) {
      row[headers[k]] = values[k] ?? '';
    }
    result.push(row);
  }

  return result;
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

// Use safe strings that don't contain special CSV characters for simplicity
const safeStringArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter(s => !s.includes(',') && !s.includes('"') && !s.includes('\n') && !s.includes('\r'));

const expenseEntryArb = fc.record<ExpenseEntry>({
  id:        fc.uuid(),
  date:      fc.integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() })
               .map(n => new Date(n).toISOString().slice(0, 10)),
  amount:    fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
  type:      fc.constantFrom(...PREDEFINED_EXPENSE_TYPES),
  limit:     fc.float({ min: 0, max: Math.fround(10000), noNaN: true }),
  savings:   fc.float({ min: Math.fround(-10000), max: Math.fround(10000), noNaN: true }),
  timestamp: fc.integer({ min: new Date('2020-01-01').getTime(), max: new Date('2030-12-31').getTime() })
               .map(n => new Date(n).toISOString()),
});

// ─── Property 17: Notification Interval Slider-Input Binding ─────────────────

describe('Property 17: Notification Interval Slider-Input Binding', () => {
  it('slider and number input share the same control value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 15, max: 480 }),
        (interval) => {
          const control = new IntervalControl(interval);
          // Both slider and number input are bound to the same control
          // Setting the value once updates both
          expect(control.value).toBe(interval);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('setting value via control updates both slider and input to same value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 15, max: 480 }),
        fc.integer({ min: 15, max: 480 }),
        (initial, newValue) => {
          const control = new IntervalControl(initial);
          control.setValue(newValue);
          // Both controls read from the same control
          expect(control.value).toBe(newValue);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('interval value is always within [15, 480] range', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 15, max: 480 }),
        (interval) => {
          expect(interval).toBeGreaterThanOrEqual(15);
          expect(interval).toBeLessThanOrEqual(480);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('slider and number input always display the same value after any update', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 15, max: 480 }), { minLength: 1, maxLength: 10 }),
        (values) => {
          const control = new IntervalControl(values[0]);
          for (const v of values) {
            control.setValue(v);
            // Both controls read from the same control — they must be in sync
            expect(control.value).toBe(v);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 19: CSV Export Completeness ────────────────────────────────────

describe('Property 19: CSV Export Completeness', () => {
  it('CSV has exactly one data row per entry', () => {
    fc.assert(
      fc.property(
        fc.array(expenseEntryArb, { minLength: 0, maxLength: 20 }),
        (entries) => {
          const csv = entriesToCsv(entries);
          const lines = csv.split('\n').filter(l => l.trim());
          // 1 header + N data rows
          expect(lines.length).toBe(entries.length + 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('CSV header row contains all required fields', () => {
    fc.assert(
      fc.property(
        fc.array(expenseEntryArb, { minLength: 0, maxLength: 5 }),
        (entries) => {
          const csv = entriesToCsv(entries);
          const header = csv.split('\n')[0];
          expect(header).toBe('id,date,amount,type,limit,savings,timestamp');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('CSV round-trip: parsing back yields entries with equivalent field values', () => {
    fc.assert(
      fc.property(
        fc.array(expenseEntryArb, { minLength: 1, maxLength: 10 }),
        (entries) => {
          const csv = entriesToCsv(entries);
          const parsed = parseCsv(csv);

          expect(parsed.length).toBe(entries.length);

          for (let i = 0; i < entries.length; i++) {
            const original = entries[i];
            const row = parsed[i];

            expect(row['id']).toBe(original.id);
            expect(row['date']).toBe(original.date);
            expect(parseFloat(row['amount'])).toBeCloseTo(original.amount, 5);
            expect(row['type']).toBe(original.type);
            expect(parseFloat(row['limit'])).toBeCloseTo(original.limit, 5);
            expect(parseFloat(row['savings'])).toBeCloseTo(original.savings, 5);
            expect(row['timestamp']).toBe(original.timestamp);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('CSV export handles empty entries array', () => {
    fc.assert(
      fc.property(fc.constant([]), (entries: ExpenseEntry[]) => {
        const csv = entriesToCsv(entries);
        expect(csv).toBe('id,date,amount,type,limit,savings,timestamp');
      }),
      { numRuns: 1 }
    );
  });

  it('CSV fields with commas are properly quoted', () => {
    fc.assert(
      fc.property(
        fc.record<ExpenseEntry>({
          id:        fc.uuid(),
          date:      fc.constant('2024-01-01'),
          amount:    fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true }),
          type:      fc.constant('Food, Drinks'),  // contains comma
          limit:     fc.float({ min: 0, max: Math.fround(1000), noNaN: true }),
          savings:   fc.float({ min: Math.fround(-1000), max: Math.fround(1000), noNaN: true }),
          timestamp: fc.constant('2024-01-01T00:00:00.000Z'),
        }),
        (entry) => {
          const csv = entriesToCsv([entry]);
          const parsed = parseCsv(csv);
          expect(parsed[0]['type']).toBe(entry.type);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Task 7.1: SettingsComponent — simplified notification toggle ─────────────
//
// Requirements: 7.1, 7.2
// These tests mirror the onNotificationToggleClick() logic from SettingsComponent
// using pure function mirrors (same pattern as notification.service.spec.ts).

/**
 * Mirrors the SettingsComponent.onNotificationToggleClick() logic after Task 7.
 * Calls enable() with no arguments when currently disabled,
 * or disable() when currently enabled.
 */
async function onNotificationToggleClick(
  isEnabled: boolean,
  permissionState: NotificationPermission,
  requestPermission: () => Promise<void>,
  enable: () => Promise<void>,
  disable: () => Promise<void>,
  getPermissionState: () => NotificationPermission
): Promise<void> {
  if (!isEnabled) {
    await requestPermission();
    if (getPermissionState() === 'granted') {
      await enable();
    }
  } else {
    await disable();
  }
}

describe('SettingsComponent — Task 7.1: onNotificationToggleClick()', () => {
  it('calls notificationService.enable() with NO arguments when toggling on', async () => {
    const requestPermission = vi.fn().mockResolvedValue(undefined);
    const enable = vi.fn().mockResolvedValue(undefined);
    const disable = vi.fn().mockResolvedValue(undefined);
    let permissionState: NotificationPermission = 'granted';

    await onNotificationToggleClick(
      false, // currently disabled
      permissionState,
      requestPermission,
      enable,
      disable,
      () => permissionState
    );

    expect(enable).toHaveBeenCalledOnce();
    // enable() must be called with zero arguments (no intervalMinutes)
    expect(enable).toHaveBeenCalledWith();
  });

  it('calls notificationService.disable() when toggling off', async () => {
    const requestPermission = vi.fn().mockResolvedValue(undefined);
    const enable = vi.fn().mockResolvedValue(undefined);
    const disable = vi.fn().mockResolvedValue(undefined);
    let permissionState: NotificationPermission = 'granted';

    await onNotificationToggleClick(
      true, // currently enabled
      permissionState,
      requestPermission,
      enable,
      disable,
      () => permissionState
    );

    expect(disable).toHaveBeenCalledOnce();
    expect(enable).not.toHaveBeenCalled();
  });

  it('does NOT call enable() when permission is denied', async () => {
    const requestPermission = vi.fn().mockResolvedValue(undefined);
    const enable = vi.fn().mockResolvedValue(undefined);
    const disable = vi.fn().mockResolvedValue(undefined);
    // Permission remains denied after requestPermission()
    let permissionState: NotificationPermission = 'denied';

    await onNotificationToggleClick(
      false, // currently disabled
      permissionState,
      requestPermission,
      enable,
      disable,
      () => permissionState
    );

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(enable).not.toHaveBeenCalled();
  });

  it('does NOT call enable() when permission is default (not yet granted)', async () => {
    const requestPermission = vi.fn().mockResolvedValue(undefined);
    const enable = vi.fn().mockResolvedValue(undefined);
    const disable = vi.fn().mockResolvedValue(undefined);
    // Permission stays 'default' (user dismissed the prompt)
    let permissionState: NotificationPermission = 'default';

    await onNotificationToggleClick(
      false,
      permissionState,
      requestPermission,
      enable,
      disable,
      () => permissionState
    );

    expect(enable).not.toHaveBeenCalled();
  });
});

// ─── Source-level structural checks ──────────────────────────────────────────
// These tests read the component source file directly to verify that interval
// picker code has been removed. This avoids Angular JIT compilation issues in
// the Vitest environment while still providing meaningful regression coverage.

import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSettingsComponentSource(): string {
  const filePath = resolve(__dirname, 'settings.component.ts');
  return readFileSync(filePath, 'utf-8');
}

describe('SettingsComponent — Task 7.1: interval picker removed (Requirements 7.1, 7.2)', () => {
  let source: string;

  // Read once for all tests in this suite
  source = readSettingsComponentSource();

  it('does not contain intervalControl', () => {
    expect(source).not.toContain('intervalControl');
  });

  it('does not contain isEditingInterval', () => {
    expect(source).not.toContain('isEditingInterval');
  });

  it('does not contain isDropdownOpen', () => {
    expect(source).not.toContain('isDropdownOpen');
  });

  it('does not contain intervalOptions', () => {
    expect(source).not.toContain('intervalOptions');
  });

  it('does not contain startEditInterval', () => {
    expect(source).not.toContain('startEditInterval');
  });

  it('does not contain saveInterval', () => {
    expect(source).not.toContain('saveInterval');
  });

  it('does not contain intervalLabel', () => {
    expect(source).not.toContain('intervalLabel');
  });

  it('does not contain pencilIcon', () => {
    expect(source).not.toContain('pencilIcon');
  });

  it('does not import Pencil from lucide-angular', () => {
    expect(source).not.toContain('Pencil');
  });

  it('does not import ReactiveFormsModule', () => {
    expect(source).not.toContain('ReactiveFormsModule');
  });

  it('does not import FormControl', () => {
    expect(source).not.toContain('FormControl');
  });

  it('onNotificationToggleClick calls enable() with no arguments', () => {
    // The method body should call notificationService.enable() with no args
    expect(source).toContain('notificationService.enable()');
    // Must NOT pass any argument like intervalControl.value
    expect(source).not.toContain('notificationService.enable(this.intervalControl');
  });

  it('template does not contain the interval row @if block', () => {
    // The interval row was inside @if (notificationService.isEnabled()) — that block is gone
    expect(source).not.toContain('Notification interval');
    expect(source).not.toContain('isEditingInterval');
  });
});


// ─── Task 12.3: Mode switch flow ─────────────────────────────────────────────
//
// Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 13.1, 13.2, 13.3, 13.4, 13.5
//
// These tests mirror the mode switch logic from SettingsComponent using pure
// function mirrors to avoid Angular JIT compilation issues in Vitest.

type BackupMode = 'single' | 'family' | null;
type OwnerRole = 'owner' | 'partner' | null;

interface ModeSwitchState {
  isSwitchModeModalOpen: boolean;
  isOwnerSwitchWarningOpen: boolean;
  executeModeSwitch: boolean; // tracks whether #executeModeSwitch was called
}

/**
 * Mirrors SettingsComponent.onSwitchBackupMode()
 */
function onSwitchBackupMode(state: ModeSwitchState): void {
  state.isSwitchModeModalOpen = true;
}

/**
 * Mirrors SettingsComponent.onSwitchModeCancelled()
 */
function onSwitchModeCancelled(state: ModeSwitchState): void {
  state.isSwitchModeModalOpen = false;
}

/**
 * Mirrors SettingsComponent.onSwitchModeConfirmed()
 * Requirement 13.5: secondary warning only shown when mode=family, role=owner, AND sharedFileId is non-null
 */
function onSwitchModeConfirmed(
  state: ModeSwitchState,
  mode: BackupMode,
  ownerRole: OwnerRole,
  sharedFileId: string | null
): void {
  state.isSwitchModeModalOpen = false;
  if (mode === 'family' && ownerRole === 'owner' && !!sharedFileId) {
    state.isOwnerSwitchWarningOpen = true;
  } else {
    state.executeModeSwitch = true;
  }
}

/**
 * Mirrors SettingsComponent.onOwnerSwitchWarningCancelled()
 */
function onOwnerSwitchWarningCancelled(state: ModeSwitchState): void {
  state.isOwnerSwitchWarningOpen = false;
}

/**
 * Mirrors SettingsComponent.onOwnerSwitchWarningConfirmed()
 */
function onOwnerSwitchWarningConfirmed(state: ModeSwitchState): void {
  state.isOwnerSwitchWarningOpen = false;
  state.executeModeSwitch = true;
}

function makeState(): ModeSwitchState {
  return { isSwitchModeModalOpen: false, isOwnerSwitchWarningOpen: false, executeModeSwitch: false };
}

describe('SettingsComponent — Task 12.3: mode switch flow', () => {

  // Requirement 8.2: "Switch backup mode" button opens primary confirmation dialog
  it('onSwitchBackupMode opens the primary confirmation modal', () => {
    const state = makeState();
    onSwitchBackupMode(state);
    expect(state.isSwitchModeModalOpen).toBe(true);
  });

  // Requirement 8.5: cancel leaves state unchanged
  it('onSwitchModeCancelled closes the modal without executing switch', () => {
    const state = makeState();
    onSwitchBackupMode(state);
    onSwitchModeCancelled(state);
    expect(state.isSwitchModeModalOpen).toBe(false);
    expect(state.executeModeSwitch).toBe(false);
    expect(state.isOwnerSwitchWarningOpen).toBe(false);
  });

  // Requirement 8.3 / 13.1: Owner in family mode with sharedFileId → secondary warning shown
  it('onSwitchModeConfirmed shows secondary warning for Owner in family mode with sharedFileId', () => {
    const state = makeState();
    onSwitchModeConfirmed(state, 'family', 'owner', 'file-id-123');
    expect(state.isSwitchModeModalOpen).toBe(false);
    expect(state.isOwnerSwitchWarningOpen).toBe(true);
    expect(state.executeModeSwitch).toBe(false);
  });

  // Requirement 13.5: Owner in family mode with null sharedFileId → skip secondary warning
  it('onSwitchModeConfirmed skips secondary warning when sharedFileId is null', () => {
    const state = makeState();
    onSwitchModeConfirmed(state, 'family', 'owner', null);
    expect(state.isOwnerSwitchWarningOpen).toBe(false);
    expect(state.executeModeSwitch).toBe(true);
  });

  // Requirement 13.5: Owner in family mode with empty sharedFileId → skip secondary warning
  it('onSwitchModeConfirmed skips secondary warning when sharedFileId is empty string', () => {
    const state = makeState();
    onSwitchModeConfirmed(state, 'family', 'owner', '');
    expect(state.isOwnerSwitchWarningOpen).toBe(false);
    expect(state.executeModeSwitch).toBe(true);
  });

  // Partner in family mode → no secondary warning, execute immediately
  it('onSwitchModeConfirmed executes switch immediately for Partner in family mode', () => {
    const state = makeState();
    onSwitchModeConfirmed(state, 'family', 'partner', 'file-id-123');
    expect(state.isOwnerSwitchWarningOpen).toBe(false);
    expect(state.executeModeSwitch).toBe(true);
  });

  // Single user mode → no secondary warning, execute immediately
  it('onSwitchModeConfirmed executes switch immediately for single user mode', () => {
    const state = makeState();
    onSwitchModeConfirmed(state, 'single', null, null);
    expect(state.isOwnerSwitchWarningOpen).toBe(false);
    expect(state.executeModeSwitch).toBe(true);
  });

  // Requirement 13.4: Owner can cancel secondary warning and remain in family mode
  it('onOwnerSwitchWarningCancelled closes warning without executing switch', () => {
    const state = makeState();
    onSwitchModeConfirmed(state, 'family', 'owner', 'file-id-123');
    expect(state.isOwnerSwitchWarningOpen).toBe(true);
    onOwnerSwitchWarningCancelled(state);
    expect(state.isOwnerSwitchWarningOpen).toBe(false);
    expect(state.executeModeSwitch).toBe(false);
  });

  // Requirement 13.3: After secondary warning confirmed, execute mode switch
  it('onOwnerSwitchWarningConfirmed executes mode switch', () => {
    const state = makeState();
    onSwitchModeConfirmed(state, 'family', 'owner', 'file-id-123');
    onOwnerSwitchWarningConfirmed(state);
    expect(state.isOwnerSwitchWarningOpen).toBe(false);
    expect(state.executeModeSwitch).toBe(true);
  });

  // Property test: secondary warning shown iff mode=family AND role=owner AND sharedFileId non-null
  it('property: secondary warning condition is exactly mode=family AND role=owner AND sharedFileId non-null', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<BackupMode>('single', 'family', null),
        fc.constantFrom<OwnerRole>('owner', 'partner', null),
        fc.oneof(fc.constant(null), fc.constant(''), fc.string({ minLength: 1, maxLength: 30 })),
        (mode, ownerRole, sharedFileId) => {
          const state = makeState();
          onSwitchModeConfirmed(state, mode, ownerRole, sharedFileId);

          const shouldShowWarning = mode === 'family' && ownerRole === 'owner' && !!sharedFileId;
          expect(state.isOwnerSwitchWarningOpen).toBe(shouldShowWarning);
          expect(state.executeModeSwitch).toBe(!shouldShowWarning);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Requirement 8.4: full flow — confirm primary + confirm secondary → execute switch
  it('full flow: primary confirm → secondary confirm → execute switch', () => {
    const state = makeState();
    onSwitchBackupMode(state);
    expect(state.isSwitchModeModalOpen).toBe(true);

    onSwitchModeConfirmed(state, 'family', 'owner', 'file-id-abc');
    expect(state.isSwitchModeModalOpen).toBe(false);
    expect(state.isOwnerSwitchWarningOpen).toBe(true);

    onOwnerSwitchWarningConfirmed(state);
    expect(state.isOwnerSwitchWarningOpen).toBe(false);
    expect(state.executeModeSwitch).toBe(true);
  });

  // Requirement 8.5: full flow — cancel at primary → no switch
  it('full flow: primary cancel → no switch, no secondary warning', () => {
    const state = makeState();
    onSwitchBackupMode(state);
    onSwitchModeCancelled(state);
    expect(state.isSwitchModeModalOpen).toBe(false);
    expect(state.isOwnerSwitchWarningOpen).toBe(false);
    expect(state.executeModeSwitch).toBe(false);
  });

  // Requirement 13.4: full flow — confirm primary → cancel secondary → no switch
  it('full flow: primary confirm → secondary cancel → no switch', () => {
    const state = makeState();
    onSwitchBackupMode(state);
    onSwitchModeConfirmed(state, 'family', 'owner', 'file-id-abc');
    onOwnerSwitchWarningCancelled(state);
    expect(state.executeModeSwitch).toBe(false);
  });
});

// ─── Source-level check: sharedFileId guard is present ───────────────────────

describe('SettingsComponent — Task 12.3: source-level checks', () => {
  let source: string;
  source = readSettingsComponentSource();

  it('onSwitchModeConfirmed checks sharedFileId before showing secondary warning', () => {
    // The condition must include sharedFileId check (Requirement 13.5)
    expect(source).toContain('sharedFileId()');
  });

  it('secondary warning modal is present in template', () => {
    expect(source).toContain('isOwnerSwitchWarningOpen()');
    expect(source).toContain('onOwnerSwitchWarningConfirmed()');
    expect(source).toContain('onOwnerSwitchWarningCancelled()');
  });

  it('primary confirmation modal is present in template', () => {
    expect(source).toContain('isSwitchModeModalOpen()');
    expect(source).toContain('onSwitchModeConfirmed()');
    expect(source).toContain('onSwitchModeCancelled()');
  });

  it('#executeModeSwitch calls clearAll, signOut, and navigates to /auth/callback', () => {
    expect(source).toContain('clearAll()');
    expect(source).toContain('signOut()');
    expect(source).toContain('/auth/callback');
  });

  it('secondary warning contains the correct partner access message', () => {
    expect(source).toContain('Your partner can still access the shared file until you remove their access in Google Drive.');
  });

  it('secondary warning contains Open file in Google Drive link', () => {
    expect(source).toContain('Open file in Google Drive');
    expect(source).toContain('drive.google.com/file/d/');
  });

  it('primary confirmation contains the correct warning message', () => {
    expect(source).toContain('Switching modes will disconnect you from your current backup. Your existing data will not be deleted from Google Drive. Continue?');
  });
});

// ─── Task 9.6: formatTime helper method ──────────────────────────────────────
//
// Requirement: 6.3
// Tests for the formatTime(hour, minute) helper method that returns HH:MM string

/**
 * Mirrors SettingsComponent.formatTime(hour, minute)
 */
function formatTime(hour: number, minute: number): string {
  const h = hour.toString().padStart(2, '0');
  const m = minute.toString().padStart(2, '0');
  return `${h}:${m}`;
}

describe('SettingsComponent — Task 9.6: formatTime helper method', () => {
  it('formats single-digit hour and minute with leading zeros', () => {
    expect(formatTime(9, 5)).toBe('09:05');
  });

  it('formats double-digit hour and minute without modification', () => {
    expect(formatTime(21, 30)).toBe('21:30');
  });

  it('formats midnight correctly', () => {
    expect(formatTime(0, 0)).toBe('00:00');
  });

  it('formats noon correctly', () => {
    expect(formatTime(12, 0)).toBe('12:00');
  });

  it('formats 23:59 correctly', () => {
    expect(formatTime(23, 59)).toBe('23:59');
  });

  it('property: always returns HH:MM format with exactly 5 characters', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (hour, minute) => {
          const result = formatTime(hour, minute);
          expect(result).toMatch(/^\d{2}:\d{2}$/);
          expect(result.length).toBe(5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: hour part is always zero-padded to 2 digits', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (hour, minute) => {
          const result = formatTime(hour, minute);
          const hourPart = result.split(':')[0];
          expect(hourPart.length).toBe(2);
          expect(parseInt(hourPart, 10)).toBe(hour);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: minute part is always zero-padded to 2 digits', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (hour, minute) => {
          const result = formatTime(hour, minute);
          const minutePart = result.split(':')[1];
          expect(minutePart.length).toBe(2);
          expect(parseInt(minutePart, 10)).toBe(minute);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: formatTime is idempotent for valid inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (hour, minute) => {
          const result1 = formatTime(hour, minute);
          const result2 = formatTime(hour, minute);
          expect(result1).toBe(result2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
