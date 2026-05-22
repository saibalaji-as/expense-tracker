import { Injectable, inject, signal } from '@angular/core';
import { AiReceiptExtractionService } from './ai-receipt-extraction.service';
import { CurrencyService } from './currency.service';
import { I18nService } from './i18n.service';
import { ReceiptExtractionResult, ReceiptExtractionService } from './receipt-extraction.service';

@Injectable({ providedIn: 'root' })
export class ReceiptExtractionSessionService {
  private readonly aiReceiptExtractionService = inject(AiReceiptExtractionService);
  private readonly receiptExtractionService = inject(ReceiptExtractionService);
  private readonly i18n = inject(I18nService);
  private readonly currencyService = inject(CurrencyService);

  readonly selectedFile = signal<File | null>(null);
  readonly extraction = signal<ReceiptExtractionResult | null>(null);
  readonly extractionError = signal<string | null>(null);
  readonly extractionApplied = signal(false);
  readonly extractionSource = signal<'gemini' | 'local' | null>(null);
  readonly extractionFallbackReason = signal<string | null>(null);
  readonly extracting = signal(false);

  private runId = 0;

  clear(): void {
    this.runId += 1;
    this.selectedFile.set(null);
    this.extraction.set(null);
    this.extractionError.set(null);
    this.extractionApplied.set(false);
    this.extractionSource.set(null);
    this.extractionFallbackReason.set(null);
    this.extracting.set(false);
  }

  setSelectedFile(file: File): void {
    this.selectedFile.set(file);
  }

  resetExtractionState(): void {
    this.extraction.set(null);
    this.extractionError.set(null);
    this.extractionApplied.set(false);
    this.extractionSource.set(null);
    this.extractionFallbackReason.set(null);
  }

  markExtractionApplied(): void {
    this.extractionApplied.set(true);
  }

  async startExtraction(file: File, categories: string[]): Promise<void> {
    const runId = ++this.runId;
    this.selectedFile.set(file);
    this.resetExtractionState();
    this.extracting.set(true);

    try {
      const extraction = await this.extractWithAiFallback(file, categories);
      if (runId !== this.runId) return;

      if (!extraction.readable) {
        this.extraction.set(null);
        this.extractionError.set(this.i18n.t('daily.receipt.smartFill.unreadable'));
        return;
      }

      this.extraction.set(extraction);
    } catch (error) {
      if (runId !== this.runId) return;
      console.warn('[ReceiptExtractionSession] Receipt smart extraction failed:', error);
      this.extractionError.set(this.i18n.t('daily.receipt.smartFill.failed'));
    } finally {
      if (runId === this.runId) {
        this.extracting.set(false);
      }
    }
  }

  private async extractWithAiFallback(
    file: File,
    categories: string[]
  ): Promise<ReceiptExtractionResult> {
    const aiAttempt = await this.aiReceiptExtractionService.extractWithStatus(file, {
      locale: this.i18n.locale(),
      currency: this.currencyService.currency(),
      categories,
    });

    if (aiAttempt.extraction?.readable) {
      this.extractionSource.set('gemini');
      this.extractionFallbackReason.set(null);
      return aiAttempt.extraction;
    }

    const localExtraction = await this.receiptExtractionService.extract(file);
    this.extractionSource.set('local');
    this.extractionFallbackReason.set(aiAttempt.fallbackReason);
    return localExtraction;
  }
}
