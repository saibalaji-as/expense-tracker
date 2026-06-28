# UI Layer — Tailwind CSS, Lucide Icons & Chart.js

> **In one sentence:** Tailwind styles every screen, Lucide supplies the icons, and Chart.js (through ng2-charts) draws the spending graphs — together they give Spenza a clean, consistent, mobile-first look with visual insight into where money goes.

---

## 1. What they are (plain English)

These three handle how Spenza *looks* and how it *visualises* data:

- **Tailwind CSS** — a styling system where you build designs by combining tiny "utility" classes directly in your markup (e.g. `flex`, `p-4`, `rounded-xl`) instead of writing big custom stylesheets. It comes with a consistent scale of spacing, colours, and sizes, so everything looks coherent.
- **Lucide (`lucide-angular`)** — a library of clean, consistent **icons** (wallet, calendar, chart, shield…) used throughout the UI.
- **Chart.js (`chart.js` + `ng2-charts`)** — a charting library that draws bars, lines, and pie/doughnut charts. `ng2-charts` is the Angular-friendly wrapper around it.

Think of Tailwind as a *box of matched LEGO bricks* (consistent sizes/colours you snap together), Lucide as a *matched set of pictograms*, and Chart.js as the *graph paper* that turns numbers into pictures.

---

## 2. The pain point it solves

- **Inconsistent, sprawling CSS.** Hand-written stylesheets drift into chaos on big apps. Tailwind's utility classes + design tokens keep spacing, colour, and typography consistent, and tend to *shrink* CSS over time because you reuse the same classes.
- **Mismatched icons.** Grabbing icons from random sources looks unprofessional; one icon set (Lucide) keeps the visual language unified.
- **Numbers don't reveal patterns.** A table of expenses hides trends; charts make "you're overspending on dining" obvious at a glance — which is the *point* of an expense tracker.
- **Theming.** Spenza supports light/dark themes; Tailwind + CSS custom properties make that switch clean.

---

## 3. How Spenza uses them

### Tailwind
Spenza runs **Tailwind CSS `^3.4.x`** wired through PostCSS (`@tailwindcss/postcss`, `autoprefixer`). It's combined with **CSS custom properties** (variables like `--gradient-primary`, `--muted-foreground` seen in component styles) to drive **light/dark themes**. Components mix Tailwind utilities with scoped component styles for the more bespoke visuals (e.g. the animated landing/auth screen).

Angular even enforces **style budgets** in the production build (component styles warn at 4kB, error at 8kB) — a guardrail that keeps per-component CSS lean, which pairs naturally with Tailwind's utility approach.

### Lucide icons
Icons are imported per-component and registered with Angular. You can see this concretely in `auth-callback.component.ts`, which pulls in a curated icon set:

```ts
import {
  LucideAngularModule, Wallet, AlertCircle, CalendarDays,
  LayoutDashboard, Cloud, Users, TrendingUp, ShieldCheck, ScanLine, ...
} from 'lucide-angular';
```

Each feature imports only the icons it uses, which keeps bundles small (consistent with Angular's standalone, load-only-what-you-need philosophy — see [04-angular-and-ngrx-signals.md](04-angular-and-ngrx-signals.md)).

### Charts
Spending visualisation uses **Chart.js `^4.5.x`** via **`ng2-charts` `^10`**. These render the dashboard's spending breakdowns and trends (by category, over time). Because the underlying data lives in signals/the expense store, charts update reactively when expenses change.

---

## 4. Key files to look at

- `personal-finance-pwa/tailwind.config.js` (or PostCSS config) — Tailwind setup and theme tokens.
- `personal-finance-pwa/src/styles.*` — global styles + CSS custom properties for theming.
- `personal-finance-pwa/src/app/features/dashboard/` — chart usage in context.
- `personal-finance-pwa/src/app/features/auth/auth-callback.component.ts` — a rich example of Lucide icon registration + scoped styling.
- `personal-finance-pwa/package.json` — `tailwindcss`, `lucide-angular`, `chart.js`, `ng2-charts`.

---

## 5. Gotchas worth knowing

- **Respect the style budgets.** The build errors if a component's CSS exceeds 8kB — lean on Tailwind utilities and shared tokens rather than large per-component stylesheets.
- **Import only the icons you use.** Importing the whole icon set bloats the bundle; register per-component as the code already does.
- **Theme via variables, not hardcoded colours.** Light/dark relies on CSS custom properties; hardcoding hex values breaks theming.
- **Charts need clean data.** Feed Chart.js well-shaped, reactive data from the store; recompute via signals/computed so graphs stay in sync with expenses.
- **Mobile-first sizing.** The primary target is a phone viewport (390px wide, per the Playwright config) — design and test at that size first.

---

## TL;DR

Tailwind keeps Spenza's styling consistent and lean (with build-enforced CSS budgets and light/dark theming via CSS variables), Lucide gives it a unified icon set imported per-component to stay light, and Chart.js + ng2-charts turn the user's expense data into the bar/line/pie charts that make spending patterns obvious — all mobile-first.
