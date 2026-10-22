/**
 * Rebuilds readable text lines from the positioned text items pdf.js returns.
 * Pure — CardStatementPdfService feeds it, card-statement-pdf.ts reads the result.
 *
 * Two things make a plain "join the items" unusable for bank statements that
 * are printed from a web page (Chromium/Skia PDFs — e.g. HDFC's PIXEL statement):
 *
 * 1. Every glyph the font cannot map to Unicode (in practice ALL digits and
 *    most punctuation, drawn with tabular-number alternates) arrives as a
 *    Private Use Area code point, and the real spaces arrive as U+0000, while
 *    pdf.js sprinkles ordinary spaces inside words wherever glyphs are kerned
 *    ("Au g", "T O TAL AMO U N T D U E"). The real text only exists in
 *    /ActualText spans that pdf.js does not expose.
 *    → spaces are rebuilt from geometry, and the private-use glyphs are decoded
 *      from the document itself: the ten digits are ten consecutive code points
 *      (fonts keep 0–9 in order), and the separators are identified by how
 *      they are used inside numbers and times.
 *
 * 2. Summary figures sit in boxes ("TOTAL AMOUNT DUE" above its value, labels
 *    wrapped over two lines), so a line has to keep its column positions:
 *    each line carries `segments` with their horizontal extent.
 */

export interface PdfTextItem {
  text: string;
  /** Left edge (PDF units). */
  x: number;
  /** Baseline (PDF units, grows upwards). */
  y: number;
  width: number;
  /** Font height; used to scale the gap thresholds. */
  height: number;
}

export interface PdfTextSegment {
  text: string;
  x0: number;
  x1: number;
}

export interface PdfTextLine {
  text: string;
  /** 1-based page number. */
  page: number;
  y: number;
  /** Runs of text separated by a column-sized gap, left to right. */
  segments: PdfTextSegment[];
}

/** Items whose baselines are within this many PDF units belong to one line. */
const LINE_TOLERANCE = 2.5;
/** A document with at least this many U+0000 characters encodes its real spaces that way. */
const NUL_SPACE_MIN_COUNT = 20;
/** Gap (× font height) that starts a new column segment. */
const SEGMENT_GAP = 2;

const PUA_CLASS = '\\uE000-\\uF8FF';
const isPrivateUse = (code: number): boolean => code >= 0xe000 && code <= 0xf8ff;
const CURRENCY = '(?:₹|rs\\.?|inr|aed|usd|\\$)';
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';

interface RawSegment extends PdfTextSegment {
  y: number;
}

function buildRawLines(
  pages: readonly (readonly PdfTextItem[])[]
): Array<{ page: number; y: number; segments: RawSegment[] }> {
  let nulCount = 0;
  for (const page of pages) {
    for (const item of page) {
      for (let i = 0; i < item.text.length; i++) if (item.text.charCodeAt(i) === 0) nulCount++;
    }
  }
  // Real spaces are U+0000 → every U+0020 inside an item is a kerning artefact.
  const nulSpaces = nulCount >= NUL_SPACE_MIN_COUNT;
  const wordGap = nulSpaces ? 0.3 : 0.15;

  const lines: Array<{ page: number; y: number; segments: RawSegment[] }> = [];
  pages.forEach((page, pageIndex) => {
    const items = page
      .map((item) => ({
        ...item,
        text: nulSpaces ? item.text.replace(/ /g, '').replace(/\u0000/g, ' ') : item.text.replace(/\u0000/g, ' '),
      }))
      .filter((item) => item.text.length > 0)
      // Top-to-bottom, then left-to-right.
      .sort((a, b) => b.y - a.y || a.x - b.x);

    let row: typeof items = [];
    const flush = (): void => {
      if (row.length === 0) return;
      row.sort((a, b) => a.x - b.x);
      const segments: RawSegment[] = [];
      let current: RawSegment | null = null;
      for (const item of row) {
        const height = item.height > 0 ? item.height : 5;
        const gap: number = current ? item.x - current.x1 : 0;
        if (!current || gap > height * SEGMENT_GAP) {
          current = { text: '', x0: item.x, x1: item.x + item.width, y: row[0].y };
          segments.push(current);
        } else if (gap > height * wordGap && !current.text.endsWith(' ') && !item.text.startsWith(' ')) {
          current.text += ' ';
        }
        current.text += item.text;
        current.x1 = Math.max(current.x1, item.x + item.width);
      }
      lines.push({ page: pageIndex + 1, y: row[0].y, segments });
      row = [];
    };
    for (const item of items) {
      if (row.length > 0 && Math.abs(row[0].y - item.y) > LINE_TOLERANCE) flush();
      row.push(item);
    }
    flush();
  });
  return lines;
}

// ─── Private-use glyph decoding ──────────────────────────────────────────────

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

const escapeChar = (char: string): string => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;

/**
 * Works out what each Private Use Area character in `text` stands for and
 * returns the translation table (PUA char → real char). Characters it cannot
 * place are mapped to a space. Returns an empty map when there is nothing to do.
 */
export function privateUseGlyphMap(text: string, now: Date = new Date()): Map<string, string> {
  const counts = new Map<number, number>();
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isPrivateUse(code)) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const map = new Map<string, string>();
  if (counts.size === 0) return map;

  // ── Digits: the ten-wide run of code points that carries the most text. ──
  let best: { base: number; sum: number } | null = null;
  for (const code of counts.keys()) {
    for (let base = code - 9; base <= code; base++) {
      let sum = 0;
      for (let digit = 0; digit < 10; digit++) sum += counts.get(base + digit) ?? 0;
      if (!best || sum > best.sum) best = { base, sum };
    }
  }
  let digitBase: number | null = null;
  if (best && best.sum >= 10) {
    const used = [...counts.keys()].filter((code) => code >= best!.base && code <= best!.base + 9);
    const lowest = Math.min(...used);
    const highest = Math.max(...used);
    digitBase = best.base;
    if (highest - lowest < 9) {
      // Not every digit occurs, so the run can slide: keep the alignment that
      // turns the most "month + year" / "dd-mm-yyyy" years into plausible ones.
      const year = now.getFullYear();
      let bestScore = -1;
      for (let base = highest - 9; base <= lowest; base++) {
        const decoded = text.replace(new RegExp(`[${PUA_CLASS}]`, 'g'), (char) => {
          const digit = char.charCodeAt(0) - base;
          return digit >= 0 && digit <= 9 ? String(digit) : char;
        });
        let score = 0;
        const years = decoded.matchAll(new RegExp(`(?:${MONTH}[^0-9A-Za-z]{0,3}|\\d[^0-9A-Za-z])(\\d{4})(?!\\d)`, 'gi'));
        for (const match of years) {
          const value = Number(match[1]);
          if (value >= year - 3 && value <= year + 1) score++;
        }
        if (score > bestScore) {
          bestScore = score;
          digitBase = base;
        }
      }
    }
    for (let digit = 0; digit < 10; digit++) map.set(String.fromCharCode(digitBase + digit), String(digit));
  }

  const translate = (source: string): string =>
    source.replace(new RegExp(`[${PUA_CLASS}]`, 'g'), (char) => map.get(char) ?? char);
  let working = translate(text);
  const unknown = (): string[] =>
    [...counts.keys()].map((code) => String.fromCharCode(code)).filter((char) => !map.has(char));
  const assign = (char: string | undefined, value: string): void => {
    if (!char || map.has(char)) return;
    map.set(char, value);
    working = translate(text);
  };
  const topVote = (votes: Map<string, number>): string | undefined =>
    [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  // ── Decimal point and thousands separator: "39,272.73" — the separator
  //    before a final two-digit group differs from the ones before it. ──
  const decimalVotes = new Map<string, number>();
  const thousandsVotes = new Map<string, number>();
  for (const match of working.matchAll(new RegExp(`\\d+(?:[${PUA_CLASS}]\\d+)+`, 'g'))) {
    const separators = match[0].match(new RegExp(`[${PUA_CLASS}]`, 'g')) ?? [];
    const groups = match[0].split(new RegExp(`[${PUA_CLASS}]`));
    const last = separators[separators.length - 1];
    if (separators.length < 2 || groups[groups.length - 1].length !== 2) continue;
    if (separators.slice(0, -1).some((separator) => separator === last)) continue;
    decimalVotes.set(last, (decimalVotes.get(last) ?? 0) + 1);
    for (const separator of separators.slice(0, -1)) {
      thousandsVotes.set(separator, (thousandsVotes.get(separator) ?? 0) + 1);
    }
  }
  if (decimalVotes.size === 0) {
    // Only small amounts on the statement: "₹300.00".
    for (const match of working.matchAll(new RegExp(`${CURRENCY}\\s?\\d+([${PUA_CLASS}])\\d{2}(?!\\d)`, 'gi'))) {
      decimalVotes.set(match[1], (decimalVotes.get(match[1]) ?? 0) + 1);
    }
  }
  assign(topVote(decimalVotes), '.');
  thousandsVotes.delete([...map.entries()].find(([, value]) => value === '.')?.[0] ?? '');
  assign(topVote(thousandsVotes), ',');

  // ── Time colon: "14:38". ──
  const colonVotes = new Map<string, number>();
  for (const char of unknown()) {
    const votes = countMatches(working, new RegExp(`(?<![\\d${PUA_CLASS}])\\d{1,2}${escapeChar(char)}\\d{2}(?![\\d${PUA_CLASS}])`, 'g'));
    if (votes >= 2) colonVotes.set(char, votes);
  }
  assign(topVote(colonVotes), ':');

  // ── Plus: the sign written directly in front of a currency symbol. ──
  const plusVotes = new Map<string, number>();
  for (const char of unknown()) {
    const votes = countMatches(working, new RegExp(`${escapeChar(char)}\\s?${CURRENCY}\\s?\\d`, 'gi'));
    if (votes >= 1) plusVotes.set(char, votes);
  }
  assign(topVote(plusVotes), '+');

  // ── Hyphens: spaced between words, joining digit groups, or a leading minus. ──
  for (const char of unknown()) {
    const escaped = escapeChar(char);
    const votes =
      countMatches(working, new RegExp(` ${escaped} `, 'g')) +
      countMatches(working, new RegExp(`[0-9x]${escaped}[0-9x]`, 'gi')) +
      countMatches(working, new RegExp(`(?<=\\s)${escaped}\\d`, 'g'));
    if (votes >= 1) assign(char, '-');
  }

  // Anything else (brackets, bullets, masking stars) carries no meaning for the reader.
  for (const char of unknown()) map.set(char, ' ');
  return map;
}

/**
 * Text lines of a PDF, top to bottom, page by page, with repaired spacing and
 * decoded private-use glyphs.
 */
export function buildPdfTextLines(
  pages: readonly (readonly PdfTextItem[])[],
  now: Date = new Date()
): PdfTextLine[] {
  const raw = buildRawLines(pages);
  const glyphs = privateUseGlyphMap(
    raw.map((line) => line.segments.map((segment) => segment.text).join('  ')).join('\n'),
    now
  );
  const clean = (text: string): string => {
    const decoded =
      glyphs.size === 0
        ? text
        : text.replace(new RegExp(`[${PUA_CLASS}]`, 'g'), (char) => glyphs.get(char) ?? ' ');
    return decoded.replace(/\s+/g, ' ').trim();
  };

  const lines: PdfTextLine[] = [];
  for (const line of raw) {
    const segments = line.segments
      .map((segment) => ({ text: clean(segment.text), x0: segment.x0, x1: segment.x1 }))
      .filter((segment) => segment.text.length > 0);
    if (segments.length === 0) continue;
    lines.push({
      text: segments.map((segment) => segment.text).join(' '),
      page: line.page,
      y: line.y,
      segments,
    });
  }
  return lines;
}
