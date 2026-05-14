import { Injectable } from '@angular/core';
import { recognize } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { PREDEFINED_EXPENSE_TYPES } from '../models';

export interface ReceiptExtractionResult {
  rawText: string;
  amount: number | null;
  date: string | null;
  type: string | null;
  comment: string | null;
  confidence: number;
  readable: boolean;
}

interface AmountCandidate {
  value: number;
  score: number;
}

const OCR_LANGUAGES = 'eng+tam+hin';
const MAX_PDF_PAGES_TO_SCAN = 3;
const MAX_PDF_PAGES_TO_STORE_AS_IMAGE = 4;
const PDF_RENDER_SCALE = 1.6;
const PDF_STORAGE_RENDER_SCALE = 1.2;
const PDF_STORAGE_JPEG_QUALITY = 0.72;

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food & Groceries': [
    'grocery', 'groceries', 'supermarket', 'hypermarket', 'mart', 'provision', 'vegetable',
    'fruit', 'milk', 'bakery', 'bigbasket', 'dmart', 'more', 'reliance fresh', 'மளிகை',
    'காய்கறி', 'பால்', 'किराना', 'सब्जी', 'दूध',
  ],
  'Dining Out': [
    'restaurant', 'cafe', 'coffee', 'tea', 'hotel', 'mess', 'kitchen', 'biryani', 'pizza',
    'burger', 'swiggy', 'zomato', 'ubereats', 'dining', 'உணவகம்', 'காபி', 'ஹோட்டல்',
    'रेस्टोरेंट', 'कैफे', 'चाय',
  ],
  Transportation: [
    'fuel', 'petrol', 'diesel', 'uber', 'ola', 'taxi', 'metro', 'bus', 'train', 'parking',
    'toll', 'transport', 'பேருந்து', 'ரயில்', 'பெட்ரோல்', 'डीजल', 'टैक्सी', 'मेट्रो',
  ],
  Utilities: [
    'electricity', 'water bill', 'gas bill', 'broadband', 'internet', 'mobile recharge',
    'airtel', 'jio', 'vi ', 'bsnl', 'utility', 'மின்சாரம்', 'தண்ணீர்', 'ரீசார்ஜ்',
    'बिजली', 'पानी', 'रिचार्ज',
  ],
  Healthcare: [
    'pharmacy', 'medical', 'hospital', 'clinic', 'doctor', 'medicine', 'apollo pharmacy',
    'medplus', 'மருந்து', 'மருத்துவம்', 'மருத்துவர்', 'दवा', 'अस्पताल', 'क्लिनिक',
  ],
  'Shopping/Clothing': [
    'shopping', 'apparel', 'fashion', 'clothing', 'textile', 'garments', 'amazon',
    'flipkart', 'myntra', 'ajio', 'store', 'retail', 'ஆடை', 'துணி', 'கடை', 'कपड़े',
    'खरीदारी',
  ],
  'Personal Care': [
    'salon', 'spa', 'beauty', 'cosmetic', 'barber', 'parlour', 'personal care',
    'சலூன்', 'அழகு', 'सैलून', 'ब्यूटी',
  ],
  Entertainment: [
    'movie', 'cinema', 'ticket', 'bookmyshow', 'game', 'bowling', 'theatre', 'திரை',
    'सिनेमा', 'फिल्म',
  ],
  Education: [
    'school', 'college', 'course', 'tuition', 'book store', 'stationery', 'education',
    'பள்ளி', 'கல்லூரி', 'புத்தகம்', 'स्कूल', 'कॉलेज', 'किताब',
  ],
  Subscriptions: [
    'subscription', 'netflix', 'prime video', 'spotify', 'hotstar', 'youtube premium',
    'renewal', 'சந்தா', 'सब्सक्रिप्शन',
  ],
};

const TOTAL_KEYWORDS = [
  'grand total', 'net total', 'amount payable', 'amount paid', 'total amount', 'balance due',
  'total', 'paid', 'மொத்தம்', 'தொகை', 'செலுத்தியது', 'कुल', 'राशि', 'भुगतान',
];

const LOW_VALUE_KEYWORDS = [
  'subtotal', 'sub total', 'tax', 'gst', 'cgst', 'sgst', 'igst', 'vat', 'discount',
  'change', 'round off', 'roundoff',
];

let pdfWorkerConfigured = false;

@Injectable({ providedIn: 'root' })
export class ReceiptExtractionService {
  async extract(file: File): Promise<ReceiptExtractionResult> {
    const rawText = file.type === 'application/pdf'
      ? await this.extractPdfText(file)
      : await this.extractImageText(await this.fileToCanvas(file));

    return this.parse(rawText);
  }

  async convertPdfToCompressedImage(file: File): Promise<File> {
    this.configurePdfWorker();
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;

    try {
      if (pdf.numPages > MAX_PDF_PAGES_TO_STORE_AS_IMAGE) {
        throw new Error(`PDF has ${pdf.numPages} pages; keeping original to avoid losing bill pages.`);
      }

      const renderedPages: HTMLCanvasElement[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: PDF_STORAGE_RENDER_SCALE });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Could not prepare PDF page for storage.');
        }

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        renderedPages.push(canvas);
      }

      const combinedCanvas = this.combineCanvases(renderedPages);
      const blob = await this.canvasToJpegBlob(combinedCanvas, PDF_STORAGE_JPEG_QUALITY);
      const baseName = file.name.replace(/\.[^.]+$/, '');
      return new File([blob], `${baseName}-compressed.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    } finally {
      await pdf.destroy();
    }
  }

  parse(rawText: string): ReceiptExtractionResult {
    const cleanText = this.normalizeText(rawText);
    const readable = this.hasReadableText(cleanText);
    const amount = this.extractAmount(cleanText);
    const date = this.extractDate(cleanText);
    const type = readable ? this.extractCategory(cleanText) : null;
    const comment = readable ? this.extractMerchantComment(cleanText) : null;
    const detectedFields = [amount, date, type, comment].filter(Boolean).length;
    const confidence = readable ? detectedFields / 4 : 0;

    return {
      rawText,
      amount,
      date,
      type,
      comment,
      confidence,
      readable: readable && detectedFields > 0,
    };
  }

  private async extractPdfText(file: File): Promise<string> {
    this.configurePdfWorker();
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES_TO_SCAN);
    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const embeddedText = textContent.items
        .map((item) => 'str' in item ? item.str : '')
        .join('\n')
        .trim();

      if (embeddedText.length > 30) {
        pageTexts.push(embeddedText);
        continue;
      }

      const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) continue;

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      pageTexts.push(await this.extractImageText(canvas));
    }

    await pdf.destroy();
    return pageTexts.join('\n');
  }

  private async extractImageText(canvas: HTMLCanvasElement): Promise<string> {
    const result = await recognize(canvas, OCR_LANGUAGES, {
      logger: (message) => {
        if (message.status === 'recognizing text') {
          console.debug('[ReceiptExtraction] OCR progress:', Math.round(message.progress * 100));
        }
      },
    });

    return result.data.text ?? '';
  }

  private combineCanvases(canvases: HTMLCanvasElement[]): HTMLCanvasElement {
    if (canvases.length === 0) {
      throw new Error('No PDF pages were rendered.');
    }

    const gap = 24;
    const padding = 24;
    const width = Math.max(...canvases.map((canvas) => canvas.width)) + padding * 2;
    const height = canvases.reduce((total, canvas) => total + canvas.height, padding * 2 + gap * (canvases.length - 1));
    const combined = document.createElement('canvas');
    combined.width = width;
    combined.height = height;

    const context = combined.getContext('2d');
    if (!context) {
      throw new Error('Could not combine PDF pages.');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);

    let top = padding;
    for (const canvas of canvases) {
      const left = Math.round((width - canvas.width) / 2);
      context.drawImage(canvas, left, top);
      top += canvas.height + gap;
    }

    return combined;
  }

  private canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Could not compress receipt image.'));
        }
      }, 'image/jpeg', quality);
    });
  }

  private configurePdfWorker(): void {
    if (pdfWorkerConfigured) return;

    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).toString();
    pdfWorkerConfigured = true;
  }

  private async fileToCanvas(file: File): Promise<HTMLCanvasElement> {
    const bitmap = await createImageBitmap(file);
    try {
      const maxDimension = 2200;
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not prepare receipt image for OCR.');
      }

      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally {
      bitmap.close();
    }
  }

  private normalizeText(rawText: string): string {
    return rawText
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private hasReadableText(text: string): boolean {
    const lettersAndDigits = text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
    const wordLikeTokens = text.match(/[\p{L}\p{N}]{2,}/gu)?.length ?? 0;
    return lettersAndDigits >= 12 && wordLikeTokens >= 3;
  }

  private extractAmount(text: string): number | null {
    const candidates: AmountCandidate[] = [];
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

    for (const line of lines) {
      const lower = line.toLowerCase();
      const numbers = this.extractNumbers(line).filter((value) => value > 0 && value < 10_000_000);
      if (numbers.length === 0) continue;

      const hasTotalKeyword = TOTAL_KEYWORDS.some((keyword) => lower.includes(keyword));
      const hasLowValueKeyword = LOW_VALUE_KEYWORDS.some((keyword) => lower.includes(keyword));

      for (const value of numbers) {
        candidates.push({
          value,
          score: (hasTotalKeyword ? 100 : 10) - (hasLowValueKeyword ? 70 : 0) + Math.min(value / 1000, 25),
        });
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score || b.value - a.value);
    return Number(candidates[0].value.toFixed(2));
  }

  private extractNumbers(line: string): number[] {
    const matches = line.match(/(?:rs\.?|inr|aed|usd|₹|\$|د\.إ)?\s*\d{1,3}(?:[,\s]\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/gi) ?? [];
    return matches
      .map((match) => Number(match.replace(/[^\d.]/g, '')))
      .filter((value) => Number.isFinite(value));
  }

  private extractDate(text: string): string | null {
    const numericDate = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
    if (numericDate) {
      return this.toIsoDate(numericDate[1], numericDate[2], numericDate[3]);
    }

    const isoDate = text.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);
    if (isoDate) {
      return this.toIsoDate(isoDate[3], isoDate[2], isoDate[1]);
    }

    const namedDate = text.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(20\d{2}|\d{2})\b/i);
    if (namedDate) {
      const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        .indexOf(namedDate[2].slice(0, 3).toLowerCase()) + 1;
      return this.toIsoDate(namedDate[1], String(monthIndex), namedDate[3]);
    }

    return null;
  }

  private toIsoDate(dayText: string, monthText: string, yearText: string): string | null {
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText.length === 2 ? `20${yearText}` : yearText);
    if (!day || !month || !year || day > 31 || month > 12) return null;

    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return date.toISOString().slice(0, 10);
  }

  private extractCategory(text: string): string | null {
    const lower = text.toLowerCase();
    let bestType: string | null = null;
    let bestScore = 0;

    for (const type of PREDEFINED_EXPENSE_TYPES) {
      const keywords = CATEGORY_KEYWORDS[type] ?? [type.toLowerCase()];
      const score = keywords.reduce((total, keyword) => {
        return total + (lower.includes(keyword.toLowerCase()) ? keyword.length : 0);
      }, 0);

      if (score > bestScore) {
        bestType = type;
        bestScore = score;
      }
    }

    return bestType ?? 'Miscellaneous';
  }

  private extractMerchantComment(text: string): string | null {
    const ignoredWords = [
      'invoice', 'receipt', 'bill', 'tax', 'gst', 'total', 'cash', 'card', 'date', 'time',
      'phone', 'mobile', 'address',
    ];
    const lines = text
      .split('\n')
      .map((line) => line.trim().replace(/\s{2,}/g, ' '))
      .filter((line) => line.length >= 3 && line.length <= 60)
      .filter((line) => !/^\d+$/.test(line))
      .filter((line) => !ignoredWords.some((word) => line.toLowerCase().includes(word)));

    const merchant = lines[0] ?? null;
    return merchant ? `Bill: ${merchant}` : null;
  }
}
