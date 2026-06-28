# Playwright E2E — Full Test Report

> Extracted from `e2e-report/index.html` (the same data served at http://localhost:9323).
> Regenerate with `node e2e/extract-html-report.js`.

## Summary

- **Started:** 2026-06-28T11:00:35.516Z
- **Duration:** 2m 37s
- **Projects:** chromium, desktop
- **Total:** 204
- ✅ Passed: 164
- ❌ Failed: 0
- ⚠️ Flaky: 0
- ⏭️ Skipped: 40
- **Result:** ✅ PASS

## Tests

### 📄 01-auth.spec.ts

#### ✅ TC-AUTH-01 — Unauthenticated user is redirected to login _(chromium)_

- Outcome: **expected** · Duration: 468 ms — `01-auth.spec.ts:11`

<details><summary>Steps</summary>

- Before Hooks _(342 ms)_
  - Fixture "browser" _(73 ms)_
    - Launch browser _(71 ms)_
  - Fixture "context" _(5 ms)_
    - Create context _(4 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(38 ms)_
  - Fixture "unauthenticatedPage" _(217 ms)_
    - Navigate to "/" _(209 ms)_
- Navigate to "/#/daily" _(3 ms)_
- Expect "toHaveURL" _(65 ms)_
- Expect "toBeVisible" locator('text=/sign in/i').or(locator('text=/log in/i')).first() _(7 ms)_
- After Hooks _(130 ms)_
  - Fixture "unauthenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(127 ms)_
    - Close context _(58 ms)_

</details>

#### ✅ TC-AUTH-04 — Sign-out clears session and redirects to login _(chromium)_

- Outcome: **expected** · Duration: 890 ms — `01-auth.spec.ts:17`

<details><summary>Steps</summary>

- Before Hooks _(275 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(34 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(237 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(209 ms)_
    - Wait for selector locator('#amount-input') _(14 ms)_
- Navigate to "/#/settings" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('button').filter({ hasText: /sign out|log out/i }).first() _(80 ms)_
- Click locator('button').filter({ hasText: /sign out|log out/i }).first() _(329 ms)_
- Expect "toHaveURL" _(85 ms)_
- Evaluate _(2 ms)_
- Expect "toBeNull" _(0 ms)_
- After Hooks _(118 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(116 ms)_
    - Close context _(47 ms)_

</details>

#### ✅ TC-AUTH-06 — Sign-in failure shows error, stays on login page _(chromium)_

- Outcome: **expected** · Duration: 685 ms — `01-auth.spec.ts:32`

<details><summary>Steps</summary>

- Before Hooks _(39 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
- Navigate to "/#/auth/callback" _(191 ms)_
- Wait for load state "load" _(0 ms)_
- Click locator('button').filter({ hasText: /sign in/i }).first() _(304 ms)_
- Expect "toHaveURL" _(1 ms)_
- After Hooks _(137 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(135 ms)_
    - Close context _(50 ms)_

</details>

#### ✅ TC-AUTH-07 — App restores session silently from storage (no picker) _(chromium)_

- Outcome: **expected** · Duration: 385 ms — `01-auth.spec.ts:67`

<details><summary>Steps</summary>

- Before Hooks _(39 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
- Navigate to "/#/daily" _(213 ms)_
- Expect "toHaveURL" _(10 ms)_
- Evaluate _(2 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(122 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(119 ms)_
    - Close context _(49 ms)_

</details>

#### ✅ TC-AUTH-08 — Missing Drive scope shows recovery message _(chromium)_

- Outcome: **expected** · Duration: 688 ms — `01-auth.spec.ts:88`

<details><summary>Steps</summary>

- Before Hooks _(37 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(33 ms)_
    - Create page _(33 ms)_
- Navigate to "/#/auth/callback" _(312 ms)_
- Click locator('button').filter({ hasText: /sign in/i }).first() _(186 ms)_
- Expect "toBeVisible" locator('text=/drive|permission|checkbox|all.*permission/i').first() _(3 ms)_
- After Hooks _(137 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(135 ms)_
    - Close context _(51 ms)_

</details>

#### ✅ TC-AUTH-01 — Unauthenticated user is redirected to login _(desktop)_

- Outcome: **expected** · Duration: 706 ms — `01-auth.spec.ts:11`

<details><summary>Steps</summary>

- Before Hooks _(499 ms)_
  - Fixture "browser" _(98 ms)_
    - Launch browser _(96 ms)_
  - Fixture "context" _(5 ms)_
    - Create context _(4 ms)_
  - Fixture "page" _(40 ms)_
    - Create page _(39 ms)_
  - Fixture "unauthenticatedPage" _(335 ms)_
    - Navigate to "/" _(327 ms)_
- Navigate to "/#/daily" _(1 ms)_
- Expect "toHaveURL" _(41 ms)_
- Expect "toBeVisible" locator('text=/sign in/i').or(locator('text=/log in/i')).first() _(13 ms)_
- After Hooks _(266 ms)_
  - Fixture "unauthenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(262 ms)_
    - Close context _(77 ms)_

</details>

#### ✅ TC-AUTH-04 — Sign-out clears session and redirects to login _(desktop)_

- Outcome: **expected** · Duration: 1244 ms — `01-auth.spec.ts:17`

<details><summary>Steps</summary>

- Before Hooks _(517 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(41 ms)_
    - Create page _(41 ms)_
  - Fixture "authenticatedPage" _(471 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(442 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Navigate to "/#/settings" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('button').filter({ hasText: /sign out|log out/i }).first() _(81 ms)_
- Click locator('button').filter({ hasText: /sign out|log out/i }).first() _(394 ms)_
- Expect "toHaveURL" _(100 ms)_
- Evaluate _(1 ms)_
- Expect "toBeNull" _(0 ms)_
- After Hooks _(150 ms)_
  - Fixture "authenticatedPage" _(1 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(147 ms)_
    - Close context _(63 ms)_

</details>

#### ✅ TC-AUTH-06 — Sign-in failure shows error, stays on login page _(desktop)_

- Outcome: **expected** · Duration: 818 ms — `01-auth.spec.ts:32`

<details><summary>Steps</summary>

- Before Hooks _(48 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(43 ms)_
    - Create page _(43 ms)_
- Navigate to "/#/auth/callback" _(232 ms)_
- Wait for load state "load" _(0 ms)_
- Click locator('button').filter({ hasText: /sign in/i }).first() _(226 ms)_
- Expect "toHaveURL" _(1 ms)_
- After Hooks _(294 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(292 ms)_
    - Close context _(80 ms)_

</details>

#### ✅ TC-AUTH-07 — App restores session silently from storage (no picker) _(desktop)_

- Outcome: **expected** · Duration: 609 ms — `01-auth.spec.ts:67`

<details><summary>Steps</summary>

- Before Hooks _(43 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(40 ms)_
    - Create page _(40 ms)_
- Navigate to "/#/daily" _(266 ms)_
- Expect "toHaveURL" _(12 ms)_
- Evaluate _(2 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(283 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(280 ms)_
    - Close context _(79 ms)_

</details>

#### ✅ TC-AUTH-08 — Missing Drive scope shows recovery message _(desktop)_

- Outcome: **expected** · Duration: 919 ms — `01-auth.spec.ts:88`

<details><summary>Steps</summary>

- Before Hooks _(43 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(38 ms)_
- Navigate to "/#/auth/callback" _(569 ms)_
- Click locator('button').filter({ hasText: /sign in/i }).first() _(15 ms)_
- Expect "toBeVisible" locator('text=/drive|permission|checkbox|all.*permission/i').first() _(4 ms)_
- After Hooks _(274 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(272 ms)_
    - Close context _(73 ms)_

</details>

### 📄 02-onboarding.spec.ts

#### ✅ TC-ONBD-01 — First-time user (no mode set) is routed to mode-select _(chromium)_

- Outcome: **expected** · Duration: 352 ms — `02-onboarding.spec.ts:10`

<details><summary>Steps</summary>

- Before Hooks _(37 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(33 ms)_
    - Create page _(33 ms)_
- Navigate to "/#/daily" _(153 ms)_
- Expect "toHaveURL" _(28 ms)_
- Expect "toBeVisible" locator('[aria-label="Single User mode"]') _(2 ms)_
- Expect "toBeVisible" locator('[aria-label="Family / Shared mode"]') _(1 ms)_
- After Hooks _(122 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(120 ms)_
    - Close context _(51 ms)_

</details>

#### ✅ TC-ONBD-02 — Selecting Single mode persists mode and advances to sign-in _(chromium)_

- Outcome: **expected** · Duration: 673 ms — `02-onboarding.spec.ts:24`

<details><summary>Steps</summary>

- Before Hooks _(38 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(34 ms)_
    - Create page _(34 ms)_
- Navigate to "/#/mode-select" _(255 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('[aria-label="Single User mode"]') _(12 ms)_
- Click locator('[aria-label="Single User mode"]') _(173 ms)_
- Expect "toHaveURL" _(71 ms)_
- Evaluate _(1 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(119 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(116 ms)_
    - Close context _(47 ms)_

</details>

#### ✅ TC-ONBD-03 — Family mode is gated behind Pro for non-Pro users _(chromium)_

- Outcome: **expected** · Duration: 357 ms — `02-onboarding.spec.ts:44`

<details><summary>Steps</summary>

- Before Hooks _(249 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(210 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(183 ms)_
    - Wait for selector locator('#amount-input') _(17 ms)_
- Navigate to "/#/mode-select" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(109 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(106 ms)_
    - Close context _(50 ms)_

</details>

#### ✅ TC-ONBD-04 — Zero-income user navigating to /daily is redirected to income setup _(chromium)_

- Outcome: **expected** · Duration: 394 ms — `02-onboarding.spec.ts:57`

<details><summary>Steps</summary>

- Before Hooks _(246 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(34 ms)_
  - Fixture "noIncomePage" _(206 ms)_
    - Navigate to "/#/daily" _(202 ms)_
- Expect "toHaveURL" _(10 ms)_
- After Hooks _(141 ms)_
  - Fixture "noIncomePage" _(1 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(138 ms)_
    - Close context _(63 ms)_

</details>

#### ✅ TC-ONBD-05 — Entering income enables access to daily route _(chromium)_

- Outcome: **expected** · Duration: 617 ms — `02-onboarding.spec.ts:62`

<details><summary>Steps</summary>

- Before Hooks _(263 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(34 ms)_
    - Create page _(33 ms)_
  - Fixture "noIncomePage" _(226 ms)_
    - Navigate to "/#/daily" _(222 ms)_
- Navigate to "/#/limits?onboarding=income" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Fill "50000" locator('input[type="number"], input[inputmode="decimal"]').first() _(20 ms)_
- Click locator('button').filter({ hasText: /save|confirm/i }).first() _(213 ms)_
- Navigate to "/#/daily" _(1 ms)_
- Expect "toHaveURL" _(2 ms)_
- After Hooks _(117 ms)_
  - Fixture "noIncomePage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(115 ms)_
    - Close context _(40 ms)_

</details>

#### ✅ TC-ONBD-06 — Budget percentages default to recommended values on fresh limits page _(chromium)_

- Outcome: **expected** · Duration: 397 ms — `02-onboarding.spec.ts:76`

<details><summary>Steps</summary>

- Before Hooks _(247 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(208 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(183 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" getByLabel(/Housing percentage/i).filter({ visible: true }).first() _(47 ms)_
- Expect "toHaveValue" getByLabel(/Housing percentage/i).filter({ visible: true }).first() _(3 ms)_
- After Hooks _(101 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(99 ms)_
    - Close context _(49 ms)_

</details>

#### ✅ TC-ONBD-07 — Returning user with mode+income bypasses onboarding _(chromium)_

- Outcome: **expected** · Duration: 375 ms — `02-onboarding.spec.ts:86`

<details><summary>Steps</summary>

- Before Hooks _(249 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(34 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(212 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(187 ms)_
    - Wait for selector locator('#amount-input') _(16 ms)_
- Navigate to "/#/daily" _(1 ms)_
- Expect "toHaveURL" _(1 ms)_
- Expect "not toHaveURL" _(1 ms)_
- After Hooks _(127 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(125 ms)_
    - Close context _(49 ms)_

</details>

#### ✅ TC-ONBD-01 — First-time user (no mode set) is routed to mode-select _(desktop)_

- Outcome: **expected** · Duration: 821 ms — `02-onboarding.spec.ts:10`

<details><summary>Steps</summary>

- Before Hooks _(42 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(38 ms)_
- Navigate to "/#/daily" _(525 ms)_
- Expect "toHaveURL" _(12 ms)_
- Expect "toBeVisible" locator('[aria-label="Single User mode"]') _(3 ms)_
- Expect "toBeVisible" locator('[aria-label="Family / Shared mode"]') _(2 ms)_
- After Hooks _(230 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(228 ms)_
    - Close context _(52 ms)_

</details>

#### ✅ TC-ONBD-02 — Selecting Single mode persists mode and advances to sign-in _(desktop)_

- Outcome: **expected** · Duration: 818 ms — `02-onboarding.spec.ts:24`

<details><summary>Steps</summary>

- Before Hooks _(39 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
- Navigate to "/#/mode-select" _(177 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('[aria-label="Single User mode"]') _(33 ms)_
- Click locator('[aria-label="Single User mode"]') _(242 ms)_
- Expect "toHaveURL" _(74 ms)_
- Evaluate _(1 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(248 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(246 ms)_
    - Close context _(67 ms)_

</details>

#### ✅ TC-ONBD-03 — Family mode is gated behind Pro for non-Pro users _(desktop)_

- Outcome: **expected** · Duration: 581 ms — `02-onboarding.spec.ts:44`

<details><summary>Steps</summary>

- Before Hooks _(339 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(40 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(296 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(272 ms)_
    - Wait for selector locator('#amount-input') _(11 ms)_
- Navigate to "/#/mode-select" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(242 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(239 ms)_
    - Close context _(63 ms)_

</details>

#### ✅ TC-ONBD-04 — Zero-income user navigating to /daily is redirected to income setup _(desktop)_

- Outcome: **expected** · Duration: 895 ms — `02-onboarding.spec.ts:57`

<details><summary>Steps</summary>

- Before Hooks _(741 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(39 ms)_
  - Fixture "noIncomePage" _(697 ms)_
    - Navigate to "/#/daily" _(692 ms)_
- Expect "toHaveURL" _(16 ms)_
- After Hooks _(141 ms)_
  - Fixture "noIncomePage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(139 ms)_
    - Close context _(41 ms)_

</details>

#### ✅ TC-ONBD-05 — Entering income enables access to daily route _(desktop)_

- Outcome: **expected** · Duration: 1490 ms — `02-onboarding.spec.ts:62`

<details><summary>Steps</summary>

- Before Hooks _(1253 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
  - Fixture "noIncomePage" _(1214 ms)_
    - Navigate to "/#/daily" _(1208 ms)_
- Navigate to "/#/limits?onboarding=income" _(2 ms)_
- Wait for load state "load" _(1 ms)_
- Fill "50000" locator('input[type="number"], input[inputmode="decimal"]').first() _(24 ms)_
- Click locator('button').filter({ hasText: /save|confirm/i }).first() _(24 ms)_
- Navigate to "/#/daily" _(2 ms)_
- Expect "toHaveURL" _(3 ms)_
- After Hooks _(182 ms)_
  - Fixture "noIncomePage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(179 ms)_
    - Close context _(41 ms)_

</details>

#### ✅ TC-ONBD-06 — Budget percentages default to recommended values on fresh limits page _(desktop)_

- Outcome: **expected** · Duration: 553 ms — `02-onboarding.spec.ts:76`

<details><summary>Steps</summary>

- Before Hooks _(295 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(37 ms)_
  - Fixture "authenticatedPage" _(254 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(226 ms)_
    - Wait for selector locator('#amount-input') _(16 ms)_
- Navigate to "/#/limits" _(2 ms)_
- Wait for load state "load" _(1 ms)_
- Expect "toBeVisible" getByLabel(/Housing percentage/i).filter({ visible: true }).first() _(103 ms)_
- Expect "toHaveValue" getByLabel(/Housing percentage/i).filter({ visible: true }).first() _(3 ms)_
- After Hooks _(153 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(152 ms)_
    - Close context _(67 ms)_

</details>

#### ✅ TC-ONBD-07 — Returning user with mode+income bypasses onboarding _(desktop)_

- Outcome: **expected** · Duration: 499 ms — `02-onboarding.spec.ts:86`

<details><summary>Steps</summary>

- Before Hooks _(275 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(236 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(211 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Navigate to "/#/daily" _(1 ms)_
- Expect "toHaveURL" _(1 ms)_
- Expect "not toHaveURL" _(0 ms)_
- After Hooks _(226 ms)_
  - Fixture "authenticatedPage" _(1 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(223 ms)_
    - Close context _(66 ms)_

</details>

### 📄 03-daily-expense.spec.ts

#### ✅ TC-DAILY-01 — Log a new expense (happy path) _(chromium)_

- Outcome: **expected** · Duration: 785 ms — `03-daily-expense.spec.ts:42`

<details><summary>Steps</summary>

- Before Hooks _(267 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(33 ms)_
    - Create page _(33 ms)_
  - Fixture "authenticatedPage" _(230 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(208 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(3 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(319 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(31 ms)_
- Fill "500" locator('#amount-input') _(5 ms)_
- Fill "Weekly groceries" locator('#comment-input') _(3 ms)_
- Click locator('button[type="submit"]') _(22 ms)_
- Expect "toBeVisible" locator('text=500').or(locator('text=₹500')).first() _(9 ms)_
- After Hooks _(122 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(120 ms)_
    - Close context _(42 ms)_

</details>

#### ✅ TC-DAILY-02 — Log expense with a past date _(chromium)_

- Outcome: **expected** · Duration: 738 ms — `03-daily-expense.spec.ts:55`

<details><summary>Steps</summary>

- Before Hooks _(250 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(34 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(212 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(183 ms)_
    - Wait for selector locator('#amount-input') _(18 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(2 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(322 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(30 ms)_
- Fill "2026-06-25" locator('#date-input') _(4 ms)_
- Fill "300" locator('#amount-input') _(10 ms)_
- Click locator('button[type="submit"]') _(22 ms)_
- Expect "toBeVisible" locator('text=300').or(locator('text=₹300')).first() _(7 ms)_
- After Hooks _(90 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(88 ms)_
    - Close context _(35 ms)_

</details>

#### ✅ TC-DAILY-03 — Edit an existing expense updates amount _(chromium)_

- Outcome: **expected** · Duration: 936 ms — `03-daily-expense.spec.ts:67`

<details><summary>Steps</summary>

- Before Hooks _(353 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(314 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(293 ms)_
    - Wait for selector locator('#amount-input') _(11 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(2 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(199 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(25 ms)_
- Fill "500" locator('#amount-input') _(7 ms)_
- Click locator('button[type="submit"]') _(18 ms)_
- Wait for selector locator('text=500').or(locator('text=₹500')).first() _(8 ms)_
- Click locator('#todays-entries li').first() _(76 ms)_
- Click locator('[role="dialog"]').getByRole('button', { name: /edit/i }).first() _(21 ms)_
- Fill "750" locator('#amount-input') _(3 ms)_
- Click locator('button[type="submit"]') _(24 ms)_
- Click locator('#todays-entries li').first() _(72 ms)_
- Expect "toBeVisible" locator('[role="dialog"]').locator('text=750').or(locator('[role="dialog"]').locator('text=₹750')).first() _(10 ms)_
- After Hooks _(115 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(113 ms)_
    - Close context _(48 ms)_

</details>

#### ⏭️ TC-DAILY-04 — Delete an expense removes it from the list _(chromium)_

- Outcome: **skipped** · Duration: 768 ms — `03-daily-expense.spec.ts:97`
- Annotations: `skip: Delete button not found on entry`

<details><summary>Steps</summary>

- Before Hooks _(259 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(217 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(195 ms)_
    - Wait for selector locator('#amount-input') _(11 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(3 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(311 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(30 ms)_
- Fill "100" locator('#amount-input') _(4 ms)_
- Click locator('button[type="submit"]') _(24 ms)_
- Expect "toBeVisible" locator('text=100').or(locator('text=₹100')).first() _(42 ms)_
- After Hooks _(92 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(90 ms)_
    - Close context _(40 ms)_

</details>

#### ✅ TC-DAILY-05 — Overspend shows negative savings indicator _(chromium)_

- Outcome: **expected** · Duration: 1025 ms — `03-daily-expense.spec.ts:116`

<details><summary>Steps</summary>

- Before Hooks _(336 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(37 ms)_
  - Fixture "authenticatedPage" _(296 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(272 ms)_
    - Wait for selector locator('#amount-input') _(14 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(3 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(204 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(216 ms)_
- Fill "5000" locator('#amount-input') _(11 ms)_
- Click locator('button[type="submit"]') _(59 ms)_
- Expect "toBeVisible" locator('[class*="destructive"]').or(locator('[role="alert"]').filter({ hasText: /over|budget|warn/i })).or(locator('text=/−|−₹|-₹/')).first() _(8 ms)_
- After Hooks _(183 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(1 ms)_
  - Fixture "context" _(180 ms)_
    - Close context _(67 ms)_

</details>

#### ✅ TC-DAILY-13 — Expense links to payment source account _(chromium)_

- Outcome: **expected** · Duration: 822 ms — `03-daily-expense.spec.ts:131`

<details><summary>Steps</summary>

- Before Hooks _(593 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(53 ms)_
    - Create page _(53 ms)_
  - Fixture "proUserPage" _(536 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(514 ms)_
    - Wait for selector locator('#amount-input') _(11 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(1 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(20 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(31 ms)_
- Click locator('app-themed-select[formcontrolname="accountId"]') _(23 ms)_
- Fill "200" locator('#amount-input') _(9 ms)_
- Click locator('button[type="submit"]') _(24 ms)_
- Expect "toBeVisible" locator('text=200').or(locator('text=₹200')).first() _(3 ms)_
- After Hooks _(112 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(110 ms)_
    - Close context _(42 ms)_

</details>

#### ✅ TC-DAILY-14 — Expense saves locally while offline _(chromium)_

- Outcome: **expected** · Duration: 817 ms — `03-daily-expense.spec.ts:150`

<details><summary>Steps</summary>

- Before Hooks _(262 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(222 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(194 ms)_
    - Wait for selector locator('#amount-input') _(17 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /utilit/i }).first() _(3 ms)_
- Click locator('button[aria-label]').filter({ hasText: /utilit/i }).first() _(316 ms)_
- Click locator('button[aria-label]').filter({ hasText: /utilit/i }).first() _(47 ms)_
- Set offline mode _(0 ms)_
- Evaluate _(2 ms)_
- Fill "150" locator('#amount-input') _(9 ms)_
- Click locator('button[type="submit"]') _(25 ms)_
- Expect "toBeVisible" locator('text=150').or(locator('text=₹150')).first() _(8 ms)_
- Expect "toBeVisible" locator('[role="alert"]').filter({ hasText: /saved locally|sync.*online/i }).first() _(37 ms)_
- Set offline mode _(1 ms)_
- Evaluate _(1 ms)_
- After Hooks _(105 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(103 ms)_
    - Close context _(47 ms)_

</details>

#### ✅ TC-DAILY-15 — Offline entry syncs on reconnect _(chromium)_

- Outcome: **expected** · Duration: 5757 ms — `03-daily-expense.spec.ts:169`

<details><summary>Steps</summary>

- Before Hooks _(343 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(40 ms)_
    - Create page _(40 ms)_
  - Fixture "authenticatedPage" _(298 ms)_
    - Navigate to "/#/daily" _(7 ms)_
    - Wait for load state "load" _(273 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(2 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(215 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(204 ms)_
- Set offline mode _(0 ms)_
- Evaluate _(1 ms)_
- Fill "250" locator('#amount-input') _(6 ms)_
- Click locator('button[type="submit"]') _(18 ms)_
- Expect "toBeVisible" locator('[role="alert"]').filter({ hasText: /saved locally|sync.*online/i }).first() _(37 ms)_
- Set offline mode _(0 ms)_
- Evaluate _(0 ms)_
- Expect "toBeHidden" locator('[role="alert"]').filter({ hasText: /saved locally|sync.*online/i }).first() _(4834 ms)_
- After Hooks _(93 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(91 ms)_
    - Close context _(35 ms)_

</details>

#### ⏭️ TC-DAILY-12 — Voice input shows unsupported message when Speech API absent _(chromium)_

- Outcome: **skipped** · Duration: 388 ms — `03-daily-expense.spec.ts:183`
- Annotations: `skip: Voice button not visible — may require Pro/AI to be enabled`

<details><summary>Steps</summary>

- Before Hooks _(265 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(227 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(205 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Evaluate _(0 ms)_
- After Hooks _(124 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(121 ms)_
    - Close context _(52 ms)_

</details>

#### ✅ TC-DAILY-16 — Date navigation shows different day entries _(chromium)_

- Outcome: **expected** · Duration: 378 ms — `03-daily-expense.spec.ts:199`

<details><summary>Steps</summary>

- Before Hooks _(254 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(34 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(215 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(188 ms)_
    - Wait for selector locator('#amount-input') _(17 ms)_
- Fill "2026-06-27" locator('#date-input') _(3 ms)_
- Expect "toBeVisible" locator('button').filter({ hasText: /go.*today|today/i }).first() _(4 ms)_
- After Hooks _(120 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(117 ms)_
    - Close context _(50 ms)_

</details>

#### ✅ TC-DAILY-01 — Log a new expense (happy path) _(desktop)_

- Outcome: **expected** · Duration: 798 ms — `03-daily-expense.spec.ts:42`

<details><summary>Steps</summary>

- Before Hooks _(489 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(450 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(429 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(2 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(14 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(37 ms)_
- Fill "500" locator('#amount-input') _(4 ms)_
- Fill "Weekly groceries" locator('#comment-input') _(4 ms)_
- Click locator('button[type="submit"]') _(41 ms)_
- Expect "toBeVisible" locator('text=500').or(locator('text=₹500')).first() _(3 ms)_
- After Hooks _(195 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(193 ms)_
    - Close context _(54 ms)_

</details>

#### ✅ TC-DAILY-02 — Log expense with a past date _(desktop)_

- Outcome: **expected** · Duration: 869 ms — `03-daily-expense.spec.ts:55`

<details><summary>Steps</summary>

- Before Hooks _(267 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(226 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(138 ms)_
    - Wait for selector locator('#amount-input') _(78 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(14 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(333 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(23 ms)_
- Fill "2026-06-25" locator('#date-input') _(3 ms)_
- Fill "300" locator('#amount-input') _(6 ms)_
- Click locator('button[type="submit"]') _(13 ms)_
- Expect "toBeVisible" locator('text=300').or(locator('text=₹300')).first() _(15 ms)_
- After Hooks _(195 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(192 ms)_
    - Close context _(62 ms)_

</details>

#### ✅ TC-DAILY-03 — Edit an existing expense updates amount _(desktop)_

- Outcome: **expected** · Duration: 1107 ms — `03-daily-expense.spec.ts:67`

<details><summary>Steps</summary>

- Before Hooks _(302 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(39 ms)_
  - Fixture "authenticatedPage" _(259 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(236 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(3 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(287 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(20 ms)_
- Fill "500" locator('#amount-input') _(7 ms)_
- Click locator('button[type="submit"]') _(19 ms)_
- Wait for selector locator('text=500').or(locator('text=₹500')).first() _(2 ms)_
- Click locator('#todays-entries li').first() _(29 ms)_
- Click locator('[role="dialog"]').getByRole('button', { name: /edit/i }).first() _(75 ms)_
- Fill "750" locator('#amount-input') _(3 ms)_
- Click locator('button[type="submit"]') _(93 ms)_
- Click locator('#todays-entries li').first() _(48 ms)_
- Expect "toBeVisible" locator('[role="dialog"]').locator('text=750').or(locator('[role="dialog"]').locator('text=₹750')).first() _(33 ms)_
- After Hooks _(181 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(179 ms)_
    - Close context _(59 ms)_

</details>

#### ⏭️ TC-DAILY-04 — Delete an expense removes it from the list _(desktop)_

- Outcome: **skipped** · Duration: 935 ms — `03-daily-expense.spec.ts:97`
- Annotations: `skip: Delete button not found on entry`

<details><summary>Steps</summary>

- Before Hooks _(332 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(65 ms)_
    - Create page _(65 ms)_
  - Fixture "authenticatedPage" _(264 ms)_
    - Navigate to "/#/daily" _(7 ms)_
    - Wait for load state "load" _(229 ms)_
    - Wait for selector locator('#amount-input') _(17 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(2 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(296 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(20 ms)_
- Fill "100" locator('#amount-input') _(7 ms)_
- Click locator('button[type="submit"]') _(50 ms)_
- Expect "toBeVisible" locator('text=100').or(locator('text=₹100')).first() _(44 ms)_
- After Hooks _(183 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(180 ms)_
    - Close context _(52 ms)_

</details>

#### ✅ TC-DAILY-05 — Overspend shows negative savings indicator _(desktop)_

- Outcome: **expected** · Duration: 1172 ms — `03-daily-expense.spec.ts:116`

<details><summary>Steps</summary>

- Before Hooks _(813 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(774 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(749 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(2 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(27 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(49 ms)_
- Fill "5000" locator('#amount-input') _(4 ms)_
- Click locator('button[type="submit"]') _(60 ms)_
- Expect "toBeVisible" locator('[class*="destructive"]').or(locator('[role="alert"]').filter({ hasText: /over|budget|warn/i })).or(locator('text=/−|−₹|-₹/')).first() _(5 ms)_
- After Hooks _(212 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(209 ms)_
    - Close context _(57 ms)_

</details>

#### ✅ TC-DAILY-13 — Expense links to payment source account _(desktop)_

- Outcome: **expected** · Duration: 870 ms — `03-daily-expense.spec.ts:131`

<details><summary>Steps</summary>

- Before Hooks _(261 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(37 ms)_
  - Fixture "proUserPage" _(219 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(152 ms)_
    - Wait for selector locator('#amount-input') _(56 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(14 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(294 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(34 ms)_
- Click locator('app-themed-select[formcontrolname="accountId"]') _(48 ms)_
- Fill "200" locator('#amount-input') _(5 ms)_
- Click locator('button[type="submit"]') _(30 ms)_
- Expect "toBeVisible" locator('text=200').or(locator('text=₹200')).first() _(3 ms)_
- After Hooks _(175 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(173 ms)_
    - Close context _(47 ms)_

</details>

#### ✅ TC-DAILY-14 — Expense saves locally while offline _(desktop)_

- Outcome: **expected** · Duration: 987 ms — `03-daily-expense.spec.ts:150`

<details><summary>Steps</summary>

- Before Hooks _(313 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(272 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(249 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /utilit/i }).first() _(2 ms)_
- Click locator('button[aria-label]').filter({ hasText: /utilit/i }).first() _(293 ms)_
- Click locator('button[aria-label]').filter({ hasText: /utilit/i }).first() _(117 ms)_
- Set offline mode _(0 ms)_
- Evaluate _(1 ms)_
- Fill "150" locator('#amount-input') _(4 ms)_
- Click locator('button[type="submit"]') _(30 ms)_
- Expect "toBeVisible" locator('text=150').or(locator('text=₹150')).first() _(37 ms)_
- Expect "toBeVisible" locator('[role="alert"]').filter({ hasText: /saved locally|sync.*online/i }).first() _(1 ms)_
- Set offline mode _(0 ms)_
- Evaluate _(1 ms)_
- After Hooks _(187 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(185 ms)_
    - Close context _(66 ms)_

</details>

#### ✅ TC-DAILY-15 — Offline entry syncs on reconnect _(desktop)_

- Outcome: **expected** · Duration: 5683 ms — `03-daily-expense.spec.ts:169`

<details><summary>Steps</summary>

- Before Hooks _(318 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(41 ms)_
    - Create page _(41 ms)_
  - Fixture "authenticatedPage" _(274 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(252 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Wait for selector locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(2 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(265 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(28 ms)_
- Set offline mode _(1 ms)_
- Evaluate _(1 ms)_
- Fill "250" locator('#amount-input') _(5 ms)_
- Click locator('button[type="submit"]') _(36 ms)_
- Expect "toBeVisible" locator('[role="alert"]').filter({ hasText: /saved locally|sync.*online/i }).first() _(39 ms)_
- Set offline mode _(1 ms)_
- Evaluate _(0 ms)_
- Expect "toBeHidden" locator('[role="alert"]').filter({ hasText: /saved locally|sync.*online/i }).first() _(4832 ms)_
- After Hooks _(153 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(150 ms)_
    - Close context _(39 ms)_

</details>

#### ⏭️ TC-DAILY-12 — Voice input shows unsupported message when Speech API absent _(desktop)_

- Outcome: **skipped** · Duration: 601 ms — `03-daily-expense.spec.ts:183`
- Annotations: `skip: Voice button not visible — may require Pro/AI to be enabled`

<details><summary>Steps</summary>

- Before Hooks _(376 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(334 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(311 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Evaluate _(1 ms)_
- After Hooks _(227 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(225 ms)_
    - Close context _(68 ms)_

</details>

#### ✅ TC-DAILY-16 — Date navigation shows different day entries _(desktop)_

- Outcome: **expected** · Duration: 523 ms — `03-daily-expense.spec.ts:199`

<details><summary>Steps</summary>

- Before Hooks _(273 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(235 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(211 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Fill "2026-06-27" locator('#date-input') _(4 ms)_
- Expect "toBeVisible" locator('button').filter({ hasText: /go.*today|today/i }).first() _(3 ms)_
- After Hooks _(244 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(242 ms)_
    - Close context _(73 ms)_

</details>

### 📄 04-monthly.spec.ts

#### ✅ TC-MNTH-01 — Current month summary loads with totals _(chromium)_

- Outcome: **expected** · Duration: 409 ms — `04-monthly.spec.ts:9`

<details><summary>Steps</summary>

- Before Hooks _(251 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(34 ms)_
    - Create page _(33 ms)_
  - Fixture "authenticatedPage" _(214 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(187 ms)_
    - Wait for selector locator('#amount-input') _(18 ms)_
- Navigate to "/#/monthly" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/₹|INR|total|spent/i').first() _(3 ms)_
- Expect "toBeVisible" locator('canvas, [class*="chart"], [class*="breakdown"]').first() _(42 ms)_
- After Hooks _(114 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(111 ms)_
    - Close context _(56 ms)_

</details>

#### ✅ TC-MNTH-02 — Navigate to previous month updates label _(chromium)_

- Outcome: **expected** · Duration: 834 ms — `04-monthly.spec.ts:18`

<details><summary>Steps</summary>

- Before Hooks _(281 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(242 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(220 ms)_
    - Wait for selector locator('#amount-input') _(11 ms)_
- Navigate to "/#/monthly" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Click locator('button[aria-label*="previous" i], button[aria-label*="prev" i], button:has([class*="chevron-left"]), button:has([class*="arrow-left"])').first() _(310 ms)_
- Expect "toPass" _(109 ms)_
  - Query count locator('[role="alert"]').filter({ hasText: /no.*expense|no.*entr|logged/i }) _(1 ms)_
  - Expect "toBeTruthy" _(1 ms)_ ❌
  - Query count locator('[role="alert"]').filter({ hasText: /no.*expense|no.*entr|logged/i }) _(1 ms)_
  - Expect "toBeTruthy" _(0 ms)_
- After Hooks _(88 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(86 ms)_
    - Close context _(36 ms)_

</details>

#### ✅ TC-MNTH-03 — Future month navigation is blocked _(chromium)_

- Outcome: **expected** · Duration: 394 ms — `04-monthly.spec.ts:43`

<details><summary>Steps</summary>

- Before Hooks _(246 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(207 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(184 ms)_
    - Wait for selector locator('#amount-input') _(14 ms)_
- Navigate to "/#/monthly" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(100 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(98 ms)_
    - Close context _(48 ms)_

</details>

#### ✅ TC-MNTH-04 — Month with no entries shows empty state _(chromium)_

- Outcome: **expected** · Duration: 1089 ms — `04-monthly.spec.ts:59`

<details><summary>Steps</summary>

- Before Hooks _(551 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(511 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(490 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/monthly" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Click locator('button[aria-label*="previous" i], button:has([class*="chevron-left"]), button:has([class*="arrow-left"])').first() _(388 ms)_
- Expect "toBeVisible" locator('text=/no.*entries|no.*expense|nothing.*here|empty/i') _(3 ms)_
- After Hooks _(96 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(95 ms)_
    - Close context _(39 ms)_

</details>

#### ⏭️ TC-MNTH-05 — Category row expands on tap _(chromium)_

- Outcome: **skipped** · Duration: 378 ms — `04-monthly.spec.ts:71`
- Annotations: `skip: No category rows visible`

<details><summary>Steps</summary>

- Before Hooks _(251 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(213 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(185 ms)_
    - Wait for selector locator('#amount-input') _(18 ms)_
- Navigate to "/#/monthly" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(127 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(125 ms)_
    - Close context _(57 ms)_

</details>

#### ✅ TC-MNTH-06 — Budget group breakdown shows Needs/Wants/Savings _(chromium)_

- Outcome: **expected** · Duration: 608 ms — `04-monthly.spec.ts:86`

<details><summary>Steps</summary>

- Before Hooks _(473 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(34 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(435 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(414 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/monthly" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" getByText('Needs', { exact: true }).filter({ visible: true }).first() _(40 ms)_
- Expect "toBeVisible" getByText('Wants', { exact: true }).filter({ visible: true }).first() _(2 ms)_
- Expect "toBeVisible" locator('canvas').first() _(1 ms)_
- After Hooks _(92 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(90 ms)_
    - Close context _(49 ms)_

</details>

#### ✅ TC-MNTH-07 — Month-over-month change indicator is shown _(chromium)_

- Outcome: **expected** · Duration: 705 ms — `04-monthly.spec.ts:98`

<details><summary>Steps</summary>

- Before Hooks _(261 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(223 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(202 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/monthly" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Click locator('button[aria-label*="previous" i], button:has([class*="chevron-left"]), button:has([class*="arrow-left"])').first() _(307 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(98 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(96 ms)_
    - Close context _(43 ms)_

</details>

#### ✅ TC-MNTH-01 — Current month summary loads with totals _(desktop)_

- Outcome: **expected** · Duration: 816 ms — `04-monthly.spec.ts:9`

<details><summary>Steps</summary>

- Before Hooks _(504 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(464 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(438 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Navigate to "/#/monthly" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/₹|INR|total|spent/i').first() _(4 ms)_
- Expect "toBeVisible" locator('canvas, [class*="chart"], [class*="breakdown"]').first() _(88 ms)_
- After Hooks _(223 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(221 ms)_
    - Close context _(49 ms)_

</details>

#### ✅ TC-MNTH-02 — Navigate to previous month updates label _(desktop)_

- Outcome: **expected** · Duration: 990 ms — `04-monthly.spec.ts:18`

<details><summary>Steps</summary>

- Before Hooks _(295 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(42 ms)_
    - Create page _(40 ms)_
  - Fixture "authenticatedPage" _(250 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(225 ms)_
    - Wait for selector locator('#amount-input') _(14 ms)_
- Navigate to "/#/monthly" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Click locator('button[aria-label*="previous" i], button[aria-label*="prev" i], button:has([class*="chevron-left"]), button:has([class*="arrow-left"])').first() _(424 ms)_
- Expect "toPass" _(3 ms)_
  - Query count locator('[role="alert"]').filter({ hasText: /no.*expense|no.*entr|logged/i }) _(1 ms)_
  - Expect "toBeTruthy" _(0 ms)_
- After Hooks _(190 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(188 ms)_
    - Close context _(52 ms)_

</details>

#### ✅ TC-MNTH-03 — Future month navigation is blocked _(desktop)_

- Outcome: **expected** · Duration: 844 ms — `04-monthly.spec.ts:43`

<details><summary>Steps</summary>

- Before Hooks _(585 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(546 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(524 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/monthly" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(184 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(183 ms)_
    - Close context _(52 ms)_

</details>

#### ✅ TC-MNTH-04 — Month with no entries shows empty state _(desktop)_

- Outcome: **expected** · Duration: 1157 ms — `04-monthly.spec.ts:59`

<details><summary>Steps</summary>

- Before Hooks _(278 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(239 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(215 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Navigate to "/#/monthly" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Click locator('button[aria-label*="previous" i], button:has([class*="chevron-left"]), button:has([class*="arrow-left"])').first() _(528 ms)_
- Expect "toBeVisible" locator('text=/no.*entries|no.*expense|nothing.*here|empty/i') _(3 ms)_
- After Hooks _(159 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(156 ms)_
    - Close context _(40 ms)_

</details>

#### ⏭️ TC-MNTH-05 — Category row expands on tap _(desktop)_

- Outcome: **skipped** · Duration: 508 ms — `04-monthly.spec.ts:71`
- Annotations: `skip: No category rows visible`

<details><summary>Steps</summary>

- Before Hooks _(272 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(233 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(209 ms)_
    - Wait for selector locator('#amount-input') _(16 ms)_
- Navigate to "/#/monthly" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(236 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(234 ms)_
    - Close context _(66 ms)_

</details>

#### ✅ TC-MNTH-06 — Budget group breakdown shows Needs/Wants/Savings _(desktop)_

- Outcome: **expected** · Duration: 629 ms — `04-monthly.spec.ts:86`

<details><summary>Steps</summary>

- Before Hooks _(354 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(314 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(293 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/monthly" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" getByText('Needs', { exact: true }).filter({ visible: true }).first() _(97 ms)_
- Expect "toBeVisible" getByText('Wants', { exact: true }).filter({ visible: true }).first() _(6 ms)_
- Expect "toBeVisible" locator('canvas').first() _(2 ms)_
- After Hooks _(171 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(169 ms)_
    - Close context _(68 ms)_

</details>

#### ✅ TC-MNTH-07 — Month-over-month change indicator is shown _(desktop)_

- Outcome: **expected** · Duration: 1037 ms — `04-monthly.spec.ts:98`

<details><summary>Steps</summary>

- Before Hooks _(314 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(37 ms)_
  - Fixture "authenticatedPage" _(273 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(250 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/monthly" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Click locator('button[aria-label*="previous" i], button:has([class*="chevron-left"]), button:has([class*="arrow-left"])').first() _(448 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(167 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(165 ms)_
    - Close context _(51 ms)_

</details>

### 📄 05-limits.spec.ts

#### ✅ TC-LMT-01 — Set monthly income persists and recomputes limits _(chromium)_

- Outcome: **expected** · Duration: 916 ms — `05-limits.spec.ts:9`

<details><summary>Steps</summary>

- Before Hooks _(453 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(34 ms)_
    - Create page _(33 ms)_
  - Fixture "authenticatedPage" _(416 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(393 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('#monthlyIncome') _(37 ms)_
- Fill "80000" locator('#monthlyIncome') _(6 ms)_
- Click locator('button').filter({ hasText: /save/i }).first() _(319 ms)_
- Expect "toHaveValue" locator('#monthlyIncome') _(2 ms)_
- After Hooks _(98 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(97 ms)_
    - Close context _(41 ms)_

</details>

#### ⏭️ TC-LMT-02 — Adjusting a category percentage updates running total _(chromium)_

- Outcome: **skipped** · Duration: 413 ms — `05-limits.spec.ts:22`
- Annotations: `skip: Category percentage input not found`

<details><summary>Steps</summary>

- Before Hooks _(284 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(243 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(221 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(129 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(127 ms)_
    - Close context _(59 ms)_

</details>

#### ✅ TC-LMT-03 — Running total > 100% shows warning _(chromium)_

- Outcome: **expected** · Duration: 693 ms — `05-limits.spec.ts:37`

<details><summary>Steps</summary>

- Before Hooks _(610 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(53 ms)_
    - Create page _(52 ms)_
  - Fixture "authenticatedPage" _(553 ms)_
    - Navigate to "/#/daily" _(8 ms)_
    - Wait for load state "load" _(511 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Wait for load state "load" _(1 ms)_
- Query count locator('[class*="limit-row"] input[type="number"], [class*="category"] input[type="number"]') _(1 ms)_
- After Hooks _(85 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(83 ms)_
    - Close context _(34 ms)_

</details>

#### ⏭️ TC-LMT-04 — Savings below 20% shows low-savings warning _(chromium)_

- Outcome: **skipped** · Duration: 404 ms — `05-limits.spec.ts:51`
- Annotations: `skip: Savings input not found`

<details><summary>Steps</summary>

- Before Hooks _(271 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(229 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(155 ms)_
    - Wait for selector locator('#amount-input') _(62 ms)_
- Navigate to "/#/limits" _(3 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(129 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(126 ms)_
    - Close context _(50 ms)_

</details>

#### ⏭️ TC-LMT-05 — Add a custom expense category _(chromium)_

- Outcome: **skipped** · Duration: 418 ms — `05-limits.spec.ts:68`
- Annotations: `skip: Add custom category button not found`

<details><summary>Steps</summary>

- Before Hooks _(294 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(52 ms)_
    - Create page _(51 ms)_
  - Fixture "authenticatedPage" _(238 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(208 ms)_
    - Wait for selector locator('#amount-input') _(19 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(125 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(123 ms)_
    - Close context _(55 ms)_

</details>

#### ⏭️ TC-LMT-06 — Delete a custom category removes it _(chromium)_

- Outcome: **skipped** · Duration: 594 ms — `05-limits.spec.ts:90`
- Annotations: `skip: No custom category found to delete`

<details><summary>Steps</summary>

- Before Hooks _(478 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(436 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(412 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(116 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(114 ms)_
    - Close context _(43 ms)_

</details>

#### ✅ TC-LMT-07 — Cannot delete a predefined category _(chromium)_

- Outcome: **expected** · Duration: 2090 ms — `05-limits.spec.ts:106`

<details><summary>Steps</summary>

- Before Hooks _(1981 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(1941 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(1906 ms)_
    - Wait for selector locator('#amount-input') _(24 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(109 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(107 ms)_
    - Close context _(33 ms)_

</details>

#### ✅ TC-LMT-08 — Limits persist across sessions (read from snapshot) _(chromium)_

- Outcome: **expected** · Duration: 2444 ms — `05-limits.spec.ts:119`

<details><summary>Steps</summary>

- Before Hooks _(2318 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(2280 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(2246 ms)_
    - Wait for selector locator('#amount-input') _(23 ms)_
- Navigate to "/#/limits" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" getByText('Housing', { exact: true }).filter({ visible: true }).first() _(5 ms)_
- Expect "toHaveValue" getByLabel(/Housing percentage/i).filter({ visible: true }).first() _(38 ms)_
- After Hooks _(84 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(82 ms)_
    - Close context _(34 ms)_

</details>

#### ✅ TC-LMT-09 — Category group colour-coding is visually distinct _(chromium)_

- Outcome: **expected** · Duration: 1363 ms — `05-limits.spec.ts:128`

<details><summary>Steps</summary>

- Before Hooks _(1212 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(1173 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(1140 ms)_
    - Wait for selector locator('#amount-input') _(23 ms)_
- Navigate to "/#/limits" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" getByText('Needs', { exact: true }).filter({ visible: true }).first() _(46 ms)_
- Expect "toBeVisible" getByText('Wants', { exact: true }).filter({ visible: true }).first() _(4 ms)_
- After Hooks _(101 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(100 ms)_
    - Close context _(35 ms)_

</details>

#### ✅ TC-LMT-01 — Set monthly income persists and recomputes limits _(desktop)_

- Outcome: **expected** · Duration: 1007 ms — `05-limits.spec.ts:9`

<details><summary>Steps</summary>

- Before Hooks _(388 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(348 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(325 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('#monthlyIncome') _(92 ms)_
- Fill "80000" locator('#monthlyIncome') _(5 ms)_
- Click locator('button').filter({ hasText: /save/i }).first() _(346 ms)_
- Expect "toHaveValue" locator('#monthlyIncome') _(1 ms)_
- After Hooks _(172 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(170 ms)_
    - Close context _(52 ms)_

</details>

#### ⏭️ TC-LMT-02 — Adjusting a category percentage updates running total _(desktop)_

- Outcome: **skipped** · Duration: 2084 ms — `05-limits.spec.ts:22`
- Annotations: `skip: Category percentage input not found`

<details><summary>Steps</summary>

- Before Hooks _(1922 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(40 ms)_
    - Create page _(39 ms)_
  - Fixture "authenticatedPage" _(1879 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(1843 ms)_
    - Wait for selector locator('#amount-input') _(24 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(163 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(160 ms)_
    - Close context _(48 ms)_

</details>

#### ✅ TC-LMT-03 — Running total > 100% shows warning _(desktop)_

- Outcome: **expected** · Duration: 513 ms — `05-limits.spec.ts:37`

<details><summary>Steps</summary>

- Before Hooks _(274 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(235 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(209 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Query count locator('[class*="limit-row"] input[type="number"], [class*="category"] input[type="number"]') _(1 ms)_
- After Hooks _(240 ms)_
  - Fixture "authenticatedPage" _(1 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(237 ms)_
    - Close context _(65 ms)_

</details>

#### ⏭️ TC-LMT-04 — Savings below 20% shows low-savings warning _(desktop)_

- Outcome: **skipped** · Duration: 537 ms — `05-limits.spec.ts:51`
- Annotations: `skip: Savings input not found`

<details><summary>Steps</summary>

- Before Hooks _(290 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(3 ms)_
  - Fixture "page" _(53 ms)_
    - Create page _(53 ms)_
  - Fixture "authenticatedPage" _(233 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(206 ms)_
    - Wait for selector locator('#amount-input') _(18 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(248 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(246 ms)_
    - Close context _(75 ms)_

</details>

#### ⏭️ TC-LMT-05 — Add a custom expense category _(desktop)_

- Outcome: **skipped** · Duration: 702 ms — `05-limits.spec.ts:68`
- Annotations: `skip: Add custom category button not found`

<details><summary>Steps</summary>

- Before Hooks _(520 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(481 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(457 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(182 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(180 ms)_
    - Close context _(65 ms)_

</details>

#### ⏭️ TC-LMT-06 — Delete a custom category removes it _(desktop)_

- Outcome: **skipped** · Duration: 532 ms — `05-limits.spec.ts:90`
- Annotations: `skip: No custom category found to delete`

<details><summary>Steps</summary>

- Before Hooks _(272 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(233 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(210 ms)_
    - Wait for selector locator('#amount-input') _(14 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(261 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(259 ms)_
    - Close context _(67 ms)_

</details>

#### ✅ TC-LMT-07 — Cannot delete a predefined category _(desktop)_

- Outcome: **expected** · Duration: 537 ms — `05-limits.spec.ts:106`

<details><summary>Steps</summary>

- Before Hooks _(277 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(237 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(214 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(262 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(259 ms)_
    - Close context _(68 ms)_

</details>

#### ✅ TC-LMT-08 — Limits persist across sessions (read from snapshot) _(desktop)_

- Outcome: **expected** · Duration: 541 ms — `05-limits.spec.ts:119`

<details><summary>Steps</summary>

- Before Hooks _(276 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(37 ms)_
  - Fixture "authenticatedPage" _(235 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(212 ms)_
    - Wait for selector locator('#amount-input') _(14 ms)_
- Navigate to "/#/limits" _(0 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" getByText('Housing', { exact: true }).filter({ visible: true }).first() _(3 ms)_
- Expect "toHaveValue" getByLabel(/Housing percentage/i).filter({ visible: true }).first() _(90 ms)_
- After Hooks _(174 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(172 ms)_
    - Close context _(73 ms)_

</details>

#### ✅ TC-LMT-09 — Category group colour-coding is visually distinct _(desktop)_

- Outcome: **expected** · Duration: 528 ms — `05-limits.spec.ts:128`

<details><summary>Steps</summary>

- Before Hooks _(270 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(229 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(205 ms)_
    - Wait for selector locator('#amount-input') _(14 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" getByText('Needs', { exact: true }).filter({ visible: true }).first() _(89 ms)_
- Expect "toBeVisible" getByText('Wants', { exact: true }).filter({ visible: true }).first() _(3 ms)_
- After Hooks _(168 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(166 ms)_
    - Close context _(69 ms)_

</details>

### 📄 06-finances-accounts.spec.ts

#### ✅ TC-FIN-01 — Create a new bank account _(chromium)_

- Outcome: **expected** · Duration: 782 ms — `06-finances-accounts.spec.ts:14`

<details><summary>Steps</summary>

- Before Hooks _(263 ms)_
  - beforeEach hook _(263 ms)_
    - Fixture "context" _(1 ms)_
      - Create context _(1 ms)_
    - Fixture "page" _(34 ms)_
      - Create page _(34 ms)_
    - Fixture "proUserPage" _(221 ms)_
      - Navigate to "/#/daily" _(5 ms)_
      - Wait for load state "load" _(195 ms)_
      - Wait for selector locator('#amount-input') _(16 ms)_
    - Navigate to "/#/finances" _(1 ms)_
    - Wait for load state "load" _(0 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('button').filter({ hasText: /add.*account|new.*account/i }).first() _(35 ms)_
- Click locator('button').filter({ hasText: /add.*account|new.*account/i }).first() _(316 ms)_
- Fill "HDFC Salary" locator('input[formcontrolname="name"]:visible').first() _(25 ms)_
- Fill "25000" locator('input[type="number"]:visible').first() _(4 ms)_
- Click locator('button[type="submit"]:visible').first() _(19 ms)_
- Expect "toBeVisible" locator('text=HDFC Salary') _(2 ms)_
- After Hooks _(116 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(113 ms)_
    - Close context _(49 ms)_

</details>

#### ✅ TC-FIN-02 — Cannot create account with empty name _(chromium)_

- Outcome: **expected** · Duration: 839 ms — `06-finances-accounts.spec.ts:37`

<details><summary>Steps</summary>

- Before Hooks _(358 ms)_
  - beforeEach hook _(358 ms)_
    - Fixture "context" _(2 ms)_
      - Create context _(2 ms)_
    - Fixture "page" _(36 ms)_
      - Create page _(36 ms)_
    - Fixture "proUserPage" _(316 ms)_
      - Navigate to "/#/daily" _(5 ms)_
      - Wait for load state "load" _(293 ms)_
      - Wait for selector locator('#amount-input') _(12 ms)_
    - Navigate to "/#/finances" _(1 ms)_
    - Wait for load state "load" _(0 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Click locator('button').filter({ hasText: /add.*account|new.*account/i }).first() _(342 ms)_
- Expect "toBeVisible" locator('input[formcontrolname="name"]:visible').first() _(25 ms)_
- Click locator('button[type="submit"]:visible').first() _(16 ms)_
- Expect "toBeVisible" locator('input[formcontrolname="name"]:visible').first() _(1 ms)_
- After Hooks _(99 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(96 ms)_
    - Close context _(48 ms)_

</details>

#### ✅ TC-FIN-03 — Edit account name _(chromium)_

- Outcome: **expected** · Duration: 915 ms — `06-finances-accounts.spec.ts:52`

<details><summary>Steps</summary>

- Before Hooks _(332 ms)_
  - beforeEach hook _(332 ms)_
    - Fixture "context" _(1 ms)_
      - Create context _(1 ms)_
    - Fixture "page" _(39 ms)_
      - Create page _(38 ms)_
    - Fixture "proUserPage" _(287 ms)_
      - Navigate to "/#/daily" _(6 ms)_
      - Wait for load state "load" _(263 ms)_
      - Wait for selector locator('#amount-input') _(13 ms)_
    - Navigate to "/#/finances" _(1 ms)_
    - Wait for load state "load" _(0 ms)_
- Navigate to "/#/finances" _(0 ms)_
- Wait for load state "load" _(0 ms)_
- Click locator('button[aria-label*="edit" i]').first() _(381 ms)_
- Fill "HDFC Main" locator('input[formcontrolname="name"]:visible').first() _(44 ms)_
- Click locator('button[type="submit"]:visible').first() _(24 ms)_
- Expect "toBeVisible" locator('text=HDFC Main') _(11 ms)_
- After Hooks _(124 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(121 ms)_
    - Close context _(61 ms)_

</details>

#### ⏭️ TC-FIN-04 — Only one account can be default at a time _(chromium)_

- Outcome: **skipped** · Duration: 396 ms — `06-finances-accounts.spec.ts:69`
- Annotations: `skip: Cannot find Cash Wallet edit button`

<details><summary>Steps</summary>

- Before Hooks _(306 ms)_
  - beforeEach hook _(306 ms)_
    - Fixture "context" _(2 ms)_
      - Create context _(1 ms)_
    - Fixture "page" _(54 ms)_
      - Create page _(53 ms)_
    - Fixture "proUserPage" _(245 ms)_
      - Navigate to "/#/daily" _(6 ms)_
      - Wait for load state "load" _(213 ms)_
      - Wait for selector locator('#amount-input') _(20 ms)_
    - Navigate to "/#/finances" _(1 ms)_
    - Wait for load state "load" _(0 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(92 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(90 ms)_
    - Close context _(35 ms)_

</details>

#### ⏭️ TC-FIN-05 — Adjust account balance (increase) _(chromium)_

- Outcome: **skipped** · Duration: 708 ms — `06-finances-accounts.spec.ts:89`
- Annotations: `skip: Adjust balance button not found`

<details><summary>Steps</summary>

- Before Hooks _(629 ms)_
  - beforeEach hook _(629 ms)_
    - Fixture "context" _(2 ms)_
      - Create context _(1 ms)_
    - Fixture "page" _(40 ms)_
      - Create page _(38 ms)_
    - Fixture "proUserPage" _(583 ms)_
      - Navigate to "/#/daily" _(5 ms)_
      - Wait for load state "load" _(562 ms)_
      - Wait for selector locator('#amount-input') _(12 ms)_
    - Navigate to "/#/finances" _(1 ms)_
    - Wait for load state "load" _(0 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(77 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(75 ms)_
    - Close context _(34 ms)_

</details>

#### ✅ TC-FIN-08 — Delete an account removes it from list _(chromium)_

- Outcome: **expected** · Duration: 1215 ms — `06-finances-accounts.spec.ts:108`

<details><summary>Steps</summary>

- Before Hooks _(1116 ms)_
  - beforeEach hook _(1116 ms)_
    - Fixture "context" _(2 ms)_
      - Create context _(1 ms)_
    - Fixture "page" _(45 ms)_
      - Create page _(45 ms)_
    - Fixture "proUserPage" _(1064 ms)_
      - Navigate to "/#/daily" _(5 ms)_
      - Wait for load state "load" _(1029 ms)_
      - Wait for selector locator('#amount-input') _(23 ms)_
    - Navigate to "/#/finances" _(1 ms)_
    - Wait for load state "load" _(0 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(98 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(96 ms)_
    - Close context _(33 ms)_

</details>

#### ✅ TC-FIN-09 — Total Assets equals sum of active account balances _(chromium)_

- Outcome: **expected** · Duration: 745 ms — `06-finances-accounts.spec.ts:136`

<details><summary>Steps</summary>

- Before Hooks _(584 ms)_
  - beforeEach hook _(584 ms)_
    - Fixture "context" _(2 ms)_
      - Create context _(1 ms)_
    - Fixture "page" _(41 ms)_
      - Create page _(40 ms)_
    - Fixture "proUserPage" _(537 ms)_
      - Navigate to "/#/daily" _(5 ms)_
      - Wait for load state "load" _(513 ms)_
      - Wait for selector locator('#amount-input') _(12 ms)_
    - Navigate to "/#/finances" _(0 ms)_
    - Wait for load state "load" _(0 ms)_
- Navigate to "/#/finances" _(3 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/27,000|27000|₹27/').first() _(41 ms)_
- After Hooks _(122 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(120 ms)_
    - Close context _(49 ms)_

</details>

#### ✅ TC-FIN-01 — Create a new bank account _(desktop)_

- Outcome: **expected** · Duration: 1103 ms — `06-finances-accounts.spec.ts:14`

<details><summary>Steps</summary>

- Before Hooks _(365 ms)_
  - beforeEach hook _(365 ms)_
    - Fixture "context" _(2 ms)_
      - Create context _(2 ms)_
    - Fixture "page" _(35 ms)_
      - Create page _(34 ms)_
    - Fixture "proUserPage" _(323 ms)_
      - Navigate to "/#/daily" _(4 ms)_
      - Wait for load state "load" _(302 ms)_
      - Wait for selector locator('#amount-input') _(11 ms)_
    - Navigate to "/#/finances" _(2 ms)_
    - Wait for load state "load" _(0 ms)_
- Navigate to "/#/finances" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('button').filter({ hasText: /add.*account|new.*account/i }).first() _(192 ms)_
- Click locator('button').filter({ hasText: /add.*account|new.*account/i }).first() _(277 ms)_
- Fill "HDFC Salary" locator('input[formcontrolname="name"]:visible').first() _(26 ms)_
- Fill "25000" locator('input[type="number"]:visible').first() _(3 ms)_
- Click locator('button[type="submit"]:visible').first() _(59 ms)_
- Expect "toBeVisible" locator('text=HDFC Salary') _(2 ms)_
- After Hooks _(175 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(1 ms)_
  - Fixture "context" _(172 ms)_
    - Close context _(49 ms)_

</details>

#### ✅ TC-FIN-02 — Cannot create account with empty name _(desktop)_

- Outcome: **expected** · Duration: 902 ms — `06-finances-accounts.spec.ts:37`

<details><summary>Steps</summary>

- Before Hooks _(256 ms)_
  - beforeEach hook _(256 ms)_
    - Fixture "context" _(1 ms)_
      - Create context _(1 ms)_
    - Fixture "page" _(36 ms)_
      - Create page _(35 ms)_
    - Fixture "proUserPage" _(212 ms)_
      - Navigate to "/#/daily" _(5 ms)_
      - Wait for load state "load" _(149 ms)_
      - Wait for selector locator('#amount-input') _(55 ms)_
    - Navigate to "/#/finances" _(2 ms)_
    - Wait for load state "load" _(0 ms)_
- Navigate to "/#/finances" _(3 ms)_
- Wait for load state "load" _(0 ms)_
- Click locator('button').filter({ hasText: /add.*account|new.*account/i }).first() _(416 ms)_
- Expect "toBeVisible" locator('input[formcontrolname="name"]:visible').first() _(2 ms)_
- Click locator('button[type="submit"]:visible').first() _(11 ms)_
- Expect "toBeVisible" locator('input[formcontrolname="name"]:visible').first() _(1 ms)_
- After Hooks _(213 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(211 ms)_
    - Close context _(87 ms)_

</details>

#### ✅ TC-FIN-03 — Edit account name _(desktop)_

- Outcome: **expected** · Duration: 1038 ms — `06-finances-accounts.spec.ts:52`

<details><summary>Steps</summary>

- Before Hooks _(321 ms)_
  - beforeEach hook _(321 ms)_
    - Fixture "context" _(1 ms)_
      - Create context _(1 ms)_
    - Fixture "page" _(37 ms)_
      - Create page _(36 ms)_
    - Fixture "proUserPage" _(279 ms)_
      - Navigate to "/#/daily" _(4 ms)_
      - Wait for load state "load" _(257 ms)_
      - Wait for selector locator('#amount-input') _(12 ms)_
    - Navigate to "/#/finances" _(1 ms)_
    - Wait for load state "load" _(0 ms)_
- Navigate to "/#/finances" _(0 ms)_
- Wait for load state "load" _(0 ms)_
- Click locator('button[aria-label*="edit" i]').first() _(455 ms)_
- Fill "HDFC Main" locator('input[formcontrolname="name"]:visible').first() _(26 ms)_
- Click locator('button[type="submit"]:visible').first() _(27 ms)_
- Expect "toBeVisible" locator('text=HDFC Main') _(33 ms)_
- After Hooks _(174 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(171 ms)_
    - Close context _(52 ms)_

</details>

#### ⏭️ TC-FIN-04 — Only one account can be default at a time _(desktop)_

- Outcome: **skipped** · Duration: 545 ms — `06-finances-accounts.spec.ts:69`
- Annotations: `skip: Cannot find Cash Wallet edit button`

<details><summary>Steps</summary>

- Before Hooks _(302 ms)_
  - beforeEach hook _(302 ms)_
    - Fixture "context" _(2 ms)_
      - Create context _(1 ms)_
    - Fixture "page" _(36 ms)_
      - Create page _(35 ms)_
    - Fixture "proUserPage" _(258 ms)_
      - Navigate to "/#/daily" _(5 ms)_
      - Wait for load state "load" _(229 ms)_
      - Wait for selector locator('#amount-input') _(18 ms)_
    - Navigate to "/#/finances" _(1 ms)_
    - Wait for load state "load" _(0 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(246 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(242 ms)_
    - Close context _(70 ms)_

</details>

#### ⏭️ TC-FIN-05 — Adjust account balance (increase) _(desktop)_

- Outcome: **skipped** · Duration: 515 ms — `06-finances-accounts.spec.ts:89`
- Annotations: `skip: Adjust balance button not found`

<details><summary>Steps</summary>

- Before Hooks _(279 ms)_
  - beforeEach hook _(278 ms)_
    - Fixture "context" _(2 ms)_
      - Create context _(1 ms)_
    - Fixture "page" _(38 ms)_
      - Create page _(37 ms)_
    - Fixture "proUserPage" _(234 ms)_
      - Navigate to "/#/daily" _(4 ms)_
      - Wait for load state "load" _(211 ms)_
      - Wait for selector locator('#amount-input') _(14 ms)_
    - Navigate to "/#/finances" _(1 ms)_
    - Wait for load state "load" _(0 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(237 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(236 ms)_
    - Close context _(73 ms)_

</details>

#### ✅ TC-FIN-08 — Delete an account removes it from list _(desktop)_

- Outcome: **expected** · Duration: 704 ms — `06-finances-accounts.spec.ts:108`

<details><summary>Steps</summary>

- Before Hooks _(519 ms)_
  - beforeEach hook _(519 ms)_
    - Fixture "context" _(2 ms)_
      - Create context _(1 ms)_
    - Fixture "page" _(35 ms)_
      - Create page _(34 ms)_
    - Fixture "proUserPage" _(478 ms)_
      - Navigate to "/#/daily" _(5 ms)_
      - Wait for load state "load" _(455 ms)_
      - Wait for selector locator('#amount-input') _(14 ms)_
    - Navigate to "/#/finances" _(1 ms)_
    - Wait for load state "load" _(0 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(186 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(184 ms)_
    - Close context _(70 ms)_

</details>

#### ✅ TC-FIN-09 — Total Assets equals sum of active account balances _(desktop)_

- Outcome: **expected** · Duration: 709 ms — `06-finances-accounts.spec.ts:136`

<details><summary>Steps</summary>

- Before Hooks _(279 ms)_
  - beforeEach hook _(279 ms)_
    - Fixture "context" _(1 ms)_
      - Create context _(1 ms)_
    - Fixture "page" _(37 ms)_
      - Create page _(36 ms)_
    - Fixture "proUserPage" _(236 ms)_
      - Navigate to "/#/daily" _(5 ms)_
      - Wait for load state "load" _(159 ms)_
      - Wait for selector locator('#amount-input') _(66 ms)_
    - Navigate to "/#/finances" _(1 ms)_
    - Wait for load state "load" _(0 ms)_
- Navigate to "/#/finances" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/27,000|27000|₹27/').first() _(203 ms)_
- After Hooks _(229 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(226 ms)_
    - Close context _(67 ms)_

</details>

### 📄 07-finances-debt.spec.ts

#### ✅ TC-DEBT-01 — Create a credit-card debt _(chromium)_

- Outcome: **expected** · Duration: 818 ms — `07-finances-debt.spec.ts:9`

<details><summary>Steps</summary>

- Before Hooks _(269 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
  - Fixture "proUserPage" _(230 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(200 ms)_
    - Wait for selector locator('#amount-input') _(18 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('button').filter({ hasText: /add.*debt|new.*debt/i }).first() _(37 ms)_
- Click locator('button').filter({ hasText: /add.*debt|new.*debt/i }).first() _(326 ms)_
- Fill "Test Credit Card" locator('input[formcontrolname="name"]:visible').first() _(23 ms)_
- Fill "100000" locator('input[type="number"]:visible').first() _(3 ms)_
- Fill "45000" locator('input[type="number"]:visible').nth(1) _(3 ms)_
- Click locator('button[type="submit"]:visible').first() _(21 ms)_
- Expect "toBeVisible" locator('text=Test Credit Card') _(11 ms)_
- After Hooks _(121 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(118 ms)_
    - Close context _(60 ms)_

</details>

#### ⏭️ TC-DEBT-02 — Record a debt payment deducts from account and debt _(chromium)_

- Outcome: **skipped** · Duration: 437 ms — `07-finances-debt.spec.ts:29`
- Annotations: `skip: Debt record payment button not found`

<details><summary>Steps</summary>

- Before Hooks _(307 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(41 ms)_
    - Create page _(41 ms)_
  - Fixture "proUserPage" _(262 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(237 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Navigate to "/#/finances" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(129 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(127 ms)_
    - Close context _(56 ms)_

</details>

#### ✅ TC-DEBT-05 — Debt marks as Paid when balance reaches zero _(chromium)_

- Outcome: **expected** · Duration: 376 ms — `07-finances-debt.spec.ts:49`

<details><summary>Steps</summary>

- Before Hooks _(267 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "proUserPage" _(224 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(200 ms)_
    - Wait for selector locator('#amount-input') _(14 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(110 ms)_
  - Fixture "proUserPage" _(1 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(107 ms)_
    - Close context _(49 ms)_

</details>

#### ✅ TC-DEBT-07 — Payment creates expense with correct source tag _(chromium)_

- Outcome: **expected** · Duration: 356 ms — `07-finances-debt.spec.ts:79`

<details><summary>Steps</summary>

- Before Hooks _(272 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(39 ms)_
  - Fixture "proUserPage" _(228 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(206 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(86 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(83 ms)_
    - Close context _(36 ms)_

</details>

#### ✅ TC-DEBT-09 — Total Liabilities equals sum of active remaining balances _(chromium)_

- Outcome: **expected** · Duration: 465 ms — `07-finances-debt.spec.ts:96`

<details><summary>Steps</summary>

- Before Hooks _(313 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(39 ms)_
  - Fixture "proUserPage" _(271 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(248 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/45,000|₹45/').first() _(45 ms)_
- After Hooks _(110 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(107 ms)_
    - Close context _(50 ms)_

</details>

#### ✅ TC-DEBT-10 — Cannot record payment without a source account _(chromium)_

- Outcome: **expected** · Duration: 432 ms — `07-finances-debt.spec.ts:103`

<details><summary>Steps</summary>

- Before Hooks _(293 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(38 ms)_
  - Fixture "proUserPage" _(251 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(182 ms)_
    - Wait for selector locator('#amount-input') _(57 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(132 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(129 ms)_
    - Close context _(49 ms)_

</details>

#### ✅ TC-DEBT-01 — Create a credit-card debt _(desktop)_

- Outcome: **expected** · Duration: 1244 ms — `07-finances-debt.spec.ts:9`

<details><summary>Steps</summary>

- Before Hooks _(590 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "proUserPage" _(551 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(531 ms)_
    - Wait for selector locator('#amount-input') _(11 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('button').filter({ hasText: /add.*debt|new.*debt/i }).first() _(45 ms)_
- Click locator('button').filter({ hasText: /add.*debt|new.*debt/i }).first() _(343 ms)_
- Fill "Test Credit Card" locator('input[formcontrolname="name"]:visible').first() _(25 ms)_
- Fill "100000" locator('input[type="number"]:visible').first() _(4 ms)_
- Fill "45000" locator('input[type="number"]:visible').nth(1) _(4 ms)_
- Click locator('button[type="submit"]:visible').first() _(20 ms)_
- Expect "toBeVisible" locator('text=Test Credit Card') _(35 ms)_
- After Hooks _(179 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(177 ms)_
    - Close context _(60 ms)_

</details>

#### ⏭️ TC-DEBT-02 — Record a debt payment deducts from account and debt _(desktop)_

- Outcome: **skipped** · Duration: 547 ms — `07-finances-debt.spec.ts:29`
- Annotations: `skip: Debt record payment button not found`

<details><summary>Steps</summary>

- Before Hooks _(342 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "proUserPage" _(304 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(283 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(204 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(202 ms)_
    - Close context _(66 ms)_

</details>

#### ✅ TC-DEBT-05 — Debt marks as Paid when balance reaches zero _(desktop)_

- Outcome: **expected** · Duration: 516 ms — `07-finances-debt.spec.ts:49`

<details><summary>Steps</summary>

- Before Hooks _(279 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(38 ms)_
  - Fixture "proUserPage" _(237 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(214 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(1 ms)_
- After Hooks _(238 ms)_
  - Fixture "proUserPage" _(1 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(235 ms)_
    - Close context _(69 ms)_

</details>

#### ✅ TC-DEBT-07 — Payment creates expense with correct source tag _(desktop)_

- Outcome: **expected** · Duration: 519 ms — `07-finances-debt.spec.ts:79`

<details><summary>Steps</summary>

- Before Hooks _(267 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(34 ms)_
  - Fixture "proUserPage" _(228 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(203 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(253 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(1 ms)_
  - Fixture "context" _(251 ms)_
    - Close context _(76 ms)_

</details>

#### ✅ TC-DEBT-09 — Total Liabilities equals sum of active remaining balances _(desktop)_

- Outcome: **expected** · Duration: 1131 ms — `07-finances-debt.spec.ts:96`

<details><summary>Steps</summary>

- Before Hooks _(940 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(40 ms)_
    - Create page _(40 ms)_
  - Fixture "proUserPage" _(896 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(866 ms)_
    - Wait for selector locator('#amount-input') _(20 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/45,000|₹45/').first() _(55 ms)_
- After Hooks _(137 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(1 ms)_
  - Fixture "context" _(134 ms)_
    - Close context _(45 ms)_

</details>

#### ✅ TC-DEBT-10 — Cannot record payment without a source account _(desktop)_

- Outcome: **expected** · Duration: 490 ms — `07-finances-debt.spec.ts:103`

<details><summary>Steps</summary>

- Before Hooks _(303 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(39 ms)_
  - Fixture "proUserPage" _(260 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(239 ms)_
    - Wait for selector locator('#amount-input') _(11 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(188 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(185 ms)_
    - Close context _(71 ms)_

</details>

### 📄 08-dashboard.spec.ts

#### ✅ TC-DASH-01 — Dashboard stat chips show today/week/avg _(chromium)_

- Outcome: **expected** · Duration: 658 ms — `08-dashboard.spec.ts:9`

<details><summary>Steps</summary>

- Before Hooks _(539 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(500 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(478 ms)_
    - Wait for selector locator('#amount-input') _(11 ms)_
- Navigate to "/#/dashboard" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" getByText(/today/i).filter({ visible: true }).first() _(5 ms)_
- Expect "toBeVisible" getByText(/week/i).filter({ visible: true }).first() _(2 ms)_
- After Hooks _(113 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(111 ms)_
    - Close context _(32 ms)_

</details>

#### ✅ TC-DASH-02 — YTD chart renders with monthly bars _(chromium)_

- Outcome: **expected** · Duration: 678 ms — `08-dashboard.spec.ts:17`

<details><summary>Steps</summary>

- Before Hooks _(548 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(37 ms)_
  - Fixture "authenticatedPage" _(506 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(486 ms)_
    - Wait for selector locator('#amount-input') _(11 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('canvas').first() _(49 ms)_
- After Hooks _(83 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(81 ms)_
    - Close context _(39 ms)_

</details>

#### ✅ TC-DASH-03 — Budget rule 50/30/20 summary is shown _(chromium)_

- Outcome: **expected** · Duration: 389 ms — `08-dashboard.spec.ts:24`

<details><summary>Steps</summary>

- Before Hooks _(255 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(215 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(190 ms)_
    - Wait for selector locator('#amount-input') _(16 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/needs|50/i').first() _(3 ms)_
- Expect "toBeVisible" locator('text=/wants|30/i').first() _(2 ms)_
- Expect "toBeVisible" locator('text=/savings|20/i').first() _(3 ms)_
- After Hooks _(128 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(126 ms)_
    - Close context _(50 ms)_

</details>

#### ✅ TC-DASH-04 — 6-month trend section is visible _(chromium)_

- Outcome: **expected** · Duration: 411 ms — `08-dashboard.spec.ts:32`

<details><summary>Steps</summary>

- Before Hooks _(275 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(235 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(214 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" getByRole('heading', { name: /6 month|last 6/i }).first() _(45 ms)_
- After Hooks _(93 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(91 ms)_
    - Close context _(51 ms)_

</details>

#### ✅ TC-DASH-05 — Net Worth panel shows Assets minus Liabilities _(chromium)_

- Outcome: **expected** · Duration: 453 ms — `08-dashboard.spec.ts:39`

<details><summary>Steps</summary>

- Before Hooks _(248 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
  - Fixture "proUserPage" _(208 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(136 ms)_
    - Wait for selector locator('#amount-input') _(61 ms)_
- Navigate to "/#/dashboard" _(5 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" getByText(/net worth|assets|liabilities/i).filter({ visible: true }).first() _(74 ms)_
- After Hooks _(129 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(1 ms)_
  - Fixture "context" _(126 ms)_
    - Close context _(54 ms)_

</details>

#### ✅ TC-DASH-06 — Activity feed shows recent expense entry _(chromium)_

- Outcome: **expected** · Duration: 818 ms — `08-dashboard.spec.ts:47`

<details><summary>Steps</summary>

- Before Hooks _(583 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(543 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(522 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/daily" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(21 ms)_
- Fill "333" locator('#amount-input') _(5 ms)_
- Click locator('button[type="submit"]') _(39 ms)_
- Navigate to "/#/dashboard" _(6 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/activity|recent|feed/i').first() _(69 ms)_
- After Hooks _(95 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(93 ms)_
    - Close context _(50 ms)_

</details>

#### ✅ TC-DASH-07 — AI Insights section is visible (hosted mode) _(chromium)_

- Outcome: **expected** · Duration: 488 ms — `08-dashboard.spec.ts:62`

<details><summary>Steps</summary>

- Before Hooks _(296 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(254 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(230 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/insight|analysis|summary/i').first() _(74 ms)_
- After Hooks _(121 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(118 ms)_
    - Close context _(54 ms)_

</details>

#### ✅ TC-DASH-08 — AI deep dive button triggers insight fetch _(chromium)_

- Outcome: **expected** · Duration: 461 ms — `08-dashboard.spec.ts:69`

<details><summary>Steps</summary>

- Before Hooks _(293 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(64 ms)_
    - Create page _(64 ms)_
  - Fixture "authenticatedPage" _(225 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(153 ms)_
    - Wait for selector locator('#amount-input') _(62 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/wins|housing|budget/i').first() _(4 ms)_
- After Hooks _(161 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(159 ms)_
    - Close context _(48 ms)_

</details>

#### ✅ TC-DASH-01 — Dashboard stat chips show today/week/avg _(desktop)_

- Outcome: **expected** · Duration: 553 ms — `08-dashboard.spec.ts:9`

<details><summary>Steps</summary>

- Before Hooks _(304 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(263 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(241 ms)_
    - Wait for selector locator('#amount-input') _(11 ms)_
- Navigate to "/#/dashboard" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" getByText(/today/i).filter({ visible: true }).first() _(5 ms)_
- Expect "toBeVisible" getByText(/week/i).filter({ visible: true }).first() _(2 ms)_
- After Hooks _(244 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(242 ms)_
    - Close context _(66 ms)_

</details>

#### ✅ TC-DASH-02 — YTD chart renders with monthly bars _(desktop)_

- Outcome: **expected** · Duration: 518 ms — `08-dashboard.spec.ts:17`

<details><summary>Steps</summary>

- Before Hooks _(253 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(42 ms)_
    - Create page _(42 ms)_
  - Fixture "authenticatedPage" _(207 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(141 ms)_
    - Wait for selector locator('#amount-input') _(55 ms)_
- Navigate to "/#/dashboard" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('canvas').first() _(101 ms)_
- After Hooks _(166 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(164 ms)_
    - Close context _(60 ms)_

</details>

#### ✅ TC-DASH-03 — Budget rule 50/30/20 summary is shown _(desktop)_

- Outcome: **expected** · Duration: 830 ms — `08-dashboard.spec.ts:24`

<details><summary>Steps</summary>

- Before Hooks _(529 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(487 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(462 ms)_
    - Wait for selector locator('#amount-input') _(14 ms)_
- Navigate to "/#/dashboard" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/needs|50/i').first() _(4 ms)_
- Expect "toBeVisible" locator('text=/wants|30/i').first() _(63 ms)_
- Expect "toBeVisible" locator('text=/savings|20/i').first() _(9 ms)_
- After Hooks _(227 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(224 ms)_
    - Close context _(54 ms)_

</details>

#### ✅ TC-DASH-04 — 6-month trend section is visible _(desktop)_

- Outcome: **expected** · Duration: 725 ms — `08-dashboard.spec.ts:32`

<details><summary>Steps</summary>

- Before Hooks _(263 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(223 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(156 ms)_
    - Wait for selector locator('#amount-input') _(57 ms)_
- Navigate to "/#/dashboard" _(3 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" getByRole('heading', { name: /6 month|last 6/i }).first() _(208 ms)_
- After Hooks _(253 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(252 ms)_
    - Close context _(83 ms)_

</details>

#### ✅ TC-DASH-05 — Net Worth panel shows Assets minus Liabilities _(desktop)_

- Outcome: **expected** · Duration: 620 ms — `08-dashboard.spec.ts:39`

<details><summary>Steps</summary>

- Before Hooks _(361 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(37 ms)_
  - Fixture "proUserPage" _(321 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(300 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" getByText(/net worth|assets|liabilities/i).filter({ visible: true }).first() _(93 ms)_
- After Hooks _(168 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(166 ms)_
    - Close context _(74 ms)_

</details>

#### ✅ TC-DASH-06 — Activity feed shows recent expense entry _(desktop)_

- Outcome: **expected** · Duration: 960 ms — `08-dashboard.spec.ts:47`

<details><summary>Steps</summary>

- Before Hooks _(243 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(202 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(138 ms)_
    - Wait for selector locator('#amount-input') _(55 ms)_
- Navigate to "/#/daily" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Click locator('button[aria-label]').filter({ hasText: /food|grocer/i }).first() _(325 ms)_
- Fill "333" locator('#amount-input') _(4 ms)_
- Click locator('button[type="submit"]') _(44 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/activity|recent|feed/i').first() _(107 ms)_
- After Hooks _(235 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(233 ms)_
    - Close context _(59 ms)_

</details>

#### ✅ TC-DASH-07 — AI Insights section is visible (hosted mode) _(desktop)_

- Outcome: **expected** · Duration: 548 ms — `08-dashboard.spec.ts:62`

<details><summary>Steps</summary>

- Before Hooks _(284 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(37 ms)_
  - Fixture "authenticatedPage" _(244 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(216 ms)_
    - Wait for selector locator('#amount-input') _(17 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/insight|analysis|summary/i').first() _(112 ms)_
- After Hooks _(153 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(151 ms)_
    - Close context _(72 ms)_

</details>

#### ✅ TC-DASH-08 — AI deep dive button triggers insight fetch _(desktop)_

- Outcome: **expected** · Duration: 440 ms — `08-dashboard.spec.ts:69`

<details><summary>Steps</summary>

- Before Hooks _(259 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(219 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(152 ms)_
    - Wait for selector locator('#amount-input') _(56 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/wins|housing|budget/i').first() _(3 ms)_
- After Hooks _(172 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(170 ms)_
    - Close context _(47 ms)_

</details>

### 📄 09-ai-features.spec.ts

#### ✅ TC-AI-01 — Default provider is Hosted (no key needed) _(chromium)_

- Outcome: **expected** · Duration: 793 ms — `09-ai-features.spec.ts:10`

<details><summary>Steps</summary>

- Before Hooks _(602 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(564 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(543 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Evaluate _(1 ms)_
- Expect "toBe" _(0 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toHaveAttribute" locator('button[aria-pressed]').filter({ hasText: /hosted/i }).first() _(86 ms)_
- After Hooks _(105 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(103 ms)_
    - Close context _(36 ms)_

</details>

#### ✅ TC-AI-02 — AI mode = Disabled hides AI features _(chromium)_

- Outcome: **expected** · Duration: 573 ms — `09-ai-features.spec.ts:23`

<details><summary>Steps</summary>

- Before Hooks _(284 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(243 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(214 ms)_
    - Wait for selector locator('#amount-input') _(18 ms)_
- Evaluate _(1 ms)_
- Reload _(127 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBe" _(0 ms)_
- Navigate to "/#/dashboard" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/ai.*unavailable|disabled|enable.*ai/i').first() _(56 ms)_
- After Hooks _(90 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(89 ms)_
    - Close context _(45 ms)_

</details>

#### ✅ TC-AI-02b — Legacy provider values migrate on load _(chromium)_

- Outcome: **expected** · Duration: 442 ms — `09-ai-features.spec.ts:42`

<details><summary>Steps</summary>

- Before Hooks _(288 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(48 ms)_
    - Create page _(48 ms)_
  - Fixture "authenticatedPage" _(236 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(214 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Evaluate _(2 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(150 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(148 ms)_
    - Close context _(57 ms)_

</details>

#### ✅ TC-AI-08 — Daily AI insight cap is enforced (shows limit reached) _(chromium)_

- Outcome: **expected** · Duration: 417 ms — `09-ai-features.spec.ts:55`

<details><summary>Steps</summary>

- Before Hooks _(292 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(251 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(226 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Evaluate _(3 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(121 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(119 ms)_
    - Close context _(54 ms)_

</details>

#### ✅ TC-AI-09 — BYOK mode without key shows "API Key Required" _(chromium)_

- Outcome: **expected** · Duration: 376 ms — `09-ai-features.spec.ts:71`

<details><summary>Steps</summary>

- Before Hooks _(267 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(225 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(196 ms)_
    - Wait for selector locator('#amount-input') _(18 ms)_
- Evaluate _(0 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(109 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(107 ms)_
    - Close context _(51 ms)_

</details>

#### ✅ TC-AI-11 — Local fallback when AI endpoint is unreachable _(chromium)_

- Outcome: **expected** · Duration: 428 ms — `09-ai-features.spec.ts:87`

<details><summary>Steps</summary>

- Before Hooks _(267 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(226 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(197 ms)_
    - Wait for selector locator('#amount-input') _(18 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(1 ms)_
- Expect "toBeVisible" locator('text=/insight|summary|wins|this.*month/i').first() _(55 ms)_
- After Hooks _(106 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(103 ms)_
    - Close context _(47 ms)_

</details>

#### ✅ TC-AI-01 — Default provider is Hosted (no key needed) _(desktop)_

- Outcome: **expected** · Duration: 872 ms — `09-ai-features.spec.ts:10`

<details><summary>Steps</summary>

- Before Hooks _(570 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(531 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(508 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Evaluate _(1 ms)_
- Expect "toBe" _(0 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toHaveAttribute" locator('button[aria-pressed]').filter({ hasText: /hosted/i }).first() _(44 ms)_
- After Hooks _(258 ms)_
  - Fixture "authenticatedPage" _(1 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(255 ms)_
    - Close context _(61 ms)_

</details>

#### ✅ TC-AI-02 — AI mode = Disabled hides AI features _(desktop)_

- Outcome: **expected** · Duration: 658 ms — `09-ai-features.spec.ts:23`

<details><summary>Steps</summary>

- Before Hooks _(275 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(236 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(208 ms)_
    - Wait for selector locator('#amount-input') _(19 ms)_
- Evaluate _(0 ms)_
- Reload _(110 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBe" _(0 ms)_
- Navigate to "/#/dashboard" _(5 ms)_
- Wait for load state "load" _(1 ms)_
- Expect "toBeVisible" locator('text=/ai.*unavailable|disabled|enable.*ai/i').first() _(99 ms)_
- After Hooks _(147 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(144 ms)_
    - Close context _(57 ms)_

</details>

#### ✅ TC-AI-02b — Legacy provider values migrate on load _(desktop)_

- Outcome: **expected** · Duration: 558 ms — `09-ai-features.spec.ts:42`

<details><summary>Steps</summary>

- Before Hooks _(309 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(40 ms)_
    - Create page _(40 ms)_
  - Fixture "authenticatedPage" _(264 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(242 ms)_
    - Wait for selector locator('#amount-input') _(11 ms)_
- Evaluate _(0 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(247 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(243 ms)_
    - Close context _(69 ms)_

</details>

#### ✅ TC-AI-08 — Daily AI insight cap is enforced (shows limit reached) _(desktop)_

- Outcome: **expected** · Duration: 518 ms — `09-ai-features.spec.ts:55`

<details><summary>Steps</summary>

- Before Hooks _(286 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(37 ms)_
  - Fixture "authenticatedPage" _(245 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(221 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Evaluate _(0 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(230 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(229 ms)_
    - Close context _(65 ms)_

</details>

#### ✅ TC-AI-09 — BYOK mode without key shows "API Key Required" _(desktop)_

- Outcome: **expected** · Duration: 525 ms — `09-ai-features.spec.ts:71`

<details><summary>Steps</summary>

- Before Hooks _(259 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(216 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(151 ms)_
    - Wait for selector locator('#amount-input') _(54 ms)_
- Evaluate _(11 ms)_
- Navigate to "/#/dashboard" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(256 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(254 ms)_
    - Close context _(64 ms)_

</details>

#### ✅ TC-AI-11 — Local fallback when AI endpoint is unreachable _(desktop)_

- Outcome: **expected** · Duration: 506 ms — `09-ai-features.spec.ts:87`

<details><summary>Steps</summary>

- Before Hooks _(257 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(34 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(218 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(153 ms)_
    - Wait for selector locator('#amount-input') _(57 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(4 ms)_
- Expect "toBeVisible" locator('text=/insight|summary|wins|this.*month/i').first() _(71 ms)_
- After Hooks _(174 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(172 ms)_
    - Close context _(69 ms)_

</details>

### 📄 10-settings.spec.ts

#### ✅ TC-SET-01 — Switch to Dark mode persists preference _(chromium)_

- Outcome: **expected** · Duration: 473 ms — `10-settings.spec.ts:10`

<details><summary>Steps</summary>

- Before Hooks _(337 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(297 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(274 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(134 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(133 ms)_
    - Close context _(40 ms)_

</details>

#### ⏭️ TC-SET-02 — Change language to Tamil _(chromium)_

- Outcome: **skipped** · Duration: 398 ms — `10-settings.spec.ts:31`
- Annotations: `skip: Tamil language option not found in settings`

<details><summary>Steps</summary>

- Before Hooks _(255 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(216 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(189 ms)_
    - Wait for selector locator('#amount-input') _(17 ms)_
- Navigate to "/#/settings" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(143 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(141 ms)_
    - Close context _(53 ms)_

</details>

#### ⏭️ TC-SET-03 — Change currency to USD updates display _(chromium)_

- Outcome: **skipped** · Duration: 395 ms — `10-settings.spec.ts:45`
- Annotations: `skip: USD option not found in settings`

<details><summary>Steps</summary>

- Before Hooks _(260 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(218 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(193 ms)_
    - Wait for selector locator('#amount-input') _(16 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(135 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(132 ms)_
    - Close context _(49 ms)_

</details>

#### ✅ TC-SET-06 — Export backup JSON downloads a file _(chromium)_

- Outcome: **expected** · Duration: 792 ms — `10-settings.spec.ts:60`

<details><summary>Steps</summary>

- Before Hooks _(271 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(37 ms)_
  - Fixture "authenticatedPage" _(231 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(209 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Wait for event "download" _(402 ms)_
- Click locator('button').filter({ hasText: /export.*backup|download.*backup|export.*json/i }).first() _(402 ms)_
- Expect "toMatch" _(0 ms)_
- After Hooks _(120 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(118 ms)_
    - Close context _(60 ms)_

</details>

#### ⏭️ TC-SET-09 — PWA install prompt button appears when supported _(chromium)_

- Outcome: **skipped** · Duration: 0 ms — `10-settings.spec.ts:79`
- Annotations: `skip`

#### ⏭️ TC-SET-11 — AI API key is masked in UI (BYOK mode) _(chromium)_

- Outcome: **skipped** · Duration: 430 ms — `10-settings.spec.ts:91`
- Annotations: `skip: BYOK mode option not found`

<details><summary>Steps</summary>

- Before Hooks _(280 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(39 ms)_
  - Fixture "authenticatedPage" _(238 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(217 ms)_
    - Wait for selector locator('#amount-input') _(11 ms)_
- Navigate to "/#/settings" _(2 ms)_
- Wait for load state "load" _(1 ms)_
- After Hooks _(148 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(146 ms)_
    - Close context _(55 ms)_

</details>

#### ⏭️ TC-SET-12 — Clear all data wipes storage and redirects to onboarding _(chromium)_

- Outcome: **skipped** · Duration: 898 ms — `10-settings.spec.ts:115`
- Annotations: `skip: Clear all data button not found`

<details><summary>Steps</summary>

- Before Hooks _(741 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(41 ms)_
    - Create page _(41 ms)_
  - Fixture "authenticatedPage" _(697 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(672 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(157 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(155 ms)_
    - Close context _(43 ms)_

</details>

#### ✅ TC-SET-13 — AI provider card shows three options _(chromium)_

- Outcome: **expected** · Duration: 744 ms — `10-settings.spec.ts:136`

<details><summary>Steps</summary>

- Before Hooks _(526 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(54 ms)_
    - Create page _(53 ms)_
  - Fixture "authenticatedPage" _(469 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(444 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(1 ms)_
- Expect "toHaveCount" locator('button[aria-pressed]').filter({ hasText: /hosted/i }) _(30 ms)_
- Expect "toHaveCount" locator('button[aria-pressed]').filter({ hasText: /my key/i }) _(51 ms)_
- Expect "toHaveCount" locator('button[aria-pressed]').filter({ hasText: /off|disabled/i }) _(5 ms)_
- After Hooks _(134 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(132 ms)_
    - Close context _(56 ms)_

</details>

#### ✅ TC-SET-01 — Switch to Dark mode persists preference _(desktop)_

- Outcome: **expected** · Duration: 472 ms — `10-settings.spec.ts:10`

<details><summary>Steps</summary>

- Before Hooks _(258 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(3 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(217 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(151 ms)_
    - Wait for selector locator('#amount-input') _(56 ms)_
- Navigate to "/#/settings" _(3 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(206 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(204 ms)_
    - Close context _(46 ms)_

</details>

#### ⏭️ TC-SET-02 — Change language to Tamil _(desktop)_

- Outcome: **skipped** · Duration: 543 ms — `10-settings.spec.ts:31`
- Annotations: `skip: Tamil language option not found in settings`

<details><summary>Steps</summary>

- Before Hooks _(296 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(257 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(236 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(247 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(245 ms)_
    - Close context _(75 ms)_

</details>

#### ⏭️ TC-SET-03 — Change currency to USD updates display _(desktop)_

- Outcome: **skipped** · Duration: 513 ms — `10-settings.spec.ts:45`
- Annotations: `skip: USD option not found in settings`

<details><summary>Steps</summary>

- Before Hooks _(278 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(239 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(210 ms)_
    - Wait for selector locator('#amount-input') _(19 ms)_
- Navigate to "/#/settings" _(0 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(235 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(1 ms)_
  - Fixture "context" _(232 ms)_
    - Close context _(67 ms)_

</details>

#### ✅ TC-SET-06 — Export backup JSON downloads a file _(desktop)_

- Outcome: **expected** · Duration: 874 ms — `10-settings.spec.ts:60`

<details><summary>Steps</summary>

- Before Hooks _(286 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(247 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(225 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Wait for event "download" _(405 ms)_
- Click locator('button').filter({ hasText: /export.*backup|download.*backup|export.*json/i }).first() _(406 ms)_
- Expect "toMatch" _(0 ms)_
- After Hooks _(183 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(182 ms)_
    - Close context _(69 ms)_

</details>

#### ⏭️ TC-SET-09 — PWA install prompt button appears when supported _(desktop)_

- Outcome: **skipped** · Duration: 0 ms — `10-settings.spec.ts:79`
- Annotations: `skip`

#### ⏭️ TC-SET-11 — AI API key is masked in UI (BYOK mode) _(desktop)_

- Outcome: **skipped** · Duration: 523 ms — `10-settings.spec.ts:91`
- Annotations: `skip: BYOK mode option not found`

<details><summary>Steps</summary>

- Before Hooks _(290 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(248 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(222 ms)_
    - Wait for selector locator('#amount-input') _(16 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(234 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(231 ms)_
    - Close context _(62 ms)_

</details>

#### ⏭️ TC-SET-12 — Clear all data wipes storage and redirects to onboarding _(desktop)_

- Outcome: **skipped** · Duration: 528 ms — `10-settings.spec.ts:115`
- Annotations: `skip: Clear all data button not found`

<details><summary>Steps</summary>

- Before Hooks _(290 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(56 ms)_
    - Create page _(55 ms)_
  - Fixture "authenticatedPage" _(230 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(205 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(1 ms)_
- After Hooks _(240 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(238 ms)_
    - Close context _(69 ms)_

</details>

#### ✅ TC-SET-13 — AI provider card shows three options _(desktop)_

- Outcome: **expected** · Duration: 775 ms — `10-settings.spec.ts:136`

<details><summary>Steps</summary>

- Before Hooks _(411 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(372 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(351 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toHaveCount" locator('button[aria-pressed]').filter({ hasText: /hosted/i }) _(105 ms)_
- Expect "toHaveCount" locator('button[aria-pressed]').filter({ hasText: /my key/i }) _(2 ms)_
- Expect "toHaveCount" locator('button[aria-pressed]').filter({ hasText: /off|disabled/i }) _(5 ms)_
- After Hooks _(253 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(252 ms)_
    - Close context _(65 ms)_

</details>

### 📄 11-subscription.spec.ts

#### ✅ TC-SUB-01 — Non-Pro user cannot access /finances (subscription guard) _(chromium)_

- Outcome: **expected** · Duration: 694 ms — `11-subscription.spec.ts:9`

<details><summary>Steps</summary>

- Before Hooks _(515 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(476 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(449 ms)_
    - Wait for selector locator('#amount-input') _(17 ms)_
- Navigate to "/#/finances" _(2 ms)_
- Expect "not toHaveURL" _(35 ms)_
- Expect "toHaveURL" _(1 ms)_
- After Hooks _(144 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(141 ms)_
    - Close context _(86 ms)_

</details>

#### ✅ TC-SUB-03 — Pro status shown in settings after payment _(chromium)_

- Outcome: **expected** · Duration: 478 ms — `11-subscription.spec.ts:18`

<details><summary>Steps</summary>

- Before Hooks _(284 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(37 ms)_
  - Fixture "proUserPage" _(243 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(212 ms)_
    - Wait for selector locator('#amount-input') _(18 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/pro.*active|spenza.*pro|active.*pro/i').first() _(84 ms)_
- After Hooks _(112 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(110 ms)_
    - Close context _(45 ms)_

</details>

#### ✅ TC-SUB-05 — Expired Pro gates finances again _(chromium)_

- Outcome: **expected** · Duration: 743 ms — `11-subscription.spec.ts:24`

<details><summary>Steps</summary>

- Before Hooks _(585 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(543 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(521 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Expect "not toHaveURL" _(36 ms)_
- After Hooks _(124 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(122 ms)_
    - Close context _(43 ms)_

</details>

#### ⏭️ TC-SUB-06 — Subscribe page is not accessible on native (webOnlyGuard) _(chromium)_

- Outcome: **skipped** · Duration: 0 ms — `11-subscription.spec.ts:45`
- Annotations: `skip`

<details><summary>Steps</summary>

- After Hooks _(0 ms)_

</details>

#### ✅ TC-SUB-01 — Non-Pro user cannot access /finances (subscription guard) _(desktop)_

- Outcome: **expected** · Duration: 502 ms — `11-subscription.spec.ts:9`

<details><summary>Steps</summary>

- Before Hooks _(245 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(207 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(138 ms)_
    - Wait for selector locator('#amount-input') _(60 ms)_
- Navigate to "/#/finances" _(3 ms)_
- Expect "not toHaveURL" _(97 ms)_
- Expect "toHaveURL" _(1 ms)_
- After Hooks _(161 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(159 ms)_
    - Close context _(63 ms)_

</details>

#### ✅ TC-SUB-03 — Pro status shown in settings after payment _(desktop)_

- Outcome: **expected** · Duration: 851 ms — `11-subscription.spec.ts:18`

<details><summary>Steps</summary>

- Before Hooks _(588 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "proUserPage" _(550 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(529 ms)_
    - Wait for selector locator('#amount-input') _(11 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/pro.*active|spenza.*pro|active.*pro/i').first() _(92 ms)_
- After Hooks _(173 ms)_
  - Fixture "proUserPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(171 ms)_
    - Close context _(65 ms)_

</details>

#### ✅ TC-SUB-05 — Expired Pro gates finances again _(desktop)_

- Outcome: **expected** · Duration: 523 ms — `11-subscription.spec.ts:24`

<details><summary>Steps</summary>

- Before Hooks _(271 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(232 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(207 ms)_
    - Wait for selector locator('#amount-input') _(16 ms)_
- Navigate to "/#/finances" _(0 ms)_
- Expect "not toHaveURL" _(87 ms)_
- After Hooks _(167 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(164 ms)_
    - Close context _(74 ms)_

</details>

#### ⏭️ TC-SUB-06 — Subscribe page is not accessible on native (webOnlyGuard) _(desktop)_

- Outcome: **skipped** · Duration: 0 ms — `11-subscription.spec.ts:45`
- Annotations: `skip`

<details><summary>Steps</summary>

- After Hooks _(0 ms)_

</details>

### 📄 12-offline-pwa.spec.ts

#### ⏭️ TC-PWA-01 — App shell renders offline from snapshot cache _(chromium)_

- Outcome: **skipped** · Duration: 0 ms — `12-offline-pwa.spec.ts:14`
- Annotations: `skip`

#### ✅ TC-PWA-02 — Offline banner appears then disappears on reconnect _(chromium)_

- Outcome: **expected** · Duration: 400 ms — `12-offline-pwa.spec.ts:23`

<details><summary>Steps</summary>

- Before Hooks _(262 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(34 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(223 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(196 ms)_
    - Wait for selector locator('#amount-input') _(18 ms)_
- Set offline mode _(1 ms)_
- Evaluate _(1 ms)_
- Expect "toBeVisible" getByText(/you are offline/i) _(4 ms)_
- Set offline mode _(0 ms)_
- Evaluate _(0 ms)_
- Expect "toBeHidden" getByText(/you are offline/i) _(2 ms)_
- After Hooks _(132 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(130 ms)_
    - Close context _(53 ms)_

</details>

#### ✅ TC-PWA-03 — Expenses logged offline are visible immediately _(chromium)_

- Outcome: **expected** · Duration: 773 ms — `12-offline-pwa.spec.ts:32`

<details><summary>Steps</summary>

- Before Hooks _(269 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(37 ms)_
  - Fixture "authenticatedPage" _(228 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(200 ms)_
    - Wait for selector locator('#amount-input') _(16 ms)_
- Click locator('button').filter({ hasText: /utilit/i }).first() _(337 ms)_
- Set offline mode _(0 ms)_
- Evaluate _(1 ms)_
- Fill "777" locator('#amount-input') _(9 ms)_
- Click locator('button[type="submit"]') _(44 ms)_
- Expect "toBeVisible" locator('text=777').or(locator('text=₹777')).first() _(7 ms)_
- Set offline mode _(12 ms)_
- Evaluate _(0 ms)_
- After Hooks _(94 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(92 ms)_
    - Close context _(36 ms)_

</details>

#### ✅ TC-PWA-06 — Web manifest contains required fields _(chromium)_

- Outcome: **expected** · Duration: 100 ms — `12-offline-pwa.spec.ts:47`

<details><summary>Steps</summary>

- Before Hooks _(40 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(37 ms)_
- GET "/manifest.webmanifest" _(14 ms)_
- Expect "toBe" _(0 ms)_
- Expect "toBeTruthy" _(0 ms)_
- Expect "toBeTruthy" _(0 ms)_
- Expect "toBe" _(0 ms)_
- Expect "toBeGreaterThan" _(0 ms)_
- Expect "toBeTruthy" _(0 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(47 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(45 ms)_
    - Close context _(31 ms)_

</details>

#### ⏭️ TC-PWA-01 — App shell renders offline from snapshot cache _(desktop)_

- Outcome: **skipped** · Duration: 0 ms — `12-offline-pwa.spec.ts:14`
- Annotations: `skip`

#### ✅ TC-PWA-02 — Offline banner appears then disappears on reconnect _(desktop)_

- Outcome: **expected** · Duration: 723 ms — `12-offline-pwa.spec.ts:23`

<details><summary>Steps</summary>

- Before Hooks _(534 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(33 ms)_
    - Create page _(33 ms)_
  - Fixture "authenticatedPage" _(497 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(476 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Set offline mode _(0 ms)_
- Evaluate _(1 ms)_
- Expect "toBeVisible" getByText(/you are offline/i) _(3 ms)_
- Set offline mode _(1 ms)_
- Evaluate _(1 ms)_
- Expect "toBeHidden" getByText(/you are offline/i) _(2 ms)_
- After Hooks _(184 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(183 ms)_
    - Close context _(63 ms)_

</details>

#### ✅ TC-PWA-03 — Expenses logged offline are visible immediately _(desktop)_

- Outcome: **expected** · Duration: 809 ms — `12-offline-pwa.spec.ts:32`

<details><summary>Steps</summary>

- Before Hooks _(242 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(34 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(204 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(145 ms)_
    - Wait for selector locator('#amount-input') _(51 ms)_
- Click locator('button').filter({ hasText: /utilit/i }).first() _(315 ms)_
- Set offline mode _(0 ms)_
- Evaluate _(1 ms)_
- Fill "777" locator('#amount-input') _(5 ms)_
- Click locator('button[type="submit"]') _(28 ms)_
- Expect "toBeVisible" locator('text=777').or(locator('text=₹777')).first() _(39 ms)_
- Set offline mode _(0 ms)_
- Evaluate _(0 ms)_
- After Hooks _(182 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(177 ms)_
    - Close context _(57 ms)_

</details>

#### ✅ TC-PWA-06 — Web manifest contains required fields _(desktop)_

- Outcome: **expected** · Duration: 136 ms — `12-offline-pwa.spec.ts:47`

<details><summary>Steps</summary>

- Before Hooks _(41 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
- GET "/manifest.webmanifest" _(18 ms)_
- Expect "toBe" _(0 ms)_
- Expect "toBeTruthy" _(0 ms)_
- Expect "toBeTruthy" _(0 ms)_
- Expect "toBe" _(0 ms)_
- Expect "toBeGreaterThan" _(0 ms)_
- Expect "toBeTruthy" _(0 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(79 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(77 ms)_
    - Close context _(50 ms)_

</details>

### 📄 13-route-guards.spec.ts

#### ✅ TC-GUARD-01 — authGuard blocks all protected routes when unauthenticated _(chromium)_

- Outcome: **expected** · Duration: 498 ms — `13-route-guards.spec.ts:10`

<details><summary>Steps</summary>

- Before Hooks _(39 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
- Navigate to "/#/daily" _(171 ms)_
- Expect "toHaveURL" _(33 ms)_
- Navigate to "/#/monthly" _(1 ms)_
- Expect "toHaveURL" _(11 ms)_
- Navigate to "/#/limits" _(0 ms)_
- Expect "toHaveURL" _(28 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Expect "toHaveURL" _(27 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Expect "toHaveURL" _(29 ms)_
- Navigate to "/#/privacy" _(2 ms)_
- Expect "toHaveURL" _(1 ms)_
- Navigate to "/#/terms" _(1 ms)_
- Expect "toHaveURL" _(1 ms)_
- After Hooks _(147 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(143 ms)_
    - Close context _(58 ms)_

</details>

#### ✅ TC-GUARD-02 — setupGuard redirects to mode-select when no mode configured _(chromium)_

- Outcome: **expected** · Duration: 1037 ms — `13-route-guards.spec.ts:24`

<details><summary>Steps</summary>

- Before Hooks _(45 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(40 ms)_
    - Create page _(39 ms)_
- Navigate to "/#/daily" _(875 ms)_
- Expect "toHaveURL" _(13 ms)_
- After Hooks _(103 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(100 ms)_
    - Close context _(43 ms)_

</details>

#### ✅ TC-GUARD-03 — setupGuard redirects to income setup when income = 0 _(chromium)_

- Outcome: **expected** · Duration: 405 ms — `13-route-guards.spec.ts:32`

<details><summary>Steps</summary>

- Before Hooks _(260 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "noIncomePage" _(220 ms)_
    - Navigate to "/#/daily" _(215 ms)_
- Expect "toHaveURL" _(13 ms)_
- After Hooks _(136 ms)_
  - Fixture "noIncomePage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(134 ms)_
    - Close context _(61 ms)_

</details>

#### ✅ TC-GUARD-04 — subscriptionGuard blocks /finances for non-Pro _(chromium)_

- Outcome: **expected** · Duration: 394 ms — `13-route-guards.spec.ts:36`

<details><summary>Steps</summary>

- Before Hooks _(259 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(219 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(193 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Navigate to "/#/finances" _(1 ms)_
- Expect "not toHaveURL" _(35 ms)_
- After Hooks _(103 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(101 ms)_
    - Close context _(54 ms)_

</details>

#### ✅ TC-GUARD-05 — Setup-complete user is redirected away from /mode-select _(chromium)_

- Outcome: **expected** · Duration: 406 ms — `13-route-guards.spec.ts:42`

<details><summary>Steps</summary>

- Before Hooks _(276 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(235 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(212 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Navigate to "/#/mode-select" _(1 ms)_
- Expect "not toHaveURL" _(31 ms)_
- Expect "toHaveURL" _(0 ms)_
- After Hooks _(101 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(99 ms)_
    - Close context _(54 ms)_

</details>

#### ✅ TC-GUARD-06 — Bottom nav is hidden on /mode-select and /family-setup _(chromium)_

- Outcome: **expected** · Duration: 383 ms — `13-route-guards.spec.ts:49`

<details><summary>Steps</summary>

- Before Hooks _(39 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
- Navigate to "/#/mode-select" _(211 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(118 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(116 ms)_
    - Close context _(57 ms)_

</details>

#### ✅ TC-GUARD-01 — authGuard blocks all protected routes when unauthenticated _(desktop)_

- Outcome: **expected** · Duration: 706 ms — `13-route-guards.spec.ts:10`

<details><summary>Steps</summary>

- Before Hooks _(39 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
- Navigate to "/#/daily" _(203 ms)_
- Expect "toHaveURL" _(13 ms)_
- Navigate to "/#/monthly" _(1 ms)_
- Expect "toHaveURL" _(88 ms)_
- Navigate to "/#/limits" _(1 ms)_
- Expect "toHaveURL" _(29 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Expect "toHaveURL" _(28 ms)_
- Navigate to "/#/dashboard" _(1 ms)_
- Expect "toHaveURL" _(27 ms)_
- Navigate to "/#/privacy" _(2 ms)_
- Expect "toHaveURL" _(1 ms)_
- Navigate to "/#/terms" _(1 ms)_
- Expect "toHaveURL" _(1 ms)_
- After Hooks _(264 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(262 ms)_
    - Close context _(75 ms)_

</details>

#### ✅ TC-GUARD-02 — setupGuard redirects to mode-select when no mode configured _(desktop)_

- Outcome: **expected** · Duration: 451 ms — `13-route-guards.spec.ts:24`

<details><summary>Steps</summary>

- Before Hooks _(38 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(34 ms)_
- Navigate to "/#/daily" _(147 ms)_
- Expect "toHaveURL" _(14 ms)_
- After Hooks _(249 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(246 ms)_
    - Close context _(55 ms)_

</details>

#### ✅ TC-GUARD-03 — setupGuard redirects to income setup when income = 0 _(desktop)_

- Outcome: **expected** · Duration: 494 ms — `13-route-guards.spec.ts:32`

<details><summary>Steps</summary>

- Before Hooks _(253 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(34 ms)_
    - Create page _(34 ms)_
  - Fixture "noIncomePage" _(216 ms)_
    - Navigate to "/#/daily" _(212 ms)_
- Expect "toHaveURL" _(12 ms)_
- After Hooks _(231 ms)_
  - Fixture "noIncomePage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(229 ms)_
    - Close context _(71 ms)_

</details>

#### ✅ TC-GUARD-04 — subscriptionGuard blocks /finances for non-Pro _(desktop)_

- Outcome: **expected** · Duration: 714 ms — `13-route-guards.spec.ts:36`

<details><summary>Steps</summary>

- Before Hooks _(248 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(34 ms)_
  - Fixture "authenticatedPage" _(210 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(148 ms)_
    - Wait for selector locator('#amount-input') _(52 ms)_
- Navigate to "/#/finances" _(2 ms)_
- Expect "not toHaveURL" _(200 ms)_
- After Hooks _(267 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(265 ms)_
    - Close context _(71 ms)_

</details>

#### ✅ TC-GUARD-05 — Setup-complete user is redirected away from /mode-select _(desktop)_

- Outcome: **expected** · Duration: 519 ms — `13-route-guards.spec.ts:42`

<details><summary>Steps</summary>

- Before Hooks _(270 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(231 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(205 ms)_
    - Wait for selector locator('#amount-input') _(17 ms)_
- Navigate to "/#/mode-select" _(1 ms)_
- Expect "not toHaveURL" _(87 ms)_
- Expect "toHaveURL" _(1 ms)_
- After Hooks _(164 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(160 ms)_
    - Close context _(76 ms)_

</details>

#### ✅ TC-GUARD-06 — Bottom nav is hidden on /mode-select and /family-setup _(desktop)_

- Outcome: **expected** · Duration: 687 ms — `13-route-guards.spec.ts:49`

<details><summary>Steps</summary>

- Before Hooks _(38 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
- Navigate to "/#/mode-select" _(407 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(227 ms)_
  - Fixture "page" _(1 ms)_
  - Fixture "context" _(224 ms)_
    - Close context _(58 ms)_

</details>

### 📄 14-reminders.spec.ts

#### ✅ TC-REM-01 — Reminders list renders with add affordance _(chromium)_

- Outcome: **expected** · Duration: 511 ms — `14-reminders.spec.ts:9`

<details><summary>Steps</summary>

- Before Hooks _(311 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(271 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(250 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Navigate to "/#/reminders" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/no.*reminder|add.*reminder|empty/i').or(locator('[data-testid="reminder-list"], [class*="reminder-list"]')).first() _(39 ms)_
- Expect "toBeVisible" locator('button, a').filter({ hasText: /add.*reminder|new.*reminder|\+/i }).first() _(5 ms)_
- After Hooks _(158 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(156 ms)_
    - Close context _(59 ms)_

</details>

#### ✅ TC-REM-02 — Create a date/time reminder saves to Firestore _(chromium)_

- Outcome: **expected** · Duration: 750 ms — `14-reminders.spec.ts:33`

<details><summary>Steps</summary>

- Before Hooks _(284 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(244 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(221 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/reminders/new" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Fill "Pay electricity bill" locator('input[formcontrolname="title"]').first() _(28 ms)_
- Fill "2026-06-29T11:01" locator('input[type="datetime-local"]').first() _(3 ms)_
- Click locator('button[type="submit"]').first() _(300 ms)_
- Expect "toHaveURL" _(2 ms)_
- After Hooks _(132 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(131 ms)_
    - Close context _(47 ms)_

</details>

#### ✅ TC-REM-06 — Location reminder type is Pro-gated for free users _(chromium)_

- Outcome: **expected** · Duration: 417 ms — `14-reminders.spec.ts:62`

<details><summary>Steps</summary>

- Before Hooks _(259 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(37 ms)_
  - Fixture "authenticatedPage" _(218 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(188 ms)_
    - Wait for selector locator('#amount-input') _(18 ms)_
- Navigate to "/#/reminders/new" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('button').filter({ hasText: /location|geofence/i }).first() _(35 ms)_
- Expect "toBeDisabled" locator('button').filter({ hasText: /location|geofence/i }).first() _(2 ms)_
- After Hooks _(123 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(121 ms)_
    - Close context _(57 ms)_

</details>

#### ⏭️ TC-REM-11 — Delete reminder removes it from list _(chromium)_

- Outcome: **skipped** · Duration: 449 ms — `14-reminders.spec.ts:72`
- Annotations: `skip: No reminder row to delete (Firestore SDK listener not seeded in e2e)`

<details><summary>Steps</summary>

- Before Hooks _(287 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(37 ms)_
  - Fixture "authenticatedPage" _(246 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(224 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Navigate to "/#/reminders" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" getByRole('heading', { name: /reminders/i }) _(36 ms)_
- After Hooks _(123 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(121 ms)_
    - Close context _(61 ms)_

</details>

#### ✅ TC-REM-01 — Reminders list renders with add affordance _(desktop)_

- Outcome: **expected** · Duration: 709 ms — `14-reminders.spec.ts:9`

<details><summary>Steps</summary>

- Before Hooks _(241 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(202 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(139 ms)_
    - Wait for selector locator('#amount-input') _(52 ms)_
- Navigate to "/#/reminders" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('text=/no.*reminder|add.*reminder|empty/i').or(locator('[data-testid="reminder-list"], [class*="reminder-list"]')).first() _(205 ms)_
- Expect "toBeVisible" locator('button, a').filter({ hasText: /add.*reminder|new.*reminder|\+/i }).first() _(3 ms)_
- After Hooks _(260 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(258 ms)_
    - Close context _(62 ms)_

</details>

#### ✅ TC-REM-02 — Create a date/time reminder saves to Firestore _(desktop)_

- Outcome: **expected** · Duration: 1043 ms — `14-reminders.spec.ts:33`

<details><summary>Steps</summary>

- Before Hooks _(476 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(37 ms)_
  - Fixture "authenticatedPage" _(436 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(415 ms)_
    - Wait for selector locator('#amount-input') _(11 ms)_
- Navigate to "/#/reminders/new" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Fill "Pay electricity bill" locator('input[formcontrolname="title"]').first() _(81 ms)_
- Fill "2026-06-29T11:03" locator('input[type="datetime-local"]').first() _(3 ms)_
- Click locator('button[type="submit"]').first() _(270 ms)_
- Expect "toHaveURL" _(1 ms)_
- After Hooks _(211 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(209 ms)_
    - Close context _(51 ms)_

</details>

#### ✅ TC-REM-06 — Location reminder type is Pro-gated for free users _(desktop)_

- Outcome: **expected** · Duration: 561 ms — `14-reminders.spec.ts:62`

<details><summary>Steps</summary>

- Before Hooks _(272 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(233 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(208 ms)_
    - Wait for selector locator('#amount-input') _(16 ms)_
- Navigate to "/#/reminders/new" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "toBeVisible" locator('button').filter({ hasText: /location|geofence/i }).first() _(89 ms)_
- Expect "toBeDisabled" locator('button').filter({ hasText: /location|geofence/i }).first() _(2 ms)_
- After Hooks _(200 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(198 ms)_
    - Close context _(75 ms)_

</details>

#### ⏭️ TC-REM-11 — Delete reminder removes it from list _(desktop)_

- Outcome: **skipped** · Duration: 552 ms — `14-reminders.spec.ts:72`
- Annotations: `skip: No reminder row to delete (Firestore SDK listener not seeded in e2e)`

<details><summary>Steps</summary>

- Before Hooks _(294 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(252 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(222 ms)_
    - Wait for selector locator('#amount-input') _(19 ms)_
- Navigate to "/#/reminders" _(1 ms)_
- Wait for load state "load" _(1 ms)_
- Expect "toBeVisible" getByRole('heading', { name: /reminders/i }) _(92 ms)_
- After Hooks _(163 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(160 ms)_
    - Close context _(77 ms)_

</details>

### 📄 15-theming.spec.ts

#### ⏭️ TC-THEME-01 — Changing palette updates data-palette on <html> _(chromium)_

- Outcome: **skipped** · Duration: 463 ms — `15-theming.spec.ts:10`
- Annotations: `skip: Emerald palette option not found`

<details><summary>Steps</summary>

- Before Hooks _(300 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(37 ms)_
  - Fixture "authenticatedPage" _(259 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(184 ms)_
    - Wait for selector locator('#amount-input') _(63 ms)_
- Navigate to "/#/settings" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(159 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(156 ms)_
    - Close context _(52 ms)_

</details>

#### ⏭️ TC-THEME-02 — Changing surface style updates data-style on <html> _(chromium)_

- Outcome: **skipped** · Duration: 432 ms — `15-theming.spec.ts:30`
- Annotations: `skip: Neumorphism style option not found`

<details><summary>Steps</summary>

- Before Hooks _(261 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(41 ms)_
    - Create page _(40 ms)_
  - Fixture "authenticatedPage" _(217 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(142 ms)_
    - Wait for selector locator('#amount-input') _(63 ms)_
- Navigate to "/#/settings" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(166 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(164 ms)_
    - Close context _(50 ms)_

</details>

#### ✅ TC-THEME-03 — Palette and style persist across page reload _(chromium)_

- Outcome: **expected** · Duration: 579 ms — `15-theming.spec.ts:54`

<details><summary>Steps</summary>

- Before Hooks _(326 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(284 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(260 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Wait for load state "load" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(136 ms)_
- Wait for load state "load" _(1 ms)_
- Evaluate _(7 ms)_
- Evaluate _(2 ms)_
- Expect "toBe" _(0 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(106 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(104 ms)_
    - Close context _(47 ms)_

</details>

#### ✅ TC-THEME-04 — Invalid stored palette falls back to violet _(chromium)_

- Outcome: **expected** · Duration: 488 ms — `15-theming.spec.ts:69`

<details><summary>Steps</summary>

- Before Hooks _(278 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(37 ms)_
  - Fixture "authenticatedPage" _(234 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(212 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Wait for load state "load" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(86 ms)_
- Wait for load state "load" _(0 ms)_
- Evaluate _(2 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(125 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(123 ms)_
    - Close context _(50 ms)_

</details>

#### ✅ TC-THEME-05 — Palette applies in both light and dark mode _(chromium)_

- Outcome: **expected** · Duration: 531 ms — `15-theming.spec.ts:81`

<details><summary>Steps</summary>

- Before Hooks _(295 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(41 ms)_
    - Create page _(40 ms)_
  - Fixture "authenticatedPage" _(251 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(222 ms)_
    - Wait for selector locator('#amount-input') _(16 ms)_
- Wait for load state "load" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(78 ms)_
- Evaluate _(2 ms)_
- Expect "toBe" _(0 ms)_
- Emulate media _(1 ms)_
- Evaluate _(1 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(153 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(151 ms)_
    - Close context _(54 ms)_

</details>

#### ✅ TC-THEME-07 — All 20 palette/style combinations are selectable without error _(chromium)_

- Outcome: **expected** · Duration: 3854 ms — `15-theming.spec.ts:96`

<details><summary>Steps</summary>

- Before Hooks _(514 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(469 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(445 ms)_
    - Wait for selector locator('#amount-input') _(15 ms)_
- Evaluate _(2 ms)_
- Reload _(104 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(22 ms)_
- Expect "poll toBe" _(6 ms)_
  - Evaluate _(4 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(4 ms)_
  - Evaluate _(3 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(93 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(9 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(12 ms)_
  - Evaluate _(11 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(6 ms)_
- Reload _(80 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(8 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(72 ms)_
- Wait for load state "load" _(1 ms)_
- Expect "not toHaveURL" _(12 ms)_
- Expect "poll toBe" _(3 ms)_
  - Evaluate _(2 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(81 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(9 ms)_
- Expect "poll toBe" _(4 ms)_
  - Evaluate _(3 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(2 ms)_
- Reload _(73 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(8 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(2 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(67 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(8 ms)_
- Expect "poll toBe" _(3 ms)_
  - Evaluate _(3 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(0 ms)_
  - Expect "toBe" _(1 ms)_
- Evaluate _(1 ms)_
- Reload _(69 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(11 ms)_
- Expect "poll toBe" _(3 ms)_
  - Evaluate _(2 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(0 ms)_
- Reload _(174 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(7 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(0 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(0 ms)_
- Reload _(76 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(9 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(2 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(0 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(3 ms)_
- Reload _(344 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(6 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(0 ms)_
- Reload _(471 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(7 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(186 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(21 ms)_
- Expect "poll toBe" _(4 ms)_
  - Evaluate _(4 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(0 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(2 ms)_
- Reload _(74 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(10 ms)_
- Expect "poll toBe" _(3 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(3 ms)_
  - Evaluate _(3 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(2 ms)_
- Reload _(141 ms)_
- Wait for load state "load" _(1 ms)_
- Expect "not toHaveURL" _(8 ms)_
- Expect "poll toBe" _(5 ms)_
  - Evaluate _(3 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(0 ms)_
- Reload _(71 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(12 ms)_
- Expect "poll toBe" _(5 ms)_
  - Evaluate _(3 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(2 ms)_
- Reload _(172 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(13 ms)_
- Expect "poll toBe" _(7 ms)_
  - Evaluate _(6 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(360 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(10 ms)_
- Expect "poll toBe" _(7 ms)_
  - Evaluate _(6 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(0 ms)_
- Reload _(84 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(9 ms)_
- Expect "poll toBe" _(3 ms)_
  - Evaluate _(2 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(2 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(77 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(6 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(2 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- After Hooks _(84 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(81 ms)_
    - Close context _(49 ms)_

</details>

#### ⏭️ TC-THEME-01 — Changing palette updates data-palette on <html> _(desktop)_

- Outcome: **skipped** · Duration: 482 ms — `15-theming.spec.ts:10`
- Annotations: `skip: Emerald palette option not found`

<details><summary>Steps</summary>

- Before Hooks _(255 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(214 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(150 ms)_
    - Wait for selector locator('#amount-input') _(53 ms)_
- Navigate to "/#/settings" _(2 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(220 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(216 ms)_
    - Close context _(55 ms)_

</details>

#### ⏭️ TC-THEME-02 — Changing surface style updates data-style on <html> _(desktop)_

- Outcome: **skipped** · Duration: 545 ms — `15-theming.spec.ts:30`
- Annotations: `skip: Neumorphism style option not found`

<details><summary>Steps</summary>

- Before Hooks _(273 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(37 ms)_
  - Fixture "authenticatedPage" _(230 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(207 ms)_
    - Wait for selector locator('#amount-input') _(14 ms)_
- Navigate to "/#/settings" _(1 ms)_
- Wait for load state "load" _(0 ms)_
- After Hooks _(273 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(271 ms)_
    - Close context _(69 ms)_

</details>

#### ✅ TC-THEME-03 — Palette and style persist across page reload _(desktop)_

- Outcome: **expected** · Duration: 511 ms — `15-theming.spec.ts:54`

<details><summary>Steps</summary>

- Before Hooks _(268 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(33 ms)_
    - Create page _(33 ms)_
  - Fixture "authenticatedPage" _(231 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(204 ms)_
    - Wait for selector locator('#amount-input') _(18 ms)_
- Wait for load state "load" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(80 ms)_
- Wait for load state "load" _(0 ms)_
- Evaluate _(2 ms)_
- Evaluate _(1 ms)_
- Expect "toBe" _(0 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(161 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(158 ms)_
    - Close context _(59 ms)_

</details>

#### ✅ TC-THEME-04 — Invalid stored palette falls back to violet _(desktop)_

- Outcome: **expected** · Duration: 892 ms — `15-theming.spec.ts:69`

<details><summary>Steps</summary>

- Before Hooks _(342 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(303 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(282 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Wait for load state "load" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(389 ms)_
- Wait for load state "load" _(0 ms)_
- Evaluate _(1 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(160 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(158 ms)_
    - Close context _(52 ms)_

</details>

#### ✅ TC-THEME-05 — Palette applies in both light and dark mode _(desktop)_

- Outcome: **expected** · Duration: 649 ms — `15-theming.spec.ts:81`

<details><summary>Steps</summary>

- Before Hooks _(307 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(36 ms)_
    - Create page _(36 ms)_
  - Fixture "authenticatedPage" _(268 ms)_
    - Navigate to "/#/daily" _(5 ms)_
    - Wait for load state "load" _(164 ms)_
    - Wait for selector locator('#amount-input') _(95 ms)_
- Wait for load state "load" _(1 ms)_
- Evaluate _(4 ms)_
- Reload _(87 ms)_
- Evaluate _(1 ms)_
- Expect "toBe" _(0 ms)_
- Emulate media _(0 ms)_
- Evaluate _(1 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(250 ms)_
  - Fixture "authenticatedPage" _(1 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(247 ms)_
    - Close context _(54 ms)_

</details>

#### ✅ TC-THEME-07 — All 20 palette/style combinations are selectable without error _(desktop)_

- Outcome: **expected** · Duration: 2801 ms — `15-theming.spec.ts:96`

<details><summary>Steps</summary>

- Before Hooks _(452 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
  - Fixture "authenticatedPage" _(413 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(392 ms)_
    - Wait for selector locator('#amount-input') _(12 ms)_
- Evaluate _(1 ms)_
- Reload _(81 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(8 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(0 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(96 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(11 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(0 ms)_
  - Expect "toBe" _(1 ms)_
- Evaluate _(1 ms)_
- Reload _(88 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(6 ms)_
- Expect "poll toBe" _(5 ms)_
  - Evaluate _(5 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(3 ms)_
  - Evaluate _(2 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(69 ms)_
- Wait for load state "load" _(1 ms)_
- Expect "not toHaveURL" _(14 ms)_
- Expect "poll toBe" _(3 ms)_
  - Evaluate _(3 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(78 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(9 ms)_
- Expect "poll toBe" _(3 ms)_
  - Evaluate _(3 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(0 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(0 ms)_
- Reload _(66 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(16 ms)_
- Expect "poll toBe" _(3 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(79 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(9 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(0 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(4 ms)_
- Reload _(185 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(6 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(2 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(4 ms)_
  - Evaluate _(2 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(164 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(6 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(0 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(0 ms)_
  - Evaluate _(0 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(0 ms)_
- Reload _(82 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(8 ms)_
- Expect "poll toBe" _(3 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(130 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(9 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(2 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(177 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(6 ms)_
- Expect "poll toBe" _(5 ms)_
  - Evaluate _(4 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(0 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(0 ms)_
- Reload _(72 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(18 ms)_
- Expect "poll toBe" _(7 ms)_
  - Evaluate _(5 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(6 ms)_
  - Evaluate _(5 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(78 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(9 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(4 ms)_
  - Evaluate _(3 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(69 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(20 ms)_
- Expect "poll toBe" _(3 ms)_
  - Evaluate _(2 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(1 ms)_
- Reload _(74 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(18 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(4 ms)_
  - Evaluate _(3 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(0 ms)_
- Reload _(84 ms)_
- Wait for load state "load" _(1 ms)_
- Expect "not toHaveURL" _(7 ms)_
- Expect "poll toBe" _(3 ms)_
  - Evaluate _(2 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(0 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(2 ms)_
- Reload _(71 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(14 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(2 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(2 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(0 ms)_
- Reload _(69 ms)_
- Wait for load state "load" _(4 ms)_
- Expect "not toHaveURL" _(11 ms)_
- Expect "poll toBe" _(3 ms)_
  - Evaluate _(2 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(0 ms)_
  - Expect "toBe" _(0 ms)_
- Evaluate _(0 ms)_
- Reload _(70 ms)_
- Wait for load state "load" _(0 ms)_
- Expect "not toHaveURL" _(16 ms)_
- Expect "poll toBe" _(3 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- Expect "poll toBe" _(1 ms)_
  - Evaluate _(1 ms)_
  - Expect "toBe" _(0 ms)_
- After Hooks _(82 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(80 ms)_
    - Close context _(48 ms)_

</details>

### 📄 16-landing.spec.ts

#### ✅ TC-LAND-01 — Logged-out visitor sees landing content, not redirect _(chromium)_

- Outcome: **expected** · Duration: 384 ms — `16-landing.spec.ts:10`

<details><summary>Steps</summary>

- Before Hooks _(80 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(75 ms)_
    - Create page _(75 ms)_
- Navigate to "/" _(149 ms)_
- Expect "not toHaveURL" _(37 ms)_
- Expect "toBeVisible" locator('text=/spenza|expense.*tracker|finance/i').first() _(4 ms)_
- After Hooks _(113 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(111 ms)_
    - Close context _(64 ms)_

</details>

#### ✅ TC-LAND-02 — Signed-in user at / is redirected to /daily _(chromium)_

- Outcome: **expected** · Duration: 860 ms — `16-landing.spec.ts:22`

<details><summary>Steps</summary>

- Before Hooks _(545 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(3 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
  - Fixture "authenticatedPage" _(501 ms)_
    - Navigate to "/#/daily" _(6 ms)_
    - Wait for load state "load" _(477 ms)_
    - Wait for selector locator('#amount-input') _(13 ms)_
- Navigate to "/" _(156 ms)_
- Expect "toHaveURL" _(46 ms)_
- After Hooks _(112 ms)_
  - Fixture "authenticatedPage" _(0 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(109 ms)_
    - Close context _(53 ms)_

</details>

#### ✅ TC-LAND-03 — Static branding visible without JavaScript _(chromium)_

- Outcome: **expected** · Duration: 122 ms — `16-landing.spec.ts:27`

<details><summary>Steps</summary>

- Before Hooks _(45 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(41 ms)_
    - Create page _(41 ms)_
- GET "/" _(6 ms)_
- Expect "toBe" _(0 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(73 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(71 ms)_
    - Close context _(58 ms)_

</details>

#### ✅ TC-LAND-04 — /privacy and /terms routes render content in the SPA _(chromium)_

- Outcome: **expected** · Duration: 685 ms — `16-landing.spec.ts:38`

<details><summary>Steps</summary>

- Before Hooks _(41 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(37 ms)_
- Navigate to "/#/privacy" _(512 ms)_
- Expect "not toHaveURL" _(11 ms)_
- Expect "toBeVisible" locator('text=/privacy|data.*policy|information/i').first() _(4 ms)_
- Navigate to "/#/terms" _(1 ms)_
- Expect "not toHaveURL" _(1 ms)_
- Expect "toBeVisible" locator('text=/terms|conditions|usage/i').first() _(30 ms)_
- After Hooks _(87 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(85 ms)_
    - Close context _(61 ms)_

</details>

#### ✅ TC-LAND-05 — Data-scope explanation and Privacy/Terms links are present on landing _(chromium)_

- Outcome: **expected** · Duration: 434 ms — `16-landing.spec.ts:55`

<details><summary>Steps</summary>

- Before Hooks _(43 ms)_
  - Fixture "context" _(2 ms)_
    - Create context _(2 ms)_
  - Fixture "page" _(39 ms)_
    - Create page _(38 ms)_
- Navigate to "/" _(285 ms)_
- Expect "toBeVisible" locator('a[href*="privacy"]').first() _(11 ms)_
- Expect "toBeVisible" locator('a[href*="terms"]').first() _(1 ms)_
- After Hooks _(91 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(89 ms)_
    - Close context _(54 ms)_

</details>

#### ✅ TC-LAND-01 — Logged-out visitor sees landing content, not redirect _(desktop)_

- Outcome: **expected** · Duration: 604 ms — `16-landing.spec.ts:10`

<details><summary>Steps</summary>

- Before Hooks _(52 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(48 ms)_
    - Create page _(48 ms)_
- Navigate to "/" _(375 ms)_
- Expect "not toHaveURL" _(11 ms)_
- Expect "toBeVisible" locator('text=/spenza|expense.*tracker|finance/i').first() _(4 ms)_
- After Hooks _(159 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(157 ms)_
    - Close context _(71 ms)_

</details>

#### ✅ TC-LAND-02 — Signed-in user at / is redirected to /daily _(desktop)_

- Outcome: **expected** · Duration: 655 ms — `16-landing.spec.ts:22`

<details><summary>Steps</summary>

- Before Hooks _(250 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(33 ms)_
  - Fixture "authenticatedPage" _(212 ms)_
    - Navigate to "/#/daily" _(4 ms)_
    - Wait for load state "load" _(143 ms)_
    - Wait for selector locator('#amount-input') _(60 ms)_
- Navigate to "/" _(96 ms)_
- Expect "toHaveURL" _(92 ms)_
- After Hooks _(220 ms)_
  - Fixture "authenticatedPage" _(1 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(217 ms)_
    - Close context _(69 ms)_

</details>

#### ✅ TC-LAND-03 — Static branding visible without JavaScript _(desktop)_

- Outcome: **expected** · Duration: 130 ms — `16-landing.spec.ts:27`

<details><summary>Steps</summary>

- Before Hooks _(42 ms)_
  - Fixture "context" _(3 ms)_
    - Create context _(3 ms)_
  - Fixture "page" _(38 ms)_
    - Create page _(38 ms)_
- GET "/" _(4 ms)_
- Expect "toBe" _(0 ms)_
- Expect "toBe" _(0 ms)_
- After Hooks _(87 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(85 ms)_
    - Close context _(70 ms)_

</details>

#### ✅ TC-LAND-04 — /privacy and /terms routes render content in the SPA _(desktop)_

- Outcome: **expected** · Duration: 1204 ms — `16-landing.spec.ts:38`

<details><summary>Steps</summary>

- Before Hooks _(38 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(35 ms)_
    - Create page _(35 ms)_
- Navigate to "/#/privacy" _(1016 ms)_
- Expect "not toHaveURL" _(16 ms)_
- Expect "toBeVisible" locator('text=/privacy|data.*policy|information/i').first() _(5 ms)_
- Navigate to "/#/terms" _(1 ms)_
- Expect "not toHaveURL" _(2 ms)_
- Expect "toBeVisible" locator('text=/terms|conditions|usage/i').first() _(31 ms)_
- After Hooks _(99 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(97 ms)_
    - Close context _(46 ms)_

</details>

#### ✅ TC-LAND-05 — Data-scope explanation and Privacy/Terms links are present on landing _(desktop)_

- Outcome: **expected** · Duration: 457 ms — `16-landing.spec.ts:55`

<details><summary>Steps</summary>

- Before Hooks _(40 ms)_
  - Fixture "context" _(1 ms)_
    - Create context _(1 ms)_
  - Fixture "page" _(37 ms)_
    - Create page _(36 ms)_
- Navigate to "/" _(236 ms)_
- Expect "toBeVisible" locator('a[href*="privacy"]').first() _(12 ms)_
- Expect "toBeVisible" locator('a[href*="terms"]').first() _(1 ms)_
- After Hooks _(166 ms)_
  - Fixture "page" _(0 ms)_
  - Fixture "context" _(164 ms)_
    - Close context _(82 ms)_

</details>
