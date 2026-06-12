import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AiSettingsService } from './ai-settings.service';
import { AuthService } from './auth.service';

export interface AiVoiceExpensePayload {
  transcript: string;
  locale: string;
  currency: string;
  categories: string[];
  today: string;
}

export interface AiVoiceExpenseResult {
  provider: 'gemini' | 'groq';
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
  private readonly authService = inject(AuthService);

  async parse(
    context: AiVoiceExpensePayload
  ): Promise<AiVoiceExpenseAttempt> {
    await this.aiSettingsService.load();
    if (this.aiSettingsService.isDisabled()) {
      return { expense: null, fallbackReason: 'AI is off in Settings.', usedGemini: false };
    }

    const isHosted = this.aiSettingsService.isHosted();
    const userGeminiKey = isHosted ? null : await this.aiSettingsService.getActiveGeminiKey();
    if (!isHosted && !userGeminiKey) {
      return { expense: null, fallbackReason: 'No Gemini API key is active.', usedGemini: false };
    }

    const transcript = context.transcript.trim();
    if (!transcript) {
      return { expense: null, fallbackReason: 'No voice transcript was captured.', usedGemini: false };
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (userGeminiKey) headers['X-Gemini-Api-Key'] = userGeminiKey;
      // Hosted AI requires a signed-in user — the server validates this token.
      const idToken = await this.authService.getFirebaseIdToken();
      if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

      const response = await fetch(`${this.functionsBaseUrl()}/parseVoiceExpense`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...context, transcript }),
      });

      if (!response.ok) {
        const detail = await response.text();
        console.info('[AiVoiceExpenseService] AI voice parsing unavailable:', response.status, detail);
        return { expense: null, fallbackReason: `AI voice parsing failed with HTTP ${response.status}.`, usedGemini: false };
      }

      const result = await response.json() as AiVoiceExpenseResult;
      if (result.expense?.readable) {
        return { expense: result.expense, fallbackReason: null, usedGemini: true };
      }

      return { expense: null, fallbackReason: 'AI could not find expense details in the voice note.', usedGemini: false };
    } catch (error) {
      console.info('[AiVoiceExpenseService] Could not reach AI voice parsing service:', error);
      return { expense: null, fallbackReason: 'Could not reach AI voice parsing service.', usedGemini: false };
    }
  }

  private functionsBaseUrl(): string {
    return environment.firebaseFunctionsUrl;
  }
}
