#!/usr/bin/env node
/**
 * e2e/generate-report.js
 *
 * Reads e2e-results.json (Playwright JSON reporter output) and writes
 * e2e/TEST_REPORT.md — a clean Markdown file that Claude can Read directly.
 *
 * Run automatically via `npm run e2e` (posttest hook in package.json).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JSON_IN = path.join(ROOT, 'e2e-results.json');
const MD_OUT  = path.join(ROOT, 'e2e', 'TEST_REPORT.md');

// ── Load results ──────────────────────────────────────────────────────────────

if (!fs.existsSync(JSON_IN)) {
  console.error('[generate-report] e2e-results.json not found — run tests first.');
  process.exit(0);
}

const raw = JSON.parse(fs.readFileSync(JSON_IN, 'utf8'));

// ── Walk the suite tree ───────────────────────────────────────────────────────

const results = { passed: [], failed: [], skipped: [], flaky: [] };

function stripAnsi(str) {
  return (str || '').replace(/\x1B\[[0-9;]*m/g, '').replace(/\[\d+m/g, '');
}

function walk(node, fileTitle) {
  const file = node.file || fileTitle || '';
  for (const spec of (node.specs || [])) {
    for (const test of (spec.tests || [])) {
      const proj = test.projectName || '';
      const entry = { file, title: spec.title, proj };
      if (test.status === 'skipped') {
        results.skipped.push(entry);
      } else if (test.status === 'flaky') {
        results.flaky.push(entry);
      } else if (test.status === 'unexpected') {
        const res   = test.results?.find(r => r.status === 'failed') || test.results?.[0] || {};
        const msg   = stripAnsi(res.error?.message || '');
        const lines = msg.split('\n').map(l => l.trim()).filter(Boolean);
        // Extract the most useful lines
        const errorLine   = lines.find(l => l.startsWith('Error:')) || lines[0] || '';
        const locatorLine = lines.find(l => l.startsWith('Locator:')) || '';
        const expectLine  = lines.find(l => l.startsWith('Expected:')) || '';
        const receivedLine= lines.find(l => l.startsWith('Received:') || l.startsWith('Value:')) || '';
        const durationMs  = res.duration || 0;
        results.failed.push({ file, title: spec.title, proj, errorLine, locatorLine, expectLine, receivedLine, durationMs });
      } else {
        results.passed.push(entry);
      }
    }
  }
  for (const sub of (node.suites || [])) walk(sub, file);
}

// Top-level: raw.suites → one entry per project; each has suites per file
for (const topSuite of (raw.suites || [])) walk(topSuite, '');

const stats = raw.stats || {};
const totalTests = (results.passed.length + results.failed.length + results.skipped.length + results.flaky.length);
const runDate = stats.startTime ? new Date(stats.startTime).toLocaleString() : new Date().toLocaleString();
const duration = stats.duration ? `${(stats.duration / 1000).toFixed(1)}s` : '—';

// ── Group failures by file ────────────────────────────────────────────────────

const failsByFile = {};
for (const f of results.failed) {
  (failsByFile[f.file] = failsByFile[f.file] || []).push(f);
}

// Dedupe: keep one entry per title (first project encountered)
const seenTitles = new Set();
const uniqueFails = results.failed.filter(f => {
  const key = f.file + '|' + f.title;
  if (seenTitles.has(key)) return false;
  seenTitles.add(key); return true;
});
const uniqueFailsByFile = {};
for (const f of uniqueFails) {
  (uniqueFailsByFile[f.file] = uniqueFailsByFile[f.file] || []).push(f);
}

// ── Build Markdown ────────────────────────────────────────────────────────────

const lines = [];

lines.push(`# Spenza E2E Test Report`);
lines.push(``);
lines.push(`**Run:** ${runDate}  `);
lines.push(`**Duration:** ${duration}  `);
lines.push(`**Total:** ${totalTests} tests`);
lines.push(``);

// Status badges
const passEmoji  = results.passed.length  > 0 ? '✅' : '—';
const failEmoji  = results.failed.length  > 0 ? '❌' : '✅';
const skipEmoji  = results.skipped.length > 0 ? '⏭️' : '—';
const flakyEmoji = results.flaky.length   > 0 ? '⚠️' : '—';

lines.push(`| Status  | Count |`);
lines.push(`|---------|-------|`);
lines.push(`| ${passEmoji} Passed  | **${results.passed.length}** |`);
lines.push(`| ${failEmoji} Failed  | **${results.failed.length}** |`);
lines.push(`| ${skipEmoji} Skipped | ${results.skipped.length} |`);
lines.push(`| ${flakyEmoji} Flaky   | ${results.flaky.length} |`);
lines.push(``);

// ── Failures ──────────────────────────────────────────────────────────────────

if (uniqueFails.length === 0) {
  lines.push(`## 🎉 All tests passed!`);
  lines.push(``);
} else {
  lines.push(`## ❌ Failures (${uniqueFails.length} unique)`);
  lines.push(``);
  lines.push(`> Note: counts below are unique test cases (each runs on chromium + desktop).`);
  lines.push(``);

  for (const [file, tests] of Object.entries(uniqueFailsByFile)) {
    lines.push(`### \`${file}\` — ${tests.length} failure(s)`);
    lines.push(``);
    for (const t of tests) {
      lines.push(`#### ${t.title}`);
      if (t.errorLine)    lines.push(`- **Error:** \`${t.errorLine.slice(0, 200)}\``);
      if (t.locatorLine)  lines.push(`- **Locator:** \`${t.locatorLine.slice(0, 200)}\``);
      if (t.expectLine)   lines.push(`- **Expected:** ${t.expectLine.replace('Expected:', '').trim()}`);
      if (t.receivedLine) lines.push(`- **Received:** ${t.receivedLine.replace(/^(Received|Value):/, '').trim()}`);
      if (t.durationMs)   lines.push(`- **Duration:** ${(t.durationMs / 1000).toFixed(1)}s`);
      lines.push(``);
    }
  }
}

// ── Skipped ───────────────────────────────────────────────────────────────────

if (results.skipped.length > 0) {
  lines.push(`## ⏭️ Skipped (${results.skipped.length})`);
  lines.push(``);
  const seenSkip = new Set();
  for (const s of results.skipped) {
    const k = s.file + '|' + s.title;
    if (seenSkip.has(k)) continue;
    seenSkip.add(k);
    lines.push(`- \`${s.file}\` → ${s.title}`);
  }
  lines.push(``);
}

// ── Passed ────────────────────────────────────────────────────────────────────

if (results.passed.length > 0) {
  lines.push(`## ✅ Passed (${results.passed.length})`);
  lines.push(``);
  const seenPass = new Set();
  const byPassFile = {};
  for (const p of results.passed) {
    const k = p.file + '|' + p.title;
    if (seenPass.has(k)) continue;
    seenPass.add(k);
    (byPassFile[p.file] = byPassFile[p.file] || []).push(p.title);
  }
  for (const [file, titles] of Object.entries(byPassFile)) {
    lines.push(`**\`${file}\`**`);
    for (const t of titles) lines.push(`- ${t}`);
    lines.push(``);
  }
}

lines.push(`---`);
lines.push(`*Generated by \`e2e/generate-report.js\` — re-runs automatically with \`npm run e2e\`*`);

// ── Write ─────────────────────────────────────────────────────────────────────

fs.writeFileSync(MD_OUT, lines.join('\n'), 'utf8');
console.log(`[generate-report] ✅  Report written → e2e/TEST_REPORT.md  (${results.failed.length} failures, ${results.passed.length} passed)`);
