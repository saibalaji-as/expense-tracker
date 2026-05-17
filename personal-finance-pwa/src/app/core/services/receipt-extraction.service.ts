import { Injectable } from '@angular/core';
import { recognize } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { PREDEFINED_EXPENSE_TYPES } from '../models';

export interface ReceiptExtractionResult {
  rawText: string;
  amount: number | null;
  amountConfidence: number;
  amountCandidates: number[];
  lineItems: ReceiptLineItem[];
  date: string | null;
  type: string | null;
  comment: string | null;
  confidence: number;
  readable: boolean;
}

export interface ReceiptLineItem {
  name: string;
  amount: number;
  rawLine: string;
  type?: string | null;
}

interface AmountCandidate {
  value: number;
  score: number;
  line: string;
}

interface AmountExtraction {
  amount: number | null;
  confidence: number;
  candidates: number[];
}

const OCR_LANGUAGES = 'eng+tam+hin';
const MAX_PDF_PAGES_TO_SCAN = 3;
const MAX_PDF_PAGES_TO_STORE_AS_IMAGE = 4;
const PDF_RENDER_SCALE = 2.25;
const PDF_STORAGE_RENDER_SCALE = 1.2;
const PDF_STORAGE_JPEG_QUALITY = 0.72;
const OCR_TARGET_LONG_EDGE = 3400;
const OCR_MAX_LONG_EDGE = 3800;
const OCR_MAX_PIXELS = 12_000_000;

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
  'net amount', 'grand total', 'net total', 'amount payable', 'amount paid', 'total amount', 'balance due',
  'total', 'sbt', 'paid', 'மொத்தம்', 'தொகை', 'செலுத்தியது', 'कुल', 'राशि', 'भुगतान',
];

const NET_AMOUNT_KEYWORDS = ['net amount', 'net amt', 'net payable', 'net total'];
const SUBTOTAL_KEYWORDS = ['subtotal', 'sub total'];

const LOW_VALUE_KEYWORDS = [
  'tax', 'gst', 'cgst', 'sgst', 'igst', 'vat', 'discount', 'disc', 'saving', 'savings',
  'change', 'round off', 'roundoff', 'hsn', 'gst rate', 'gst amt', 'gst tin', 'tin',
  'receipt number', 'invoice no', 'bill no', 'tel', 'phone', 'mobile', 'qty', 'quantity',
];

const LINE_ITEM_SKIP_KEYWORDS = [
  ...TOTAL_KEYWORDS,
  ...LOW_VALUE_KEYWORDS,
  'subtotal', 'sub total', 'balance', 'cash', 'card', 'upi', 'visa', 'mastercard', 'payment',
  'date', 'time', 'invoice', 'receipt', 'token', 'cashier', 'counter', 'address', 'branch',
];

let pdfWorkerConfigured = false;

@Injectable({ providedIn: 'root' })
export class ReceiptExtractionService {
  async extract(file: File): Promise<ReceiptExtractionResult> {
    if (file.type === 'application/pdf') {
      return this.parse(await this.extractPdfText(file));
    }

    const canvas = await this.fileToCanvas(file);
    const preparedCanvas = this.prepareImageForOcr(canvas);
    const rawText = await this.extractImageText(preparedCanvas);
    let result = this.parse(rawText);

    if (result.amountConfidence < 0.7) {
      const bottomCanvas = this.cropCanvas(preparedCanvas, 0, Math.floor(preparedCanvas.height * 0.45), preparedCanvas.width, Math.ceil(preparedCanvas.height * 0.55));
      const bottomText = await this.extractImageText(bottomCanvas);
      const bottomResult = this.parse(`${rawText}\n${bottomText}`);
      if (bottomResult.amountConfidence > result.amountConfidence || (!result.amount && bottomResult.amount)) {
        result = bottomResult;
      }
    }

    return result;
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
    const amountResult = this.extractAmount(cleanText);
    const lineItems = readable ? this.extractLineItems(cleanText, amountResult.amount) : [];
    const date = this.extractDate(cleanText);
    const type = readable ? this.extractCategory(cleanText) : null;
    const comment = readable ? this.extractComment(cleanText, lineItems) : null;
    const amount = amountResult.amount;
    const detectedFields = [amount, date, type, comment, lineItems.length > 0 ? lineItems : null].filter(Boolean).length;
    const confidence = readable ? detectedFields / 5 : 0;

    return {
      rawText,
      amount,
      amountConfidence: amountResult.confidence,
      amountCandidates: amountResult.candidates,
      lineItems,
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
      pageTexts.push(await this.extractImageText(this.prepareImageForOcr(canvas)));
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
      const maxDimension = 3200;
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

  private prepareImageForOcr(source: HTMLCanvasElement): HTMLCanvasElement {
    const scale = this.calculateOcrScale(source.width, source.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return source;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 138));
      data[i] = contrasted;
      data[i + 1] = contrasted;
      data[i + 2] = contrasted;
    }
    context.putImageData(image, 0, 0);
    this.sharpenReceiptCanvas(canvas);

    return canvas;
  }

  private calculateOcrScale(width: number, height: number): number {
    const longEdge = Math.max(width, height);
    if (longEdge <= 0) return 1;

    let scale = Math.max(1, OCR_TARGET_LONG_EDGE / longEdge);
    scale = Math.min(scale, OCR_MAX_LONG_EDGE / longEdge);

    const scaledPixels = width * height * scale * scale;
    if (scaledPixels > OCR_MAX_PIXELS) {
      scale = Math.sqrt(OCR_MAX_PIXELS / (width * height));
    }

    return Math.max(0.5, scale);
  }

  private sharpenReceiptCanvas(canvas: HTMLCanvasElement): void {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const source = new Uint8ClampedArray(image.data);
    const data = image.data;
    const width = canvas.width;
    const height = canvas.height;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = (y * width + x) * 4;
        const top = index - width * 4;
        const bottom = index + width * 4;
        const left = index - 4;
        const right = index + 4;
        const sharpened =
          source[index] * 5 -
          source[top] -
          source[bottom] -
          source[left] -
          source[right];
        const value = Math.max(0, Math.min(255, sharpened));
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
      }
    }

    context.putImageData(image, 0, 0);
  }

  private cropCanvas(source: HTMLCanvasElement, left: number, top: number, width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const context = canvas.getContext('2d');
    if (!context) return source;

    context.drawImage(source, left, top, width, height, 0, 0, canvas.width, canvas.height);
    return canvas;
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

  private extractAmount(text: string): AmountExtraction {
    const candidates: AmountCandidate[] = [];
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

    for (const [index, line] of lines.entries()) {
      const lower = line.toLowerCase();
      const numbers = this.extractNumbers(line).filter((value) => value > 0 && value < 1_000_000);
      if (numbers.length === 0) continue;

      const hasNetAmountKeyword = NET_AMOUNT_KEYWORDS.some((keyword) => lower.includes(keyword));
      const hasTotalKeyword = TOTAL_KEYWORDS.some((keyword) => lower.includes(keyword));
      const hasSubtotalKeyword = SUBTOTAL_KEYWORDS.some((keyword) => lower.includes(keyword));
      const hasLowValueKeyword = LOW_VALUE_KEYWORDS.some((keyword) => lower.includes(keyword));
      const isBottomHalf = index >= Math.floor(lines.length * 0.5);
      const isLikelyIdentifierLine = /\b(no|number|tin|gstin|trn|tel|phone|mobile|cashier|counter|till|receipt)\b/i.test(line);
      const isPercentLine = /%/.test(line);

      for (const value of numbers) {
        const decimalPlaces = this.decimalPlaces(value);
        candidates.push({
          value,
          line,
          score:
            (hasNetAmountKeyword ? 220 : 0) +
            (hasTotalKeyword ? 100 : 10) -
            (hasSubtotalKeyword && !hasNetAmountKeyword ? 35 : 0) -
            (hasLowValueKeyword && !hasNetAmountKeyword ? 90 : 0) +
            (isBottomHalf ? 18 : 0) -
            (isLikelyIdentifierLine ? 140 : 0) -
            (isPercentLine && !hasTotalKeyword ? 80 : 0) +
            (decimalPlaces > 2 ? -150 : 0) +
            (value > 100_000 ? -120 : 0) +
            (value < 10 && !hasTotalKeyword ? -60 : 0) +
            Math.min(value / 1000, 25),
        });
      }
    }

    if (candidates.length === 0) {
      return { amount: null, confidence: 0, candidates: [] };
    }

    candidates.sort((a, b) => b.score - a.score || b.value - a.value);
    const uniqueCandidates = this.uniqueAmountCandidates(candidates);
    if (candidates[0].score < 40) {
      return { amount: null, confidence: 0, candidates: uniqueCandidates };
    }

    const best = candidates[0];
    const second = candidates.find((candidate) => Math.abs(candidate.value - best.value) >= 0.01);
    const scoreGap = second ? best.score - second.score : best.score;
    const confidence = Math.max(0.2, Math.min(0.98, (best.score / 180) + Math.max(0, scoreGap) / 160));
    return {
      amount: Number(best.value.toFixed(2)),
      confidence,
      candidates: uniqueCandidates,
    };
  }

  private uniqueAmountCandidates(candidates: AmountCandidate[]): number[] {
    const values: number[] = [];
    for (const candidate of candidates) {
      const value = Number(candidate.value.toFixed(2));
      if (values.some((existing) => Math.abs(existing - value) < 0.01)) continue;
      values.push(value);
      if (values.length >= 5) break;
    }
    return values;
  }

  private extractNumbers(line: string): number[] {
    const matches = line.match(/(?:rs\.?|inr|aed|usd|₹|\$|د\.إ)?\s*(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d{1,2})?/gi) ?? [];
    return matches
      .map((match) => match.replace(/[^\d.]/g, ''))
      .filter((match) => /^\d+(?:\.\d{1,2})?$/.test(match))
      .map((match) => Number(match))
      .filter((value) => Number.isFinite(value));
  }

  private extractLineItems(text: string, totalAmount: number | null): ReceiptLineItem[] {
    const items: ReceiptLineItem[] = [];
    const seen = new Set<string>();
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (LINE_ITEM_SKIP_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()))) continue;
      if (!/[\p{L}]/u.test(line)) continue;

      const amountMatch = this.findTrailingAmount(line);
      if (!amountMatch) continue;

      const amount = amountMatch.value;
      if (amount <= 0 || amount >= 1_000_000) continue;
      if (totalAmount && amount > totalAmount * 1.05) continue;

      const name = this.cleanLineItemName(line.slice(0, amountMatch.index));
      if (!this.isUsefulLineItemName(name)) continue;

      const key = `${name.toLowerCase()}-${amount.toFixed(2)}`;
      if (seen.has(key)) continue;

      seen.add(key);
      items.push({ name, amount: Number(amount.toFixed(2)), rawLine: line });

      if (items.length >= 20) break;
    }

    return items;
  }

  private findTrailingAmount(line: string): { value: number; index: number } | null {
    const matches = Array.from(line.matchAll(/(?:rs\.?|inr|aed|usd|₹|\$|د\.إ)?\s*(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d{1,2})?/gi));
    if (matches.length === 0) return null;

    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const match = matches[i];
      const value = Number(match[0].replace(/[^\d.]/g, ''));
      if (!Number.isFinite(value) || value <= 0) continue;
      const after = line.slice((match.index ?? 0) + match[0].length).trim();
      if (after && /[\p{L}]/u.test(after)) continue;
      return { value, index: match.index ?? 0 };
    }

    return null;
  }

  private cleanLineItemName(name: string): string {
    return name
      .replace(/(?:rs\.?|inr|aed|usd|₹|\$|د\.إ)/gi, ' ')
      .replace(/\b\d+(?:\.\d{1,3})?\s*(?:x|×|qty|pcs?|nos?|kg|g|ltr|l|ml)\b/gi, ' ')
      .replace(/\b(?:x|×)\s*\d+(?:\.\d{1,3})?\b/gi, ' ')
      .replace(/\b\d{1,3}(?:\.\d{1,2})?\b/g, ' ')
      .replace(/[^\p{L}\p{N}&.,'()/-]+/gu, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 60);
  }

  private isUsefulLineItemName(name: string): boolean {
    if (name.length < 3) return false;
    if (!/[\p{L}]/u.test(name)) return false;
    if (this.printableRatio(name) < 0.75) return false;
    const lower = name.toLowerCase();
    return !LINE_ITEM_SKIP_KEYWORDS.some((keyword) => lower === keyword || lower.includes(`${keyword}:`));
  }

  private decimalPlaces(value: number): number {
    const [, decimals = ''] = String(value).split('.');
    return decimals.length;
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

  private extractComment(text: string, lineItems: ReceiptLineItem[]): string | null {
    if (lineItems.length > 0) {
      const summary = lineItems
        .slice(0, 8)
        .map((item) => `${item.name} - ${item.amount.toFixed(2)}`)
        .join('; ');
      const suffix = lineItems.length > 8 ? `; +${lineItems.length - 8} more` : '';
      return `Items: ${summary}${suffix}`;
    }

    return this.extractMerchantComment(text);
  }

  private extractMerchantComment(text: string): string | null {
    const ignoredWords = [
      'invoice', 'receipt', 'bill', 'tax', 'gst', 'total', 'cash', 'card', 'date', 'time',
      'phone', 'mobile', 'address', 'product', 'qty', 'amount', 'price', 'hold slip',
      'counter', 'cashier', 'trn', 'tel',
    ];
    const lines = text
      .split('\n')
      .map((line) => this.cleanCommentLine(line))
      .filter((line) => line.length >= 3 && line.length <= 60)
      .filter((line) => !/^\d+$/.test(line))
      .filter((line) => /[\p{L}]/u.test(line))
      .filter((line) => this.printableRatio(line) >= 0.75)
      .filter((line) => !ignoredWords.some((word) => line.toLowerCase().includes(word)));

    const merchant = lines[0] ?? null;
    return merchant ? `Bill: ${merchant}` : null;
  }

  private cleanCommentLine(line: string): string {
    return line
      .replace(/[^\p{L}\p{N}&.,'()/-]+/gu, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private printableRatio(line: string): number {
    const chars = Array.from(line);
    if (chars.length === 0) return 0;
    const printable = chars.filter((char) => /[\p{L}\p{N}\s&.,'()/-]/u.test(char)).length;
    return printable / chars.length;
  }
}
