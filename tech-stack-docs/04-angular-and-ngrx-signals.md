# Angular 21 + NgRx Signals — The App Framework & State

> **In one sentence:** Angular is the framework that builds Spenza's screens and logic; NgRx Signals is how the app *remembers* data and automatically updates the screen the instant that data changes.

---

## 1. What they are (plain English)

### Angular
**Angular** is a complete framework for building web apps. "Complete" means it gives you, out of the box: a way to build reusable UI pieces (**components**), a way to move between screens (**routing**), a way to share logic across the app (**services**), and tooling to build and optimise everything. Spenza runs **Angular 21** with **standalone components** (no old-style modules) and **zoneless change detection** (a newer, faster way Angular figures out what to re-draw).

Think of Angular as the *skeleton and nervous system* of the app — the structure that holds everything and the wiring that carries signals between parts.

### NgRx Signals
A core challenge in any app: many screens need the **same** data (your expenses show on the dashboard, the daily list, the charts, the limits screen). When you add an expense, *all* of those must update. **State management** is how you keep one source of truth and have the UI react to it.

**NgRx Signals** is a modern, lightweight state library built on Angular's native **signals**. A signal is a value that *announces when it changes*, so anything depending on it re-computes automatically. No manual "go update that screen too."

Think of it as a *spreadsheet*: change one cell (the data) and every formula referencing it (the screens) recalculates instantly.

---

## 2. The pain point it solves

- **Angular** solves: building a large, maintainable app without re-inventing routing, components, forms, and structure yourself. It enforces patterns so a big codebase stays organised.
- **NgRx Signals** solves: the classic "I changed the data but the screen still shows the old value" bug, and its opposite, "I have to manually refresh five screens whenever one thing changes." With signals, the UI is always a reflection of the current state — automatically and efficiently.

**Zoneless change detection** specifically solves performance: older Angular re-checked huge portions of the app on every event; zoneless + signals means Angular updates *only* what actually depends on the changed value.

---

## 3. How Spenza uses them

### Components and features
The app is organised by **feature folders** under `src/app/features/` — each is a self-contained screen or flow:

```
features/
  auth/            dashboard/      daily-expense/   monthly-expense/
  finances/        reminders/      settings/        subscribe/
  family-setup/    expense-limit/  welcome/         privacy/  terms/
```

Shared, cross-cutting logic lives in `src/app/core/` (services, guards, interceptors, models) and reusable UI in `src/app/shared/`.

### Signals as the reactive backbone
Spenza uses signals everywhere for live state. The clearest example is the auth state in `auth.service.ts`:

```ts
readonly isAuthenticated = signal<boolean>(false);
readonly userEmail = signal<string | null>(null);
readonly firebaseUid = signal<string | null>(null);
// a computed signal derives from others and updates automatically:
readonly displayName = computed(() => this.userEmail()?.split('@')[0] ?? null);
```

When `userEmail` changes, `displayName` recomputes and every template using it re-renders — no manual wiring. The expense data uses the same pattern through an `ExpenseStore` (`expense-store.service.ts`), an `@ngrx/signals` signal store that is the single source of truth for expenses across all screens.

### Guards and interceptors (Angular plumbing)
- **Guards** (`core/guards/`) protect routes — e.g. `auth.guard.ts` waits for the session to be restored before letting you into protected screens, and `subscription.guard.ts` gates premium screens.
- **Interceptors** (`core/interceptors/`) sit on the HTTP pipeline — e.g. `auth.interceptor.ts` automatically attaches the Google access token to outgoing API requests so individual services don't have to.

### Why "standalone + zoneless" matters here
Spenza is mobile-first and must feel instant on a phone. Standalone components keep bundles smaller (only what a screen needs is loaded), and zoneless change detection means the app does the *minimum* work to update the screen — important on lower-end Android devices.

---

## 4. Key files to look at

- `personal-finance-pwa/src/app/app.config.ts` — how the app is bootstrapped (providers, zoneless setup).
- `personal-finance-pwa/src/app/app.routes.ts` — the route map (which URL shows which feature).
- `personal-finance-pwa/src/app/core/services/expense-store.service.ts` — the NgRx Signals store (the data heart).
- `personal-finance-pwa/src/app/core/services/auth.service.ts` — signals + computed in real use.
- `personal-finance-pwa/src/app/core/guards/` and `core/interceptors/` — route protection and HTTP plumbing.

---

## 5. Gotchas worth knowing

- **Read a signal by calling it.** `userEmail()` returns the value; `userEmail` (no parens) is the signal object. Easy to trip over.
- **Zoneless means be explicit.** Without Zone.js, Angular relies on signals to know what changed — state that *isn't* a signal won't auto-update the UI. Keep reactive state in signals.
- **`computed` is derived, not stored.** Don't try to set a computed signal; change its inputs instead.
- **Feature isolation is intentional.** Cross-feature logic belongs in `core/services`, not copied between features — the project's `AI_RULES.md` reinforces this.

---

## TL;DR

Angular gives Spenza its structure — components, routing, services, guards, interceptors — in a modern standalone, zoneless setup tuned for mobile. NgRx Signals (on Angular signals) keeps one source of truth for data like auth and expenses, so every screen updates automatically and efficiently the moment that data changes.
