import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../../environments/environment';
import { AiSettingsService } from './ai-settings.service';
import { ReceiptExtractionResult } from './receipt-extraction.service';

interface AiReceiptExtractionResponse {
  provider: 'gemini';
  extraction: ReceiptExtractionResult;
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
    await this.aiSettingsService.load();
    if (this.aiSettingsService.isDisabled()) return null;

    const userGeminiKey = await this.aiSettingsService.getActiveGeminiKey();
    if (!userGeminiKey) return null;

    const maxInlineSize = 5 * 1024 * 1024;
    if (file.size > maxInlineSize) {
      console.info('[AiReceiptExtractionService] Receipt too large for AI extraction; using local OCR.');
      return null;
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
        return null;
      }

      const result = await response.json() as AiReceiptExtractionResponse;
      return result.provider === 'gemini' && result.extraction?.readable ? result.extraction : null;
    } catch (error) {
      console.info('[AiReceiptExtractionService] Falling back to local receipt OCR:', error);
      return null;
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
