// Bug Condition Exploration Tests — UI Responsive Layout Fix
// Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
//
// CRITICAL: These tests assert the CORRECT/FIXED behavior.
// They are expected to FAIL on unfixed code — failure confirms the bugs exist.
// They will PASS after the fix is applied (confirming the fix works).
//
// Testing approach: Read component source files directly (no Angular TestBed
// required) and assert the correct CSS class strings are present. This mirrors
// the approach used in settings.component.spec.ts and avoids Angular JIT
// compilation issues in the vitest environment.
//
// **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**

import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Source file paths ────────────────────────────────────────────────────────

const SRC_ROOT = resolve(__dirname, '../../../..');

const SECTION_CARD_PATH = resolve(
  SRC_ROOT,
  'app/shared/components/section-card/section-card.component.ts'
);

const DAILY_EXPENSE_PATH = resolve(
  SRC_ROOT,
  'app/features/daily-expense/daily-expense.component.ts'
);

const DASHBOARD_PATH = resolve(
  SRC_ROOT,
  'app/features/dashboard/dashboard.component.ts'
);

// ─── Source file content (read once) ─────────────────────────────────────────

const sectionCardSource = readFileSync(SECTION_CARD_PATH, 'utf-8');
const dailyExpenseSource = readFileSync(DAILY_EXPENSE_PATH, 'utf-8');
const dashboardSource = readFileSync(DASHBOARD_PATH, 'utf-8');

// ─── Helper: extract the host <section> class string from SectionCardComponent ─

/**
 * Extracts the static class attribute value from the host <section> element
 * in SectionCardComponent's template.
 * Returns the class string, e.g. "glass-card mb-4" or "glass-card w-full min-w-0"
 */
function extractSectionHostClasses(source: string): string {
  // Match: <section class="..." [class]="className()">
  const match = source.match(/<section\s+class="([^"]+)"/);
  return match ? match[1] : '';
}

/**
 * Extracts the two-column grid div class string from DailyExpenseComponent.
 * Looks for the grid div that contains the two app-section-card children.
 */
function extractDailyExpenseGridClasses(source: string): string {
  // Match the grid div: <div class="grid ... md:grid-cols-2 ...">
  const match = source.match(/<div\s+class="(grid[^"]*md:grid-cols-2[^"]*)"/);
  return match ? match[1] : '';
}

/**
 * Extracts the quick-stat chips container class string from DashboardComponent.
 * Looks for the div containing the three glass-card chip divs.
 */
function extractDashboardChipsClasses(source: string): string {
  // Match the chips container: <div class="flex flex-wrap gap-2"> or <div class="grid grid-cols-3 gap-3">
  // It appears just before the first glass-card chip div
  const match = source.match(/<div\s+class="((?:flex|grid)[^"]*(?:flex-wrap|grid-cols)[^"]*)"/);
  return match ? match[1] : '';
}

// ─── Test Case 1 — Card width driven by content (Issue 2) ────────────────────
//
// Bug: SectionCardComponent host <section> has class "glass-card mb-4" with no
// w-full or min-w-0. A wide child element can force the card wider than its
// grid cell via the min-content sizing algorithm.
//
// Fix: Change to "glass-card w-full min-w-0" (remove mb-4, add w-full min-w-0).
//
// This test asserts the FIXED class string is present.
// FAILS on unfixed code (host has "glass-card mb-4", not "glass-card w-full min-w-0").
// PASSES after fix.
//
// Expected counterexample: host class is "glass-card mb-4" — missing w-full and min-w-0.

describe('Bug Condition Exploration — Test Case 1: Card width driven by content (Issue 2)', () => {
  it('SectionCardComponent host <section> has w-full class (cards fill their grid cell)', () => {
    // **Validates: Requirements 1.2**
    const hostClasses = extractSectionHostClasses(sectionCardSource);
    // On unfixed code: hostClasses = "glass-card mb-4" → does NOT contain "w-full"
    // This assertion FAILS on unfixed code (counterexample: "glass-card mb-4")
    expect(hostClasses).toContain('w-full');
  });

  it('SectionCardComponent host <section> has min-w-0 class (prevents content overflow)', () => {
    // **Validates: Requirements 1.2**
    const hostClasses = extractSectionHostClasses(sectionCardSource);
    // On unfixed code: hostClasses = "glass-card mb-4" → does NOT contain "min-w-0"
    // This assertion FAILS on unfixed code (counterexample: "glass-card mb-4")
    expect(hostClasses).toContain('min-w-0');
  });

  it('SectionCardComponent host <section> does NOT have mb-4 (spacing owned by parent grid)', () => {
    // **Validates: Requirements 1.3**
    const hostClasses = extractSectionHostClasses(sectionCardSource);
    // On unfixed code: hostClasses = "glass-card mb-4" → DOES contain "mb-4"
    // This assertion FAILS on unfixed code (counterexample: "glass-card mb-4")
    expect(hostClasses).not.toContain('mb-4');
  });

  it('property: for any content width > grid cell width, card class must constrain width', () => {
    // **Validates: Requirements 1.2**
    // Property-based: for any (contentWidth, gridCellWidth) where contentWidth > gridCellWidth,
    // the card host must have w-full and min-w-0 to prevent overflow.
    fc.assert(
      fc.property(
        fc.integer({ min: 401, max: 2000 }), // contentWidth > gridCellWidth
        fc.integer({ min: 200, max: 400 }),   // gridCellWidth
        (contentWidth, gridCellWidth) => {
          // The fix is required when contentWidth > gridCellWidth
          expect(contentWidth).toBeGreaterThan(gridCellWidth); // precondition
          const hostClasses = extractSectionHostClasses(sectionCardSource);
          // Card must have w-full and min-w-0 to fill cell and prevent overflow
          // FAILS on unfixed code for any (contentWidth > gridCellWidth) pair
          expect(hostClasses).toContain('w-full');
          expect(hostClasses).toContain('min-w-0');
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Test Case 2 — Double-gap on Daily Expense (Issue 3) ─────────────────────
//
// Bug: SectionCardComponent has unconditional mb-4 (16px). DailyExpenseComponent
// uses gap-6 (24px) on its grid. Combined spacing = 24 + 16 = 40px instead of 24px.
//
// Fix: Remove mb-4 from SectionCardComponent (already covered in Test Case 1).
//
// This test asserts that mb-4 is absent from the section card host.
// FAILS on unfixed code (mb-4 is present → double-gap exists).
// PASSES after fix (mb-4 removed → spacing = grid gap only = 24px).
//
// Expected counterexample: host class contains "mb-4" → gap is ~40px not 24px.

describe('Bug Condition Exploration — Test Case 2: Double-gap on Daily Expense (Issue 3)', () => {
  it('DailyExpenseComponent grid uses gap-6 (24px grid gap)', () => {
    // **Validates: Requirements 1.3**
    // Verify the grid gap is gap-6 (this is correct and should remain)
    const gridClasses = extractDailyExpenseGridClasses(dailyExpenseSource);
    expect(gridClasses).toContain('gap-6');
  });

  it('SectionCardComponent does NOT add mb-4 (no double-gap: spacing = grid gap only)', () => {
    // **Validates: Requirements 1.3**
    const hostClasses = extractSectionHostClasses(sectionCardSource);
    // On unfixed code: hostClasses contains "mb-4" → double-gap = 24 + 16 = 40px
    // This assertion FAILS on unfixed code (counterexample: mb-4 present → gap ~40px)
    expect(hostClasses).not.toContain('mb-4');
  });

  it('property: for any grid gap value, card must not add its own bottom margin', () => {
    // **Validates: Requirements 1.3**
    // Property-based: for any grid gap, the card must not add mb-4 (double-gap bug)
    fc.assert(
      fc.property(
        fc.constantFrom('gap-2', 'gap-3', 'gap-4', 'gap-6', 'gap-8', 'gap-10'),
        (gridGap) => {
          // The grid has a gap; the card must not add its own margin
          const hostClasses = extractSectionHostClasses(sectionCardSource);
          // FAILS on unfixed code: mb-4 is present regardless of grid gap
          expect(hostClasses).not.toContain('mb-4');
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ─── Test Case 3 — Chips use flex-wrap (Issue 4) ─────────────────────────────
//
// Bug: DashboardComponent quick-stat chips container uses "flex flex-wrap gap-2".
// Flexbox wrap distributes remaining space unevenly when container width is not
// a perfect multiple of chip widths.
//
// Fix: Change to "grid grid-cols-3 gap-3" for three equal-width columns.
//
// This test asserts the FIXED class string is present.
// FAILS on unfixed code (chips container has "flex flex-wrap gap-2").
// PASSES after fix (chips container has "grid grid-cols-3 gap-3").
//
// Expected counterexample: chips container class is "flex flex-wrap gap-2" — uses flex not grid.

describe('Bug Condition Exploration — Test Case 3: Chips use flex-wrap (Issue 4)', () => {
  it('DashboardComponent quick-stat chips container uses grid layout (not flex-wrap)', () => {
    // **Validates: Requirements 1.4**
    const chipsClasses = extractDashboardChipsClasses(dashboardSource);
    // On unfixed code: chipsClasses = "flex flex-wrap gap-2" → display is flex not grid
    // This assertion FAILS on unfixed code (counterexample: "flex flex-wrap gap-2")
    expect(chipsClasses).toContain('grid');
  });

  it('DashboardComponent quick-stat chips container does NOT use flex-wrap', () => {
    // **Validates: Requirements 1.4**
    const chipsClasses = extractDashboardChipsClasses(dashboardSource);
    // On unfixed code: chipsClasses contains "flex-wrap"
    // This assertion FAILS on unfixed code (counterexample: "flex flex-wrap gap-2")
    expect(chipsClasses).not.toContain('flex-wrap');
  });

  it('DashboardComponent quick-stat chips container has grid-cols-3 (three equal columns)', () => {
    // **Validates: Requirements 1.4**
    const chipsClasses = extractDashboardChipsClasses(dashboardSource);
    // On unfixed code: chipsClasses does NOT contain "grid-cols-3"
    // This assertion FAILS on unfixed code (counterexample: "flex flex-wrap gap-2")
    expect(chipsClasses).toContain('grid-cols-3');
  });

  it('property: chips container class must always produce grid display (not flex)', () => {
    // **Validates: Requirements 1.4**
    // Property-based: the chips container class must contain "grid" and not "flex-wrap"
    fc.assert(
      fc.property(
        fc.constant(null), // deterministic — no random input needed
        () => {
          const chipsClasses = extractDashboardChipsClasses(dashboardSource);
          // FAILS on unfixed code: "flex flex-wrap gap-2" contains flex-wrap, not grid
          expect(chipsClasses).toContain('grid');
          expect(chipsClasses).not.toContain('flex-wrap');
        }
      ),
      { numRuns: 1 }
    );
  });
});

// ─── Test Case 4 — xl col-span ineffective (Issue 5) ─────────────────────────
//
// Bug: DailyExpenseComponent two-column grid uses "xl:grid-cols-2". Child cards
// request xl:col-span-3 and xl:col-span-2 (summing to 5), but the parent only
// has 2 columns at xl, so both spans are clamped to 1 → 50/50 split.
//
// Fix: Change to "xl:grid-cols-5" so col-span-3 + col-span-2 = 5 columns → 60/40 split.
//
// This test asserts the FIXED class string is present.
// FAILS on unfixed code (grid has "xl:grid-cols-2", not "xl:grid-cols-5").
// PASSES after fix (grid has "xl:grid-cols-5").
//
// Expected counterexample: grid class contains "xl:grid-cols-2" → both cards are 50% width at xl.

describe('Bug Condition Exploration — Test Case 4: xl col-span ineffective (Issue 5)', () => {
  it('DailyExpenseComponent two-column grid uses xl:grid-cols-5 (not xl:grid-cols-2)', () => {
    // **Validates: Requirements 1.5**
    const gridClasses = extractDailyExpenseGridClasses(dailyExpenseSource);
    // On unfixed code: gridClasses contains "xl:grid-cols-2" → col-span-3/2 are ineffective
    // This assertion FAILS on unfixed code (counterexample: "xl:grid-cols-2")
    expect(gridClasses).toContain('xl:grid-cols-5');
  });

  it('DailyExpenseComponent two-column grid does NOT use xl:grid-cols-2', () => {
    // **Validates: Requirements 1.5**
    const gridClasses = extractDailyExpenseGridClasses(dailyExpenseSource);
    // On unfixed code: gridClasses contains "xl:grid-cols-2"
    // This assertion FAILS on unfixed code (counterexample: "xl:grid-cols-2")
    expect(gridClasses).not.toContain('xl:grid-cols-2');
  });

  it('DailyExpenseComponent Log Expense card has xl:col-span-3 (3/5 width at xl)', () => {
    // **Validates: Requirements 1.5**
    // The Log Expense card must have xl:col-span-3 to span 3 of 5 columns
    expect(dailyExpenseSource).toContain('xl:col-span-3');
  });

  it('DailyExpenseComponent Today\'s Entries card has xl:col-span-2 (2/5 width at xl)', () => {
    // **Validates: Requirements 1.5**
    // The Today's Entries card must have xl:col-span-2 to span 2 of 5 columns
    expect(dailyExpenseSource).toContain('xl:col-span-2');
  });

  it('property: at any xl viewport width, col-span-3 + col-span-2 must equal grid column count', () => {
    // **Validates: Requirements 1.5**
    // Property-based: for any xl viewport width (>= 1280px), the grid must have
    // exactly 5 columns so col-span-3 + col-span-2 = 5 (fills the grid completely)
    fc.assert(
      fc.property(
        fc.integer({ min: 1280, max: 3840 }), // xl viewport widths
        (viewportWidth) => {
          expect(viewportWidth).toBeGreaterThanOrEqual(1280); // precondition
          const gridClasses = extractDailyExpenseGridClasses(dailyExpenseSource);
          // At xl, the grid must have 5 columns for col-span-3 + col-span-2 to work
          // FAILS on unfixed code: "xl:grid-cols-2" → col-spans are clamped to 1
          expect(gridClasses).toContain('xl:grid-cols-5');
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Test Case 5 — Mobile overflow (Issues 1 & 6) ────────────────────────────
//
// Bug: DailyExpenseComponent grid uses "grid gap-6 md:grid-cols-2 xl:grid-cols-2"
// with no explicit grid-cols-1 base. Without an explicit single-column base,
// the grid relies on browser default behavior at mobile widths. Combined with
// the missing w-full/min-w-0 on SectionCardComponent, content can overflow
// horizontally at mobile viewport widths (< 768px).
//
// Fix: Add "grid-cols-1" to the grid class string as the mobile base.
//
// This test asserts the FIXED class string is present.
// FAILS on unfixed code (grid has no "grid-cols-1").
// PASSES after fix (grid has "grid-cols-1").
//
// Expected counterexample: grid class is "grid gap-6 md:grid-cols-2 xl:grid-cols-2"
// — no explicit grid-cols-1 → fragile mobile layout, horizontal overflow possible.

describe('Bug Condition Exploration — Test Case 5: Mobile overflow (Issues 1 & 6)', () => {
  it('DailyExpenseComponent two-column grid has explicit grid-cols-1 mobile base', () => {
    // **Validates: Requirements 1.1, 1.6**
    const gridClasses = extractDailyExpenseGridClasses(dailyExpenseSource);
    // On unfixed code: gridClasses = "grid gap-6 md:grid-cols-2 xl:grid-cols-2"
    // → no "grid-cols-1" → mobile layout is fragile
    // This assertion FAILS on unfixed code (counterexample: no grid-cols-1)
    expect(gridClasses).toContain('grid-cols-1');
  });

  it('SectionCardComponent has w-full and min-w-0 to prevent mobile overflow', () => {
    // **Validates: Requirements 1.1, 1.6**
    const hostClasses = extractSectionHostClasses(sectionCardSource);
    // On unfixed code: hostClasses = "glass-card mb-4" → no w-full, no min-w-0
    // → cards can overflow their container on mobile
    // This assertion FAILS on unfixed code (counterexample: "glass-card mb-4")
    expect(hostClasses).toContain('w-full');
    expect(hostClasses).toContain('min-w-0');
  });

  it('property: for any mobile viewport width, grid must have explicit single-column base', () => {
    // **Validates: Requirements 1.1, 1.6**
    // Property-based: for any mobile viewport width (< 768px), the grid must have
    // grid-cols-1 as the base to ensure single-column stacking and no overflow
    fc.assert(
      fc.property(
        fc.integer({ min: 320, max: 767 }), // mobile viewport widths
        (viewportWidth) => {
          expect(viewportWidth).toBeLessThan(768); // precondition
          const gridClasses = extractDailyExpenseGridClasses(dailyExpenseSource);
          // At mobile widths, grid must have explicit grid-cols-1 base
          // FAILS on unfixed code: "grid gap-6 md:grid-cols-2 xl:grid-cols-2" has no grid-cols-1
          expect(gridClasses).toContain('grid-cols-1');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('property: for any mobile viewport width, card host must have w-full to prevent overflow', () => {
    // **Validates: Requirements 1.1, 1.6**
    fc.assert(
      fc.property(
        fc.integer({ min: 320, max: 767 }), // mobile viewport widths
        (viewportWidth) => {
          expect(viewportWidth).toBeLessThan(768); // precondition
          const hostClasses = extractSectionHostClasses(sectionCardSource);
          // At mobile widths, card must have w-full to fill its grid cell
          // FAILS on unfixed code: "glass-card mb-4" has no w-full
          expect(hostClasses).toContain('w-full');
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Summary of expected counterexamples ─────────────────────────────────────
//
// When run on UNFIXED code, the following counterexamples are expected:
//
// Test Case 1 (Issue 2 — Card width driven by content):
//   - SectionCardComponent host class: "glass-card mb-4"
//   - Missing: w-full, min-w-0
//   - Effect: card is 600px wide when placed in a 400px grid cell
//
// Test Case 2 (Issue 3 — Double-gap):
//   - SectionCardComponent host class: "glass-card mb-4"
//   - mb-4 (16px) + gap-6 (24px) = 40px gap instead of 24px
//   - Effect: vertical gap between cards is ~40px instead of 24px
//
// Test Case 3 (Issue 4 — Chips use flex-wrap):
//   - DashboardComponent chips container class: "flex flex-wrap gap-2"
//   - Missing: grid, grid-cols-3
//   - Effect: chips wrap unpredictably, uneven spacing
//
// Test Case 4 (Issue 5 — xl col-span ineffective):
//   - DailyExpenseComponent grid class: "grid gap-6 md:grid-cols-2 xl:grid-cols-2"
//   - xl:grid-cols-2 makes col-span-3 and col-span-2 ineffective (clamped to 1)
//   - Effect: both cards are 50% width at xl instead of 60%/40%
//
// Test Case 5 (Issues 1 & 6 — Mobile overflow):
//   - DailyExpenseComponent grid class: "grid gap-6 md:grid-cols-2 xl:grid-cols-2"
//   - Missing: grid-cols-1 explicit mobile base
//   - SectionCardComponent host: "glass-card mb-4" — missing w-full, min-w-0
//   - Effect: horizontal scroll at mobile viewport widths (< 768px)
