# AI & OCR — Reading Receipts and Generating Insights

> **In one sentence:** A mix of on-device tools (Tesseract.js, pdf.js) and hosted AI (Groq, Gemini) lets Spenza read text off receipts and statements and turn raw numbers into plain-language spending insights — so users type less and understand more.

---

## 1. What it is (plain English)

This is really two capabilities bundled together:

- **OCR (Optical Character Recognition)** — reading *text out of an image*. When you photograph a receipt, OCR turns those pixels into actual characters ("COFFEE  ₹180").
- **AI (language/multimodal models)** — understanding and generating text. Spenza uses it to *extract structured fields* from a messy receipt ("merchant: Cafe X, total: 180, date: ...") and to *write insights* ("You spent 30% more on dining this month").

Spenza runs some of this **on the device** (private, free, offline) and some **in the cloud** (more powerful, needs a key/network).

---

## 2. The pain point it solves

- **Manual data entry is tedious.** Typing every expense kills the habit. Snap a receipt → OCR + AI fill in the fields → far less typing.
- **Statements are unstructured.** A PDF bank/card statement is hard to read into an app; pdf.js + parsing turns it into usable transactions.
- **Numbers aren't understanding.** A list of expenses doesn't tell you much; AI insights translate them into useful, human sentences.
- **Privacy + cost.** Doing OCR on-device keeps receipt images private and free; reserving the cloud for the heavy lifting controls cost.

---

## 3. How Spenza uses it

### On-device (no server, private)
| Tool | Role |
|------|------|
| **`tesseract.js`** | OCR engine running *in the browser/app*. Configured for **`eng+tam+hin`** (English, Tamil, Hindi) — reflecting Spenza's multilingual user base. Extracts raw text from receipt images locally. |
| **`pdfjs-dist` (pdf.js)** | Renders and extracts text/content from **PDF** statements so they can be parsed into transactions. Mozilla's battle-tested PDF library. |

### Hosted AI (server-side, via Firebase/Netlify Functions)
| Tool | Role | Notes |
|------|------|-------|
| **Groq** | Fast hosted **text** AI — powers insights and voice-style text tasks. | Uses `GROQ_API_KEY` secret; the project notes a **free tier**, so users don't need their own key for the hosted path. |
| **Google Gemini** | **Multimodal** AI for **receipt extraction** (image → structured fields). | Uses `GEMINI_API_KEY`; the user-key path can override the model via `GEMINI_MODEL`. |

The hosted calls are **proxied through serverless functions**, not called directly from the app. That keeps the API keys secret (on the server) and lets Spenza offer a "hosted AI tier" where the user doesn't need to supply their own key (recorded in the project's memory as the Groq-text + Gemini-receipts hosted tier).

### The division of labour (a good mental model)
- **Capture & cheap reading** → on-device (Tesseract OCR, pdf.js).
- **Smart understanding & generation** → hosted AI (Gemini for images, Groq for text).
- **Keys & secrets** → live in Firebase Functions, never on the device (see [05-firebase.md](05-firebase.md)).

### Receipts are decoupled
The project's offline-first rule notes receipts are **decoupled** from the core save path — i.e. an expense saves immediately regardless of whether receipt OCR/AI has finished. The image processing enriches the entry afterward and must never block or risk the core save.

---

## 4. Key files / config to look at

- `personal-finance-pwa/package.json` — `tesseract.js`, `pdfjs-dist` under dependencies.
- `personal-finance-pwa/functions/` — the hosted AI proxy functions (Groq/Gemini).
- `personal-finance-pwa/src/app/` — the receipt-scan and insights features that call these (search for OCR/receipt/insight services).
- Firebase secrets: `GROQ_API_KEY`, `GEMINI_API_KEY` (set via `firebase functions:secrets:set`).

---

## 5. Gotchas worth knowing

- **On-device OCR is heavy.** Tesseract loads language data and uses real CPU; run it off the main interaction path and show progress, especially on low-end Android.
- **Keys must never reach the client.** Always go through the Functions proxy for Groq/Gemini; don't embed keys in the app bundle.
- **AI extraction is fallible.** Treat extracted fields as *suggestions* the user can correct, not gospel — receipts are messy.
- **Receipts must not block saving.** Keep the OCR/AI enrichment asynchronous and decoupled from the local-first save (otherwise a slow scan could lose an entry).
- **Multilingual matters.** OCR is tuned for `eng+tam+hin`; adding a language means adding its Tesseract data, which adds weight.

---

## TL;DR

Spenza reads receipts and statements with on-device OCR (Tesseract.js) and PDF parsing (pdf.js) to cut manual entry, then uses hosted AI — Gemini for image-based receipt extraction, Groq for text insights — proxied through serverless functions so keys stay secret and users don't need their own. Receipt processing is decoupled from saving, so an entry is never lost waiting on AI.
