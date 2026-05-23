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
  mode?: 'hybrid-deep-dive';
  locale: string;
  currency: string;
  monthlyIncome: number;
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
  recentDailyTrend?: Array<{
    date: string;
    totals: Record<string, number>;
    total: number;
    entryCount: number;
  }>;
  categoryBaselines?: Array<{
    category: string;
    current: number;
    average: number;
    zScore: number | null;
    sampleWeeks: number;
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
  budgetIntent?: Array<{
    category: string;
    group: string;
    targetPercent: number;
    actualPercent: number;
    monthlySpent: number;
    monthlyLimit: number;
  }>;
  monthlySeasonality?: Array<{
    month: string;
    total: number;
    categories: Record<string, number>;
  }>;
  whatIfCuts?: Array<{
    category: string;
    group: string;
    monthlySpent: number;
    cutPercent: number;
    monthlySavings: number;
    revisedMonthForecast: number;
  }>;
}

export interface AiInsightResult {
  provider: AiInsightProvider;
  sections: AiInsightSection[];
}

export type AiInsightResultSource = 'cache' | 'gemini' | 'none';
export type AiInsightAvailability = 'ready' | 'missing-key';

export interface AiInsightResponse {
  result: AiInsightResult | null;
  source: AiInsightResultSource;
}

interface AiInsightCache {
  dateKey: string;
  callCount: number;
  cachedAt: number;
  signature: AiInsightSignature;
  result: AiInsightResult;
}

interface AiInsightSignature {
  dataKey?: string;
  locale: string;
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
  private readonly usageKey = 'ai_weekly_insight_usage_v2';
  private readonly maxCallsPerDay = 2;
  private readonly staleCacheTtlMs = 7 * 24 * 60 * 60 * 1000;

  async generateWeeklyInsights(payload: AiInsightPayload): Promise<AiInsightResult | null> {
    return (await this.generateWeeklyInsightsWithSource(payload)).result;
  }

  async getReusableCachedWeeklyInsights(payload: AiInsightPayload): Promise<AiInsightResult | null> {
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
    return this.reusableCacheResult(cache, signature);
  }

  async getAvailability(): Promise<AiInsightAvailability> {
    await this.aiSettingsService.load();
    if (this.aiSettingsService.isDisabled()) {
      return 'missing-key';
    }

    const userGeminiKey = await this.aiSettingsService.getActiveGeminiKey();
    return userGeminiKey ? 'ready' : 'missing-key';
  }

  async generateWeeklyInsightsWithSource(payload: AiInsightPayload): Promise<AiInsightResponse> {
    await this.aiSettingsService.load();
    if (this.aiSettingsService.isDisabled()) {
      return { result: null, source: 'none' };
    }

    const userGeminiKey = await this.aiSettingsService.getActiveGeminiKey();
    if (!userGeminiKey) {
      return { result: null, source: 'none' };
    }

    const cache = await this.getCache();
    const signature = this.signatureFor(payload);
    const todayKey = this.todayKey();
    const usage = await this.getUsage(todayKey);
    const reusableCachedResult = this.reusableCacheResult(cache, signature);

    if (reusableCachedResult) {
      return { result: reusableCachedResult, source: 'cache' };
    }

    if (cache?.result.sections.length) {
      const cacheAge = Date.now() - cache.cachedAt;

      if (usage.callCount >= this.maxCallsPerDay) {
        return cacheAge < this.staleCacheTtlMs && this.canUseFallbackCache(cache, signature)
          ? { result: cache.result, source: 'cache' }
          : { result: null, source: 'none' };
      }
    } else if (usage.callCount >= this.maxCallsPerDay) {
      return { result: null, source: 'none' };
    }

    try {
      const nextCallCount = usage.callCount + 1;

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
        return { result: null, source: 'none' };
      }

      const result = await response.json() as AiInsightResult;
      if (result.provider !== 'gemini' || !Array.isArray(result.sections) || result.sections.length === 0) {
        return cache?.result.sections.length
          && Date.now() - cache.cachedAt < this.staleCacheTtlMs
          && this.canUseFallbackCache(cache, signature)
          ? { result: cache.result, source: 'cache' }
          : { result: null, source: 'none' };
      }

      await this.setCache({
        dateKey: todayKey,
        callCount: nextCallCount,
        cachedAt: Date.now(),
        signature,
        result,
      });
      await this.setUsage({ dateKey: todayKey, callCount: nextCallCount });
      return { result, source: 'gemini' };
    } catch (error) {
      console.info('[AiInsightService] Falling back to local insights:', error);
      return cache?.result.sections.length
        && Date.now() - cache.cachedAt < this.staleCacheTtlMs
        && this.canUseFallbackCache(cache, signature)
        ? { result: cache.result, source: 'cache' }
        : { result: null, source: 'none' };
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
      dataKey: this.stableStringify(this.normalizeForSignature(payload)),
      locale: payload.locale,
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

  private reusableCacheResult(
    cache: AiInsightCache | null,
    signature: AiInsightSignature
  ): AiInsightResult | null {
    if (!cache?.result.sections.length) return null;
    return this.hasSameInsightInput(cache.signature, signature) ? cache.result : null;
  }

  private hasSameInsightInput(previous: AiInsightSignature, next: AiInsightSignature): boolean {
    if (previous.dataKey && next.dataKey) {
      return previous.dataKey === next.dataKey;
    }

    return previous.locale === next.locale
      && previous.totalSpent === next.totalSpent
      && previous.entryCount === next.entryCount
      && previous.monthForecast === next.monthForecast
      && previous.categoryKey === next.categoryKey
      && previous.dailyKey === next.dailyKey;
  }

  private canUseFallbackCache(
    cache: AiInsightCache | null,
    signature: AiInsightSignature
  ): cache is AiInsightCache {
    if (!cache?.result.sections.length) return false;
    return cache.signature.locale === signature.locale;
  }

  private normalizeForSignature(value: unknown): unknown {
    if (typeof value === 'number') {
      return Number(value.toFixed(2));
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeForSignature(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, this.normalizeForSignature(item)])
      );
    }

    return value;
  }

  private stableStringify(value: unknown): string {
    return JSON.stringify(value);
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
