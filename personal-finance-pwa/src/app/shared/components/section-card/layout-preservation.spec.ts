// Layout Preservation Property Tests — UI Responsive Layout Fix
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
//
// PURPOSE: These tests observe and assert the CORRECT baseline behavior on
// UNFIXED code for inputs where isBugCondition(X) returns false.
// They PASS on unfixed code and MUST CONTINUE TO PASS after the fix,
// confirming no regressions were introduced.
//
// Testing approach: Read component source files directly using readFileSync
// (same pattern as layout-bug-exploration.spec.ts). No Angular TestBed.
//
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

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

const MONTHLY_EXPENSE_PATH = resolve(
  SRC_ROOT,
  'app/features/monthly-expense/monthly-expense.component.ts'
);

// ─── Source file content (read once) ─────────────────────────────────────────

const sectionCardSource = readFileSync(SECTION_CARD_PATH, 'utf-8');
const dailyExpenseSource = readFileSync(DAILY_EXPENSE_PATH, 'utf-8');
const dashboardSource = readFileSync(DASHBOARD_PATH, 'utf-8');
const monthlyExpenseSource = readFileSync(MONTHLY_EXPENSE_PATH, 'utf-8');

// ─── Helper: extract the host <section> class string from SectionCardComponent ─

/**
 * Extracts the static class attribute value from the host <section> element
 * in SectionCardComponent's template.
 */
function extractSectionHostClasses(source: string): string {
  const match = source.match(/<section\s+class="([^"]+)"/);
  return match ? match[1] : '';
}

/**
 * Extracts the two-column grid div class string from DailyExpenseComponent.
 * Looks for the grid div that contains the two app-section-card children.
 */
function extractDailyExpenseGridClasses(source: string): string {
  const match = source.match(/<div\s+class="(grid[^"]*md:grid-cols-2[^"]*)"/);
  return match ? match[1] : '';
}

/**
 * Extracts the chart grid div class string from DashboardComponent.
 * Looks for the 4-chart grid div with md:grid-cols-2.
 */
function extractDashboardChartGridClasses(source: string): string {
  const match = source.match(/<div\s+class="(mb-4\s+grid[^"]*md:grid-cols-2[^"]*)"/);
  return match ? match[1] : '';
}

// ─── Test Case 1 — Multi-column layout preserved at md+ ──────────────────────
//
// Observation: At viewport widths in [768, 1279] px (md breakpoint active),
// DailyExpenseComponent grid has md:grid-cols-2 and DashboardComponent chart
// grid has md:grid-cols-2. These classes must be preserved after the fix.
//
// isBugCondition(X) = false for viewportWidth in [768, 1279] (not < 768).
// These tests PASS on unfixed code and must PASS after the fix.
//
// **Validates: Requirements 3.1**

describe('Preservation — Test Case 1: Multi-column layout preserved at md+', () => {
  it('DailyExpenseComponent grid has md:grid-cols-2 (2-column layout at md breakpoint)', () => {
    // **Validates: Requirements 3.1**
    const gridClasses = extractDailyExpenseGridClasses(dailyExpenseSource);
    // On unfixed code: gridClasses = "grid gap-6 md:grid-cols-2 xl:grid-cols-2"
    // → contains "md:grid-cols-2" → 2-column layout at md is present
    // PASSES on unfixed code; must PASS after fix (md:grid-cols-2 is preserved)
    expect(gridClasses).toContain('md:grid-cols-2');
  });

  it('DashboardComponent chart grid has md:grid-cols-2 (2-column chart layout at md breakpoint)', () => {
    // **Validates: Requirements 3.1**
    const chartGridClasses = extractDashboardChartGridClasses(dashboardSource);
    // On unfixed code: chartGridClasses = "mb-4 grid gap-6 md:grid-cols-2"
    // → contains "md:grid-cols-2" → 2-column chart layout at md is present
    // PASSES on unfixed code; must PASS after fix (md:grid-cols-2 is preserved)
    expect(chartGridClasses).toContain('md:grid-cols-2');
  });

  it('property: for any viewport width in [768, 1279], DailyExpenseComponent grid has md:grid-cols-2', () => {
    // **Validates: Requirements 3.1**
    // Property-based: for any md-range viewport width, the grid class must contain md:grid-cols-2
    fc.assert(
      fc.property(
        fc.integer({ min: 768, max: 1279 }), // md breakpoint range (not a bug condition)
        (viewportWidth) => {
          // Precondition: viewport is in md range (not a bug condition)
          expect(viewportWidth).toBeGreaterThanOrEqual(768);
          expect(viewportWidth).toBeLessThan(1280);
          const gridClasses = extractDailyExpenseGridClasses(dailyExpenseSource);
          // md:grid-cols-2 must be present to ensure 2-column layout at md
          // PASSES on unfixed code; must PASS after fix
          expect(gridClasses).toContain('md:grid-cols-2');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('property: for any viewport width in [768, 1279], DashboardComponent chart grid has md:grid-cols-2', () => {
    // **Validates: Requirements 3.1**
    fc.assert(
      fc.property(
        fc.integer({ min: 768, max: 1279 }), // md breakpoint range (not a bug condition)
        (viewportWidth) => {
          expect(viewportWidth).toBeGreaterThanOrEqual(768);
          expect(viewportWidth).toBeLessThan(1280);
          const chartGridClasses = extractDashboardChartGridClasses(dashboardSource);
          // md:grid-cols-2 must be present to ensure 2-column chart layout at md
          // PASSES on unfixed code; must PASS after fix
          expect(chartGridClasses).toContain('md:grid-cols-2');
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Test Case 2 — Dark mode classes preserved ───────────────────────────────
//
// Observation: SectionCardComponent host has "glass-card" class. Dark mode
// styling is handled by the global glass-card CSS class (which uses dark: CSS
// variables), not by inline dark: utilities in the template. The fix changes
// the host class from "glass-card mb-4" to "glass-card w-full min-w-0" —
// glass-card must be preserved for dark mode to continue working.
//
// isBugCondition(X) = false for any SectionCardComponent where contentWidth ≤ gridCellWidth.
// These tests PASS on unfixed code and must PASS after the fix.
//
// **Validates: Requirements 3.4**

describe('Preservation — Test Case 2: Dark mode classes preserved', () => {
  it('SectionCardComponent host <section> has glass-card class (dark mode styling preserved)', () => {
    // **Validates: Requirements 3.4**
    const hostClasses = extractSectionHostClasses(sectionCardSource);
    // On unfixed code: hostClasses = "glass-card mb-4"
    // → contains "glass-card" → dark mode frosted-glass styling is present
    // PASSES on unfixed code; must PASS after fix (glass-card is preserved)
    expect(hostClasses).toContain('glass-card');
  });

  it('SectionCardComponent template contains tracking-tight class (typography styling preserved)', () => {
    // **Validates: Requirements 3.4**
    // The template uses CSS-variable-based classes for theme-aware styling.
    // Dark mode is handled by the glass-card CSS class (not inline dark: utilities).
    // Verify the inner header typography classes are preserved.
    // PASSES on unfixed code; must PASS after fix (no inner classes are removed)
    expect(sectionCardSource).toContain('tracking-tight');
  });

  it('SectionCardComponent template contains text-muted-foreground (theme-aware text preserved)', () => {
    // **Validates: Requirements 3.4**
    // Theme-aware CSS variable classes must be preserved
    expect(sectionCardSource).toContain('text-muted-foreground');
  });

  it('property: glass-card class is always present on SectionCardComponent host', () => {
    // **Validates: Requirements 3.4**
    // Property-based: the glass-card class must always be present (deterministic)
    fc.assert(
      fc.property(
        fc.constant(null), // deterministic — no random input needed
        () => {
          const hostClasses = extractSectionHostClasses(sectionCardSource);
          // glass-card must always be present for dark mode styling
          // PASSES on unfixed code; must PASS after fix
          expect(hostClasses).toContain('glass-card');
        }
      ),
      { numRuns: 1 }
    );
  });
});

// ─── Test Case 3 — Monthly Expense KPI cards preserved ───────────────────────
//
// Observation: MonthlyExpenseComponent KPI cards grid uses "mb-4 grid gap-4 sm:grid-cols-3"
// which gives 3 columns at sm+ viewport. This layout is not affected by the fix.
//
// isBugCondition(X) = false for MonthlyExpenseComponent at sm+ viewport (not < 768).
// These tests PASS on unfixed code and must PASS after the fix.
//
// **Validates: Requirements 3.5**

describe('Preservation — Test Case 3: Monthly Expense KPI cards preserved', () => {
  it('MonthlyExpenseComponent KPI grid has sm:grid-cols-3 (3-column KPI layout preserved)', () => {
    // **Validates: Requirements 3.5**
    // On unfixed code: KPI grid class = "mb-4 grid gap-4 sm:grid-cols-3"
    // → contains "sm:grid-cols-3" → 3-column KPI layout at sm+ is present
    // PASSES on unfixed code; must PASS after fix (sm:grid-cols-3 is preserved)
    expect(monthlyExpenseSource).toContain('sm:grid-cols-3');
  });

  it('MonthlyExpenseComponent has Budget Rule Breakdown section card', () => {
    // **Validates: Requirements 3.5**
    // The Budget Rule Breakdown section card must be present
    expect(monthlyExpenseSource).toContain('Budget Rule Breakdown');
  });

  it('MonthlyExpenseComponent has Category Breakdown section card', () => {
    // **Validates: Requirements 3.5**
    // The Category Breakdown section card must be present
    expect(monthlyExpenseSource).toContain('Category Breakdown');
  });

  it('property: sm:grid-cols-3 KPI class is always present in MonthlyExpenseComponent', () => {
    // **Validates: Requirements 3.5**
    // Property-based: sm:grid-cols-3 must always be present (deterministic)
    fc.assert(
      fc.property(
        fc.constant(null), // deterministic
        () => {
          // sm:grid-cols-3 must be present for 3-column KPI layout at sm+
          // PASSES on unfixed code; must PASS after fix
          expect(monthlyExpenseSource).toContain('sm:grid-cols-3');
        }
      ),
      { numRuns: 1 }
    );
  });
});

// ─── Test Case 4 — Dashboard chart grid preserved ────────────────────────────
//
// Observation: DashboardComponent template contains exactly four app-section-card
// chart cards (Year-to-date, This Month by Type, Last 6 Months, Budget Rule).
// The fix only changes the chips container and adds grid-cols-1 to the chart grid.
//
// isBugCondition(X) = false for DashboardComponent at md+ viewport (not chipContainerIsFlexWrap).
// These tests PASS on unfixed code and must PASS after the fix.
//
// **Validates: Requirements 3.6**

describe('Preservation — Test Case 4: Dashboard chart grid preserved', () => {
  it('DashboardComponent template contains Year-to-date Daily Expenses chart card', () => {
    // **Validates: Requirements 3.6**
    expect(dashboardSource).toContain('Year-to-date Daily Expenses');
  });

  it('DashboardComponent template contains This Month by Type chart card', () => {
    // **Validates: Requirements 3.6**
    expect(dashboardSource).toContain('This Month by Type');
  });

  it('DashboardComponent template contains Last 6 Months chart card', () => {
    // **Validates: Requirements 3.6**
    expect(dashboardSource).toContain('Last 6 Months');
  });

  it('DashboardComponent template contains Budget Rule (50/30/20) chart card', () => {
    // **Validates: Requirements 3.6**
    expect(dashboardSource).toContain('Budget Rule (50/30/20)');
  });

  it('DashboardComponent chart grid has gap-6 (chart spacing preserved)', () => {
    // **Validates: Requirements 3.6**
    const chartGridClasses = extractDashboardChartGridClasses(dashboardSource);
    // On unfixed code: chartGridClasses = "mb-4 grid gap-6 md:grid-cols-2"
    // → contains "gap-6" → chart grid spacing is present
    // PASSES on unfixed code; must PASS after fix (gap-6 is preserved)
    expect(chartGridClasses).toContain('gap-6');
  });

  it('property: all four app-section-card chart titles are always present in DashboardComponent', () => {
    // **Validates: Requirements 3.6**
    // Property-based: all four chart cards must always be present (deterministic)
    fc.assert(
      fc.property(
        fc.constantFrom(
          'Year-to-date Daily Expenses',
          'This Month by Type',
          'Last 6 Months',
          'Budget Rule (50/30/20)'
        ),
        (chartTitle) => {
          // Each chart card title must be present in the template
          // PASSES on unfixed code; must PASS after fix (no chart cards are removed)
          expect(dashboardSource).toContain(chartTitle);
        }
      ),
      { numRuns: 4 }
    );
  });
});

// ─── Test Case 5 — Form interaction preserved (structural check) ──────────────
//
// Observation: DailyExpenseComponent template contains the expense log form
// with a <form> tag and a submit button. The fix only changes the grid container
// class — no TypeScript or form logic is modified.
//
// isBugCondition(X) = false for form interaction (not a layout bug condition).
// These tests PASS on unfixed code and must PASS after the fix.
//
// **Validates: Requirements 3.2**

describe('Preservation — Test Case 5: Form interaction preserved (structural check)', () => {
  it('DailyExpenseComponent template contains a <form> element (form structure preserved)', () => {
    // **Validates: Requirements 3.2**
    // The form tag must be present in the template
    // PASSES on unfixed code; must PASS after fix (no form elements are removed)
    expect(dailyExpenseSource).toContain('<form');
  });

  it('DailyExpenseComponent template contains a submit button (form submission preserved)', () => {
    // **Validates: Requirements 3.2**
    // The submit button must be present in the template
    expect(dailyExpenseSource).toContain('type="submit"');
  });

  it('DailyExpenseComponent template contains ngSubmit handler (form submission logic preserved)', () => {
    // **Validates: Requirements 3.2**
    // The ngSubmit event binding must be present
    expect(dailyExpenseSource).toContain('ngSubmit');
  });

  it('DailyExpenseComponent template contains amount input (form field preserved)', () => {
    // **Validates: Requirements 3.2**
    // The amount input field must be present
    expect(dailyExpenseSource).toContain('formControlName="amount"');
  });

  it('property: form structural elements are always present in DailyExpenseComponent', () => {
    // **Validates: Requirements 3.2**
    // Property-based: all form structural elements must always be present (deterministic)
    fc.assert(
      fc.property(
        fc.constantFrom('<form', 'type="submit"', 'ngSubmit', 'formControlName="amount"'),
        (formElement) => {
          // Each form element must be present in the template
          // PASSES on unfixed code; must PASS after fix (no form elements are removed)
          expect(dailyExpenseSource).toContain(formElement);
        }
      ),
      { numRuns: 4 }
    );
  });
});
