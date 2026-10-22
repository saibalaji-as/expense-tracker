import { Injectable } from '@angular/core';
import { loadPdfJs } from '../utils/pdf-js';
import { buildPdfTextLines, type PdfTextItem, type PdfTextLine } from '../utils/pdf-text-lines';

/** The PDF is password-protected: `incorrect` is true when a password was tried and rejected. */
export class StatementPdfPasswordError extends Error {
  constructor(readonly incorrect: boolean) {
    super(incorrect ? 'Incorrect PDF password.' : 'This PDF needs a password.');
    this.name = 'StatementPdfPasswordError';
  }
}

const MAX_STATEMENT_PDF_BYTES = 15 * 1024 * 1024;
const MAX_STATEMENT_PDF_PAGES = 40;

/**
 * Turns a bank statement PDF into text lines, entirely on-device (pdf.js via
 * loadPdfJs, shared with receipts). Nothing is uploaded and nothing is stored.
 *
 * pdf.js only hands back positioned text items; core/utils/pdf-text-lines.ts
 * turns them into lines (repairing web-printed statements whose digits arrive
 * as private-use glyphs) and core/utils/card-statement-pdf.ts reads those.
 */
@Injectable({ providedIn: 'root' })
export class CardStatementPdfService {
  async readLines(file: File, password?: string): Promise<PdfTextLine[]> {
    if (file.size > MAX_STATEMENT_PDF_BYTES) {
      throw new Error('This PDF is larger than 15 MB.');
    }
    const pdfjsLib = await loadPdfJs();

    const data = new Uint8Array(await file.arrayBuffer());
    let pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;
    try {
      pdf = await pdfjsLib.getDocument({ data, ...(password ? { password } : {}) }).promise;
    } catch (error) {
      if (error instanceof Error && error.name === 'PasswordException') {
        // pdf.js: code 1 = password needed, code 2 = wrong password.
        throw new StatementPdfPasswordError((error as Error & { code?: number }).code === 2);
      }
      throw error;
    }

    try {
      const pages: PdfTextItem[][] = [];
      const pageCount = Math.min(pdf.numPages, MAX_STATEMENT_PDF_PAGES);
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const items: PdfTextItem[] = [];
        for (const item of content.items) {
          if (!('str' in item) || item.str === '') continue;
          items.push({
            text: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height || Math.abs(item.transform[3]),
          });
        }
        pages.push(items);
      }
      return buildPdfTextLines(pages);
    } finally {
      await pdf.destroy();
    }
  }
}
