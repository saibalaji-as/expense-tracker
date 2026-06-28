# Spenza — Tech Stack Guide (Start Here)

This folder explains, in plain language, **every major technology Spenza uses**, what each one *contributes*, and **which real-world pain point it solves**. You asked specifically about Capacitor, Playwright, and OAuth consent — those have their own deep-dive files — but those three don't work alone, so each "supporting" stack that makes them possible also gets its own file.

Read this overview first. It gives you the mental model. Then jump into any individual file.

---

## What is Spenza, in one paragraph?

Spenza is a personal/household **expense tracker**. It is built once as a web app (Angular) and shipped to two places: a **website (PWA)** that runs in any browser, and an **Android app** (the same web code wrapped in a native shell by Capacitor). Your data lives primarily in **your own Google Drive** as a private JSON file, with a local cached copy on the device so the app opens instantly and works offline. Sign-in is **Google OAuth**. A small **Firebase** backend handles notifications, subscription status, and payments. Everything is verified by an automated **Playwright** test suite.

---

## The "one app, two homes" idea (the key to understanding everything)

```
                 ┌─────────────────────────────────────┐
                 │   ONE codebase: Angular + TypeScript  │
                 └─────────────────────────────────────┘
                                  │
              build once ─────────┴──────────── build once
                    │                                │
          ┌─────────▼─────────┐          ┌──────────▼──────────┐
          │  Web PWA           │          │  Android app        │
          │  (browser/website) │          │  (Capacitor shell)  │
          └─────────┬──────────┘          └──────────┬──────────┘
                    │                                │
                    └──────────────┬─────────────────┘
                                   │  same services, same logic
              ┌────────────────────┼─────────────────────┐
              ▼                    ▼                      ▼
       Google OAuth          Google Drive            Firebase
     (who are you?)      (your data lives here)   (notifications,
                                                  subscription, pay)
```

Because there is **one codebase**, a feature written once appears on both web and Android. Capacitor is the bridge that lets that same web code use native phone features (notifications, native Google sign-in, secure storage).

---

## The stacks, grouped by the job they do

### 1. Shipping to phones — your three headline topics live mostly here
| File | Stack | One-line job |
|------|-------|--------------|
| [01-capacitor.md](01-capacitor.md) | **Capacitor** (+ its plugins) | Wraps the web app into a real Android app and gives web code access to native features. |
| [03-oauth-google-signin.md](03-oauth-google-signin.md) | **OAuth consent / Google Sign-In** | Lets users log in with Google and *grant permission* to use their Drive — safely. |
| [02-playwright.md](02-playwright.md) | **Playwright** | Automatically clicks through the whole app like a real user to catch bugs before release. |

### 2. The application itself
| File | Stack | One-line job |
|------|-------|--------------|
| [04-angular-and-ngrx-signals.md](04-angular-and-ngrx-signals.md) | **Angular 21 + NgRx Signals** | The UI framework and the way the app remembers and reacts to data changes. |
| [10-ui-tailwind-charts.md](10-ui-tailwind-charts.md) | **Tailwind CSS + Lucide + Chart.js** | The look, the icons, and the spending charts. |

### 3. Where data lives and how it stays safe offline
| File | Stack | One-line job |
|------|-------|--------------|
| [06-offline-storage-and-pwa.md](06-offline-storage-and-pwa.md) | **Capacitor Preferences + IndexedDB + Service Worker** | Saves data on the device first so you never lose an entry and the app works offline. |
| [07-google-drive-sync.md](07-google-drive-sync.md) | **Google Drive API** | The authoritative "cloud save" for the user's data, stored in their own Drive. |

### 4. The backend services
| File | Stack | One-line job |
|------|-------|--------------|
| [05-firebase.md](05-firebase.md) | **Firebase** (Auth, Firestore, Hosting, Functions, FCM, Scheduler) | Hosting the website, sending reminders, storing subscription status. |
| [09-payments-razorpay.md](09-payments-razorpay.md) | **Razorpay (via Firebase Functions)** | Takes subscription payments and verifies them securely. |

### 5. Smart features
| File | Stack | One-line job |
|------|-------|--------------|
| [08-ai-and-ocr.md](08-ai-and-ocr.md) | **Tesseract.js, pdf.js, Groq, Gemini** | Reads receipts, parses statements, and generates spending insights. |

---

## How your three headline stacks depend on the others

This is worth internalising, because it explains why the supporting files exist:

- **Capacitor** needs **OAuth** to do *native* Google sign-in (a different code path from the web), and it relies on **Capacitor Preferences** (offline storage) to keep you logged in.
- **OAuth consent** is the gatekeeper for **Google Drive sync** — the access token it produces is exactly what unlocks the Drive file where data lives. It also feeds **Firebase Auth** to establish a backend identity.
- **Playwright** has to *fake* both OAuth and Drive (it injects a fake session and intercepts Google network calls) so tests run fast without real popups — so understanding Playwright requires understanding OAuth and Drive first.

---

## Suggested reading order

1. This overview.
2. [01-capacitor.md](01-capacitor.md) — the "two homes" idea made concrete.
3. [03-oauth-google-signin.md](03-oauth-google-signin.md) — login and permissions.
4. [07-google-drive-sync.md](07-google-drive-sync.md) — where data goes after login.
5. [06-offline-storage-and-pwa.md](06-offline-storage-and-pwa.md) — why nothing is lost offline.
6. Then [04](04-angular-and-ngrx-signals.md), [05](05-firebase.md), [08](08-ai-and-ocr.md), [09](09-payments-razorpay.md), [10](10-ui-tailwind-charts.md) in any order.
7. [02-playwright.md](02-playwright.md) last — it ties together how all of the above is tested.

Every file follows the same shape: **What it is → The pain point → How Spenza uses it → Key files → Gotchas.**
