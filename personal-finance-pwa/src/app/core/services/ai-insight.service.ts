import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../../environments/environment';

export type InsightTone = 'good' | 'warn' | 'info';
export type InsightIcon = 'check-circle-2' | 'alert-triangle' | 'lightbulb' | 'clock-3' | 'sparkles';
export type AiInsightProvider = 'gemini';

export interface AiInsightSection {
  label: string;
  title: string;
  detail: string;
  tone: InsightTone;
  icon: InsightIcon;
}

export interface AiInsightPayload {
  period: 'week';
  locale: string;
  currency: string;
  totalSpent: number;
  previousPeriodTotal: number;
  delta: number;
  entryCount: number;
  monthForecast: number;
  categoryTotals: Record<string, number>;
  budgetUsage: Array<{
    category: string;
    spent: number;
    limit: number;
    percent: number;
  }>;
  topExpenses: Array<{
    date: string;
    amount: number;
    type: string;
  }>;
}

export interface AiInsightResult {
  provider: AiInsightProvider;
  sections: AiInsightSection[];
}

@Injectable({ providedIn: 'root' })
export class AiInsightService {
  async generateWeeklyInsights(payload: AiInsightPayload): Promise<AiInsightResult | null> {
    try {
      const response = await fetch(`${this.functionsBaseUrl()}/generate-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.info('[AiInsightService] AI insights unavailable:', response.status);
        return null;
      }

      const result = await response.json() as AiInsightResult;
      if (result.provider !== 'gemini' || !Array.isArray(result.sections) || result.sections.length === 0) {
        return null;
      }

      return result;
    } catch (error) {
      console.info('[AiInsightService] Falling back to local insights:', error);
      return null;
    }
  }

  private functionsBaseUrl(): string {
    return Capacitor.isNativePlatform()
      ? environment.netlifyFunctionsUrl
      : '/.netlify/functions';
  }
}
