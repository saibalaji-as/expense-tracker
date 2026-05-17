import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../../environments/environment';
import { AiSettingsService } from './ai-settings.service';
import { StorageService } from './storage.service';

export type InsightTone = 'good' | 'warn' | 'info';
export type InsightIcon = 'check-circle-2' | 'alert-triangle' | 'lightbulb' | 'clock-3' | 'sparkles';
export type AiInsightProvider = 'gemini' | 'local';

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
  dailyTrend: Array<{
    date: string;
    amount: number;
    entryCount: number;
  }>;
  categoryChanges: Array<{
    category: string;
    current: number;
    previous: number;
    delta: number;
    percentChange: number | null;
  }>;
  repeatedExpenses: Array<{
    type: string;
    amount: number;
    count: number;
    total: number;
  }>;
  spendingPattern: {
    highestDay: { date: string; amount: number } | null;
    weekendTotal: number;
    weekdayTotal: number;
    smallPurchaseCount: number;
    largePurchaseThreshold: number;
    largePurchaseCount: number;
  };
  partnerActivity: Array<{
    actor: string;
    total: number;
    count: number;
  }>;
}

export interface AiInsightResult {
  provider: AiInsightProvider;
  sections: AiInsightSection[];
}

interface AiInsightCache {
  dateKey: string;
  callCount: number;
  cachedAt: number;
  signature: AiInsightSignature;
  result: AiInsightResult;
}

interface AiInsightSignature {
  totalSpent: number;
  entryCount: number;
  monthForecast: number;
  categoryKey: string;
  dailyKey: string;
}

interface AiInsightUsage {
  dateKey: string;
  callCount: number;
}

@Injectable({ providedIn: 'root' })
export class AiInsightService {
  private readonly storageService = inject(StorageService);
  private readonly aiSettingsService = inject(AiSettingsService);
  private readonly cacheKey = 'ai_weekly_insight_cache_v1';
  private readonly usageKey = 'ai_weekly_insight_usage_v1';
  private readonly maxCallsPerDay = 2;
  private readonly cacheTtlMs = 12 * 60 * 60 * 1000;
  private readonly staleCacheTtlMs = 7 * 24 * 60 * 60 * 1000;

  async generateWeeklyInsights(payload: AiInsightPayload): Promise<AiInsightResult | null> {
    await this.aiSettingsService.load();
    if (this.aiSettingsService.isDisabled()) {
      return null;
    }

    const userGeminiKey = await this.aiSettingsService.getActiveGeminiKey();
    if (!userGeminiKey) {
      return null;
    }

    const cache = await this.getCache();
    const signature = this.signatureFor(payload);
    const todayKey = this.todayKey();
    const usage = await this.getUsage(todayKey);

    if (cache?.result.sections.length) {
      const cacheAge = Date.now() - cache.cachedAt;
      if (cacheAge < this.cacheTtlMs && !this.hasMeaningfulChange(cache.signature, signature)) {
        return cache.result;
      }

      if (usage.callCount >= this.maxCallsPerDay) {
        return cacheAge < this.staleCacheTtlMs ? cache.result : null;
      }
    } else if (usage.callCount >= this.maxCallsPerDay) {
      return null;
    }

    try {
      const nextCallCount = usage.callCount + 1;
      await this.setUsage({ dateKey: todayKey, callCount: nextCallCount });

      const response = await fetch(`${this.functionsBaseUrl()}/generate-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gemini-Api-Key': userGeminiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const detail = await response.text();
        console.info('[AiInsightService] AI insights unavailable:', response.status, detail);
        return null;
      }

      const result = await response.json() as AiInsightResult;
      if (result.provider !== 'gemini' || !Array.isArray(result.sections) || result.sections.length === 0) {
        return cache?.result.sections.length && Date.now() - cache.cachedAt < this.staleCacheTtlMs
          ? cache.result
          : null;
      }

      await this.setCache({
        dateKey: todayKey,
        callCount: nextCallCount,
        cachedAt: Date.now(),
        signature,
        result,
      });
      return result;
    } catch (error) {
      console.info('[AiInsightService] Falling back to local insights:', error);
      return cache?.result.sections.length && Date.now() - cache.cachedAt < this.staleCacheTtlMs
        ? cache.result
        : null;
    }
  }

  private functionsBaseUrl(): string {
    return Capacitor.isNativePlatform()
      ? environment.netlifyFunctionsUrl
      : '/.netlify/functions';
  }

  private async getCache(): Promise<AiInsightCache | null> {
    const json = await this.storageService.get(this.cacheKey);
    if (!json) return null;

    try {
      const cache = JSON.parse(json) as AiInsightCache;
      if (!cache.result?.sections?.length || !cache.signature || !cache.cachedAt) return null;
      return cache;
    } catch {
      await this.storageService.remove(this.cacheKey);
      return null;
    }
  }

  private async setCache(cache: AiInsightCache): Promise<void> {
    await this.storageService.set(this.cacheKey, JSON.stringify(cache));
  }

  private async getUsage(todayKey: string): Promise<AiInsightUsage> {
    const json = await this.storageService.get(this.usageKey);
    if (!json) return { dateKey: todayKey, callCount: 0 };

    try {
      const usage = JSON.parse(json) as AiInsightUsage;
      return usage.dateKey === todayKey ? usage : { dateKey: todayKey, callCount: 0 };
    } catch {
      await this.storageService.remove(this.usageKey);
      return { dateKey: todayKey, callCount: 0 };
    }
  }

  private async setUsage(usage: AiInsightUsage): Promise<void> {
    await this.storageService.set(this.usageKey, JSON.stringify(usage));
  }

  private signatureFor(payload: AiInsightPayload): AiInsightSignature {
    return {
      totalSpent: Math.round(payload.totalSpent),
      entryCount: payload.entryCount,
      monthForecast: Math.round(payload.monthForecast),
      categoryKey: this.compactKey(payload.categoryTotals),
      dailyKey: payload.dailyTrend
        .map((item) => `${item.date}:${Math.round(item.amount)}:${item.entryCount}`)
        .join('|'),
    };
  }

  private compactKey(values: Record<string, number>): string {
    return Object.entries(values)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${Math.round(value)}`)
      .join('|');
  }

  private hasMeaningfulChange(previous: AiInsightSignature, next: AiInsightSignature): boolean {
    const spendDelta = Math.abs(next.totalSpent - previous.totalSpent);
    const forecastDelta = Math.abs(next.monthForecast - previous.monthForecast);
    const spendThreshold = Math.max(250, Math.round(previous.totalSpent * 0.1));
    const forecastThreshold = Math.max(500, Math.round(previous.monthForecast * 0.08));

    return spendDelta >= spendThreshold
      || forecastDelta >= forecastThreshold
      || Math.abs(next.entryCount - previous.entryCount) >= 3;
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
