import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AiSettingsService } from './ai-settings.service';

export interface AiVoiceExpensePayload {
  transcript: string;
  locale: string;
  currency: string;
  categories: string[];
  today: string;
}

export interface AiVoiceExpenseResult {
  provider: 'gemini';
  model?: string;
  expense: {
    rawText: string;
    amount: number | null;
    date: string | null;
    type: string | null;
    comment: string | null;
    confidence: number;
    readable: boolean;
  };
}

export interface AiVoiceExpenseAttempt {
  expense: AiVoiceExpenseResult['expense'] | null;
  fallbackReason: string | null;
  usedGemini: boolean;
}

@Injectable({ providedIn: 'root' })
export class AiVoiceExpenseService {
  private readonly aiSettingsService = inject(AiSettingsService);

  async parse(
    context: AiVoiceExpensePayload
  ): Promise<AiVoiceExpenseAttempt> {
    await this.aiSettingsService.load();
    if (this.aiSettingsService.isDisabled()) {
      return { expense: null, fallbackReason: 'AI is off in Settings.', usedGemini: false };
    }

    const userGeminiKey = await this.aiSettingsService.getActiveGeminiKey();
    if (!userGeminiKey) {
      return { expense: null, fallbackReason: 'No Gemini API key is active.', usedGemini: false };
    }

    const transcript = context.transcript.trim();
    if (!transcript) {
      return { expense: null, fallbackReason: 'No voice transcript was captured.', usedGemini: false };
    }

    try {
      const response = await fetch(`${this.functionsBaseUrl()}/parseVoiceExpense`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gemini-Api-Key': userGeminiKey,
        },
        body: JSON.stringify({ ...context, transcript }),
      });

      if (!response.ok) {
        const detail = await response.text();
        console.info('[AiVoiceExpenseService] AI voice parsing unavailable:', response.status, detail);
        return { expense: null, fallbackReason: `Gemini voice parsing failed with HTTP ${response.status}.`, usedGemini: false };
      }

      const result = await response.json() as AiVoiceExpenseResult;
      if (result.provider === 'gemini' && result.expense?.readable) {
        return { expense: result.expense, fallbackReason: null, usedGemini: true };
      }

      return { expense: null, fallbackReason: 'Gemini could not find expense details in the voice note.', usedGemini: false };
    } catch (error) {
      console.info('[AiVoiceExpenseService] Could not reach Gemini voice parsing service:', error);
      return { expense: null, fallbackReason: 'Could not reach Gemini voice parsing service.', usedGemini: false };
    }
  }

  private functionsBaseUrl(): string {
    return environment.firebaseFunctionsUrl;
  }
}
