import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../../environments/environment';
import { AiSettingsService } from './ai-settings.service';
import { ReceiptExtractionResult } from './receipt-extraction.service';

interface AiReceiptExtractionResponse {
  provider: 'gemini';
  extraction: ReceiptExtractionResult;
}

export interface AiReceiptExtractionAttempt {
  extraction: ReceiptExtractionResult | null;
  fallbackReason: string | null;
  usedGemini: boolean;
}

export interface AiReceiptExtractionPayload {
  fileName: string;
  mimeType: string;
  dataBase64: string;
  locale: string;
  currency: string;
  categories: string[];
}

@Injectable({ providedIn: 'root' })
export class AiReceiptExtractionService {
  private readonly aiSettingsService = inject(AiSettingsService);

  async extract(
    file: File,
    context: Pick<AiReceiptExtractionPayload, 'locale' | 'currency' | 'categories'>
  ): Promise<ReceiptExtractionResult | null> {
    const attempt = await this.extractWithStatus(file, context);
    return attempt.extraction;
  }

  async extractWithStatus(
    file: File,
    context: Pick<AiReceiptExtractionPayload, 'locale' | 'currency' | 'categories'>
  ): Promise<AiReceiptExtractionAttempt> {
    await this.aiSettingsService.load();
    if (this.aiSettingsService.isDisabled()) {
      return { extraction: null, fallbackReason: 'AI is off in Settings.', usedGemini: false };
    }

    const userGeminiKey = await this.aiSettingsService.getActiveGeminiKey();
    if (!userGeminiKey) {
      return { extraction: null, fallbackReason: 'No Gemini API key is active.', usedGemini: false };
    }

    const maxInlineSize = 5 * 1024 * 1024;
    if (file.size > maxInlineSize) {
      console.info('[AiReceiptExtractionService] Receipt too large for AI extraction; using local OCR.');
      return { extraction: null, fallbackReason: 'Bill file is too large for Gemini inline extraction.', usedGemini: false };
    }

    try {
      const response = await fetch(`${this.functionsBaseUrl()}/extract-receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gemini-Api-Key': userGeminiKey,
        },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataBase64: await this.fileToBase64(file),
          ...context,
        } satisfies AiReceiptExtractionPayload),
      });

      if (!response.ok) {
        const detail = await response.text();
        console.info('[AiReceiptExtractionService] AI receipt extraction unavailable:', response.status, detail);
        return { extraction: null, fallbackReason: `Gemini extraction failed with HTTP ${response.status}.`, usedGemini: false };
      }

      const result = await response.json() as AiReceiptExtractionResponse;
      if (result.provider === 'gemini' && result.extraction?.readable) {
        return { extraction: result.extraction, fallbackReason: null, usedGemini: true };
      }

      return { extraction: null, fallbackReason: 'Gemini could not read this bill clearly.', usedGemini: false };
    } catch (error) {
      console.info('[AiReceiptExtractionService] Falling back to local receipt OCR:', error);
      return { extraction: null, fallbackReason: 'Could not reach Gemini extraction service.', usedGemini: false };
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? '');
        const [, base64 = ''] = dataUrl.split(',');
        base64 ? resolve(base64) : reject(new Error('Could not read receipt file.'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('Could not read receipt file.'));
      reader.readAsDataURL(file);
    });
  }

  private functionsBaseUrl(): string {
    return Capacitor.isNativePlatform()
      ? environment.netlifyFunctionsUrl
      : '/.netlify/functions';
  }
}
