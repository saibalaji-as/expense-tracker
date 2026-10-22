import { buildPdfTextLines, PdfTextItem, privateUseGlyphMap } from './pdf-text-lines';

/**
 * Builds pdf.js-style items the way a Chromium-printed statement delivers them:
 * digits and punctuation as Private Use Area glyphs (one item each), real
 * spaces as U+0000, and letter runs as one item with a stray kerning space.
 */
const DIGIT_BASE = 0xe071;
const PUNCTUATION: Record<string, number> = { ',': 0xe093, '.': 0xe094, ':': 0xee47, '-': 0xee55, '+': 0xee6a, '(': 0xee48, ')': 0xee49 };
const CHAR_WIDTH = 3;

function glyphCells(y: number, cells: Array<{ x: number; text: string }>, height = 5): PdfTextItem[] {
  const items: PdfTextItem[] = [];
  for (const cell of cells) {
    let x = cell.x;
    let letters = '';
    let lettersX = x;
    const flushLetters = (): void => {
      if (!letters) return;
      // pdf.js inserts a stray space inside kerned words.
      const text = letters.length > 2 ? `${letters.slice(0, 2)} ${letters.slice(2)}` : letters;
      items.push({ text, x: lettersX, y, width: letters.length * CHAR_WIDTH, height });
      letters = '';
    };
    for (const char of cell.text) {
      const special = /\d/.test(char)
        ? String.fromCharCode(DIGIT_BASE + Number(char))
        : char === ' '
          ? '\u0000'
          : PUNCTUATION[char] !== undefined
            ? String.fromCharCode(PUNCTUATION[char])
            : null;
      if (special === null) {
        if (!letters) lettersX = x;
        letters += char;
      } else {
        flushLetters();
        items.push({ text: special, x, y, width: CHAR_WIDTH, height });
      }
      x += CHAR_WIDTH;
    }
    flushLetters();
  }
  return items;
}

const NOW = new Date('2026-10-02T12:00:00');

/** Enough real spaces (U+0000) for the document to be recognised as Chromium-style. */
const filler = (): PdfTextItem[] =>
  glyphCells(700, [{ x: 30, text: 'a b c d e f g h i j k l m n o p q r s t u v w x y z' }]);

describe('buildPdfTextLines — Chromium-printed statements', () => {
  const page: PdfTextItem[] = [
    ...filler(),
    ...glyphCells(600, [{ x: 30, text: 'OPENING BALANCE' }, { x: 200, text: 'TOTAL AMOUNT DUE' }]),
    ...glyphCells(585, [{ x: 30, text: '₹39,272.73' }, { x: 200, text: '₹36,600.17' }]),
    ...glyphCells(500, [
      { x: 30, text: '06 Aug 2026, 14:38' },
      { x: 200, text: 'Landmark Fuel Station' },
      { x: 420, text: '+1' },
      { x: 520, text: '₹300.00' },
    ]),
    ...glyphCells(480, [
      { x: 30, text: '19 Aug 2026, 00:00' },
      { x: 200, text: 'Payment received - UPI' },
      { x: 520, text: '+₹1,234.50' },
    ]),
    ...glyphCells(460, [{ x: 30, text: '07 Sept 2025, 09:05' }, { x: 200, text: 'Card(s) 442144-xxxxxx-7918' }, { x: 520, text: '₹18.00' }]),
  ];
  const lines = buildPdfTextLines([page], NOW);
  const text = lines.map((line) => line.text);

  it('decodes digits, separators, time colons, signs and hyphens', () => {
    expect(text).toContain('₹39,272.73 ₹36,600.17');
    expect(text).toContain('06 Aug 2026, 14:38 Landmark Fuel Station +1 ₹300.00');
    expect(text).toContain('19 Aug 2026, 00:00 Payment received - UPI +₹1,234.50');
    expect(text).toContain('07 Sept 2025, 09:05 Card s 442144-xxxxxx-7918 ₹18.00');
  });

  it('removes kerning spaces and rebuilds real ones', () => {
    expect(text).toContain('OPENING BALANCE TOTAL AMOUNT DUE');
    expect(text.some((line) => /Lan dm|Pa ym|OP EN/.test(line))).toBe(false);
  });

  it('leaves no private-use or NUL characters behind', () => {
    expect(text.some((line) => /[-\u0000]/.test(line))).toBe(false);
  });

  it('keeps column segments with their positions', () => {
    const row = lines.find((line) => line.text.startsWith('06 Aug'))!;
    expect(row.segments.map((segment) => segment.text)).toEqual(['06 Aug 2026, 14:38', 'Landmark Fuel Station', '+1', '₹300.00']);
    expect(row.segments[0].x0).toBe(30);
    expect(row.segments[3].x0).toBe(520);
    expect(row.page).toBe(1);
  });
});

describe('privateUseGlyphMap', () => {
  const glyph = (digit: number): string => String.fromCharCode(DIGIT_BASE + digit);
  const encode = (value: string): string =>
    [...value].map((char) => (/\d/.test(char) ? glyph(Number(char)) : char === '.' ? '' : char === ',' ? '' : char)).join('');

  it('aligns the digit run by the year when not every digit occurs', () => {
    // Only 0, 2 and 6 occur: the run could slide, the year pins it.
    const map = privateUseGlyphMap(`Statement Date ${encode('2')} Aug ${encode('2026')}\n${encode('20')} Aug ${encode('2026')}\n${encode('22')} Aug ${encode('2026')}`, NOW);
    expect(map.get(glyph(0))).toBe('0');
    expect(map.get(glyph(2))).toBe('2');
    expect(map.get(glyph(6))).toBe('6');
  });

  it('identifies the decimal point from currency amounts when no thousands separator exists', () => {
    const map = privateUseGlyphMap(`₹${encode('300.00')} ₹${encode('45.10')} ₹${encode('789.26')} ₹${encode('13.48')}`, NOW);
    expect(map.get('')).toBe('.');
  });

  it('returns an empty map for ordinary text', () => {
    expect(privateUseGlyphMap('12/09/2026 SWIGGY 450.00', NOW).size).toBe(0);
  });

  it('does not treat a handful of private-use icons as digits', () => {
    const map = privateUseGlyphMap(' Home  Settings', NOW);
    expect(map.get('')).toBe(' ');
    expect([...map.values()].some((value) => /\d/.test(value))).toBe(false);
  });
});

describe('buildPdfTextLines — ordinary PDFs', () => {
  const item = (text: string, x: number, y: number, width: number): PdfTextItem => ({ text, x, y, width, height: 9 });

  it('keeps item text as it is and joins runs on one baseline', () => {
    const lines = buildPdfTextLines([
      [
        item('12/09/2026', 40, 500, 50),
        item(' ', 90, 500, 3),
        item('SWIGGY BANGALORE', 93, 500, 90),
        item('450.00', 500, 500, 30),
        item('Page 1 of 3', 40, 480.5, 50),
        item('Total', 300, 481.5, 22),
      ],
    ]);
    expect(lines.map((line) => line.text)).toEqual(['12/09/2026 SWIGGY BANGALORE 450.00', 'Page 1 of 3 Total']);
    expect(lines[0].segments.map((segment) => segment.text)).toEqual(['12/09/2026 SWIGGY BANGALORE', '450.00']);
  });

  it('separates words that are different items a normal space apart', () => {
    const lines = buildPdfTextLines([[item('AMAZON', 40, 500, 40), item('PAY', 82.5, 500, 18)]]);
    expect(lines[0].text).toBe('AMAZON PAY');
  });

  it('orders pages and lines top to bottom', () => {
    const lines = buildPdfTextLines([[item('second', 40, 300, 30), item('first', 40, 700, 25)], [item('third', 40, 700, 25)]]);
    expect(lines.map((line) => [line.page, line.text])).toEqual([[1, 'first'], [1, 'second'], [2, 'third']]);
  });
});
