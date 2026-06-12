import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AiSettingsService } from './ai-settings.service';
import { AuthService } from './auth.service';

export interface VoiceReminderResult {
  type: 'datetime' | 'location';
  title: string;
  remindAt: string | null;
  locationName: string | null;
  ambiguous: boolean;
  clarification: string | null;
}

export interface VoiceReminderAttempt {
  reminder: VoiceReminderResult | null;
  fallbackReason: string | null;
  transcript: string;
}

@Injectable({ providedIn: 'root' })
export class AiVoiceReminderService {
  private readonly aiSettingsService = inject(AiSettingsService);
  private readonly authService = inject(AuthService);

  async parse(transcript: string): Promise<VoiceReminderAttempt> {
    await this.aiSettingsService.load();

    if (this.aiSettingsService.isDisabled()) {
      return { reminder: null, fallbackReason: 'AI is off in Settings.', transcript };
    }

    const isHosted = this.aiSettingsService.isHosted();
    const userGeminiKey = isHosted ? null : await this.aiSettingsService.getActiveGeminiKey();
    if (!isHosted && !userGeminiKey) {
      return { reminder: null, fallbackReason: 'No Gemini API key is active.', transcript };
    }

    const cleaned = transcript.trim();
    if (!cleaned) {
      return { reminder: null, fallbackReason: 'No voice transcript was captured.', transcript };
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (userGeminiKey) headers['X-Gemini-Api-Key'] = userGeminiKey;
      const idToken = await this.authService.getFirebaseIdToken();
      if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

      const nowIso = new Date().toISOString();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

      const response = await fetch(`${environment.firebaseFunctionsUrl}/parseVoiceReminder`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ transcript: cleaned, nowIso, timezone }),
      });

      if (!response.ok) {
        const detail = await response.text();
        console.info('[AiVoiceReminderService] AI reminder parsing failed:', response.status, detail);
        return { reminder: null, fallbackReason: `AI reminder parsing failed (HTTP ${response.status}).`, transcript };
      }

      const result = await response.json() as { reminder: VoiceReminderResult };
      return { reminder: result.reminder ?? null, fallbackReason: null, transcript };
    } catch (error) {
      console.info('[AiVoiceReminderService] Could not reach AI service:', error);
      return { reminder: null, fallbackReason: 'Could not reach AI reminder parsing service.', transcript };
    }
  }
}
