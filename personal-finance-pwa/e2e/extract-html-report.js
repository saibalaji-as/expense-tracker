#!/usr/bin/env node
/**
 * e2e/extract-html-report.js
 *
 * The Playwright HTML report (e2e-report/index.html) is a single self-contained
 * file that embeds ALL of its data as a base64-encoded zip inside a
 * <script id="playwrightReportBase64"> tag. The React app only un-zips that blob
 * at runtime when the report is *served* (npx playwright show-report → :9323),
 * which is why opening the raw file shows nothing useful and why the plain JSON
 * reporter (e2e-results.json) only carries status + a one-line error.
 *
 * This script reproduces what the browser does: it pulls the embedded zip out of
 * index.html, decodes it, and renders the FULL detail (per-test step tree,
 * timings, errors, attachments) into a Markdown file that can be read directly —
 * no server required.
 *
 * Usage:
 *   node e2e/extract-html-report.js
 *   node e2e/extract-html-report.js --html path/to/index.html --out path/to/REPORT.md
 *
 * Run automatically via `npm run e2e` (see package.json).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── Args ──────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
function arg(flag, fallback) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}
const HTML_IN = path.resolve(ROOT, arg('--html', 'e2e-report/index.html'));
const MD_OUT = path.resolve(ROOT, arg('--out', 'e2e/TEST_REPORT_FULL.md'));
const JSON_DIR_ARG = arg('--json-dir', ''); // optional raw dump (only when passed)
const JSON_DIR = JSON_DIR_ARG ? path.resolve(ROOT, JSON_DIR_ARG) : '';

// ── Minimal zip reader (no deps) ───────────────────────────────────────────────
// Reads a zip Buffer and returns { name: Buffer } for every stored/deflated entry.
// Playwright writes the report zip with deflate (method 8) or store (method 0).

function readZip(buf) {
  const files = {};
  // Find End Of Central Directory record (signature 0x06054b50), scanning back.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Not a valid zip (no EOCD found)');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16); // start of central directory

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break; // central dir header
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);

    // Parse the local file header to find where data actually starts.
    const lhNameLen = buf.readUInt16LE(localOff + 26);
    const lhExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);

    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ── Extract embedded blob from index.html ──────────────────────────────────────

if (!fs.existsSync(HTML_IN)) {
  console.error(`[extract-html-report] not found: ${HTML_IN}`);
  console.error('  Run the suite first (npm run e2e) to generate the HTML report.');
  process.exit(0);
}

const html = fs.readFileSync(HTML_IN, 'utf8');
const m = html.match(/id="playwrightReportBase64"[^>]*>\s*data:application\/zip;base64,([A-Za-z0-9+/=]+)\s*</);
if (!m) {
  console.error('[extract-html-report] could not find embedded report data in index.html.');
  process.exit(1);
}
const zip = readZip(Buffer.from(m[1], 'base64'));

const report = JSON.parse(zip['report.json'].toString('utf8'));

// Optional: dump raw JSON files for inspection.
if (JSON_DIR) {
  fs.mkdirSync(JSON_DIR, { recursive: true });
  for (const [name, data] of Object.entries(zip)) {
    fs.writeFileSync(path.join(JSON_DIR, name), data);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const stripAnsi = (s) => (s || '').replace(/\x1B\[[0-9;]*m/g, '').replace(/\[\d+m/g, '');
const ms = (n) => (n == null ? '' : `${Math.round(n)} ms`);
const ICON = { expected: '✅', unexpected: '❌', flaky: '⚠️', skipped: '⏭️' };

function fmtDuration(total) {
  if (!total) return '0s';
  const s = total / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${s.toFixed(1)}s`;
}

// Recursively render a step tree as an indented Markdown list.
function renderSteps(steps, depth = 0) {
  let out = '';
  for (const s of steps || []) {
    const pad = '  '.repeat(depth);
    const dur = s.duration != null ? ` _(${ms(s.duration)})_` : '';
    const err = s.error ? ' ❌' : '';
    out += `${pad}- ${s.title}${dur}${err}\n`;
    if (s.error?.message) {
      out += `${pad}  > ${stripAnsi(s.error.message).split('\n')[0]}\n`;
    }
    if (s.steps?.length) out += renderSteps(s.steps, depth + 1);
  }
  return out;
}

// ── Build Markdown ──────────────────────────────────────────────────────────────

const stats = report.stats || {};
const started = report.startTime ? new Date(report.startTime).toISOString() : 'unknown';
const lines = [];

lines.push('# Playwright E2E — Full Test Report');
lines.push('');
lines.push('> Extracted from `e2e-report/index.html` (the same data served at http://localhost:9323).');
lines.push('> Regenerate with `node e2e/extract-html-report.js`.');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`- **Started:** ${started}`);
lines.push(`- **Duration:** ${fmtDuration(report.duration || stats.duration)}`);
lines.push(`- **Projects:** ${(report.projectNames || []).join(', ') || '—'}`);
lines.push(`- **Total:** ${stats.total ?? '—'}`);
lines.push(`- ✅ Passed: ${stats.expected ?? 0}`);
lines.push(`- ❌ Failed: ${stats.unexpected ?? 0}`);
lines.push(`- ⚠️ Flaky: ${stats.flaky ?? 0}`);
lines.push(`- ⏭️ Skipped: ${stats.skipped ?? 0}`);
lines.push(`- **Result:** ${stats.ok ? '✅ PASS' : '❌ FAIL'}`);
lines.push('');

// Top-level errors (e.g. global-setup failures)
if (report.errors?.length) {
  lines.push('## Run-level errors');
  lines.push('');
  for (const e of report.errors) {
    lines.push('```');
    lines.push(stripAnsi(e.message || String(e)).trim());
    lines.push('```');
    lines.push('');
  }
}

// Per-file → per-test detail. report.json carries test summaries; the per-file
// <fileId>.json carries the full step tree, so prefer it when present.
lines.push('## Tests');
lines.push('');

for (const file of report.files || []) {
  lines.push(`### 📄 ${file.fileName}`);
  lines.push('');

  const detailFile = `${file.fileId}.json`;
  const detail = zip[detailFile] ? JSON.parse(zip[detailFile].toString('utf8')) : null;
  const detailById = {};
  for (const t of detail?.tests || []) detailById[t.testId] = t;

  for (const t of file.tests || []) {
    const full = detailById[t.testId] || t;
    const icon = ICON[t.outcome] || '•';
    const proj = t.projectName ? ` _(${t.projectName})_` : '';
    const where = full.location ? ` — \`${file.fileName}:${full.location.line}\`` : '';
    lines.push(`#### ${icon} ${t.title}${proj}`);
    lines.push('');
    lines.push(`- Outcome: **${t.outcome}** · Duration: ${ms(full.duration ?? t.duration)}${where}`);

    if (full.annotations?.length) {
      const ann = full.annotations.map((a) => `\`${a.type}${a.description ? ': ' + a.description : ''}\``).join(', ');
      lines.push(`- Annotations: ${ann}`);
    }
    lines.push('');

    for (const res of full.results || []) {
      if ((full.results || []).length > 1) {
        lines.push(`**Attempt ${res.retry + 1} — ${res.status}**`);
        lines.push('');
      }
      // Steps
      if (res.steps?.length) {
        lines.push('<details><summary>Steps</summary>');
        lines.push('');
        lines.push(renderSteps(res.steps).trimEnd());
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }
      // Errors (full)
      for (const err of res.errors || []) {
        lines.push('```');
        lines.push(stripAnsi(err.message || '').trim());
        lines.push('```');
        lines.push('');
      }
      // Attachments
      if (res.attachments?.length) {
        lines.push('Attachments: ' + res.attachments.map((a) => `\`${a.name}\` (${a.contentType})`).join(', '));
        lines.push('');
      }
    }
  }
}

fs.writeFileSync(MD_OUT, lines.join('\n'));
console.log(`[extract-html-report] wrote ${path.relative(ROOT, MD_OUT)}`);
console.log(`  ${stats.expected ?? 0} passed · ${stats.unexpected ?? 0} failed · ${stats.flaky ?? 0} flaky · ${stats.skipped ?? 0} skipped`);
if (JSON_DIR) console.log(`  raw JSON dumped to ${path.relative(ROOT, JSON_DIR)}/`);
