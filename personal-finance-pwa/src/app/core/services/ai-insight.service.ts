import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AiSettingsService } from './ai-settings.service';
import { StorageService } from './storage.service';

export type InsightTone = 'good' | 'warn' | 'info';
export type InsightIcon = 'check-circle-2' | 'alert-triangle' | 'lightbulb' | 'clock-3' | 'sparkles';
export type AiInsightProvider = 'gemini' | 'groq' | 'local';

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

export type AiInsightResultSource = 'cache' | 'gemini' | 'none' | 'rate-limit';
export type AiInsightAvailability = 'ready' | 'missing-key';

export interface AiInsightResponse {
  result: AiInsightResult | null;
  source: AiInsightResultSource;
  retryAfter?: string;
}

interface AiInsightCache {
  dateKey: string;
  callCount: number;
  cachedAt: number;
  signature: AiInsightSignature;
  result: AiInsightResult;
}

interface AiInsightCacheStore {
  version: 2;
  entries: AiInsightCache[];
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
  localeCallCount?: number;
  totalCallCount?: number;
  localeCounts?: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class AiInsightService {
  private readonly storageService = inject(StorageService);
  private readonly aiSettingsService = inject(AiSettingsService);
  private readonly cacheKey = 'ai_weekly_insight_cache_v1';
  private readonly usageKey = 'ai_weekly_insight_usage_v2';
  private readonly maxCallsPerLocalePerDay = 2;
  private readonly maxTotalCallsPerDay = 5;
  private readonly maxCacheEntries = 12;
  private readonly staleCacheTtlMs = 7 * 24 * 60 * 60 * 1000;

  async generateWeeklyInsights(payload: AiInsightPayload): Promise<AiInsightResult | null> {
    return (await this.generateWeeklyInsightsWithSource(payload)).result;
  }

  async getReusableCachedWeeklyInsights(payload: AiInsightPayload): Promise<AiInsightResult | null> {
    await this.aiSettingsService.load();
    if (this.aiSettingsService.isDisabled()) return null;
    // Hosted mode: always has AI. User-key mode: requires a key.
    if (!this.aiSettingsService.isHosted()) {
      const userGeminiKey = await this.aiSettingsService.getActiveGeminiKey();
      if (!userGeminiKey) return null;
    }

    const cacheEntries = await this.getCacheEntries();
    const signature = this.signatureFor(payload);
    return this.reusableCacheResult(cacheEntries, signature);
  }

  async getAvailability(): Promise<AiInsightAvailability> {
    await this.aiSettingsService.load();
    if (this.aiSettingsService.isDisabled()) return 'missing-key';
    if (this.aiSettingsService.isHosted()) return 'ready';

    const userGeminiKey = await this.aiSettingsService.getActiveGeminiKey();
    return userGeminiKey ? 'ready' : 'missing-key';
  }

  async clearWeeklyInsightState(): Promise<void> {
    await Promise.all([
      this.storageService.remove(this.cacheKey),
      this.storageService.remove(this.usageKey),
    ]);
  }

  async generateWeeklyInsightsWithSource(payload: AiInsightPayload): Promise<AiInsightResponse> {
    await this.aiSettingsService.load();
    if (this.aiSettingsService.isDisabled()) return { result: null, source: 'none' };

    const isHosted = this.aiSettingsService.isHosted();
    const userGeminiKey = isHosted ? null : await this.aiSettingsService.getActiveGeminiKey();
    if (!isHosted && !userGeminiKey) return { result: null, source: 'none' };

    const cacheEntries = await this.getCacheEntries();
    const signature = this.signatureFor(payload);
    const todayKey = this.todayKey();
    const usage = await this.getUsage(todayKey, signature.locale);
    const reusableCachedResult = this.reusableCacheResult(cacheEntries, signature);

    if (reusableCachedResult) {
      return { result: reusableCachedResult, source: 'cache' };
    }

    const fallbackCache = this.fallbackCacheResult(cacheEntries, signature);
    if (
      (usage.localeCallCount ?? usage.callCount) >= this.maxCallsPerLocalePerDay
      || (usage.totalCallCount ?? usage.callCount) >= this.maxTotalCallsPerDay
    ) {
      return fallbackCache
        ? { result: fallbackCache.result, source: 'cache' }
        : { result: null, source: 'rate-limit', retryAfter: this.nextDailyResetLabel() };
    }

    try {
      const nextLocaleCallCount = (usage.localeCallCount ?? usage.callCount) + 1;
      await this.setUsage(todayKey, signature.locale, nextLocaleCallCount);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (userGeminiKey) headers['X-Gemini-Api-Key'] = userGeminiKey;

      const response = await fetch(`${this.functionsBaseUrl()}/generateInsights`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const detail = await this.parseFailureResponse(response);
        console.info('[AiInsightService] AI insights unavailable:', response.status, detail);
        if (response.status === 429 || detail.code === 'RATE_LIMIT' || this.isRateLimitMessage(detail.message)) {
          return {
            result: null,
            source: 'rate-limit',
            retryAfter: detail.retryAfter ?? this.nextDailyResetLabel(),
          };
        }
        return { result: null, source: 'none' };
      }

      const result = await response.json() as AiInsightResult;
      if (!(['gemini', 'groq'] as AiInsightProvider[]).includes(result.provider) || !Array.isArray(result.sections) || result.sections.length === 0) {
        return fallbackCache
          ? { result: fallbackCache.result, source: 'cache' }
          : { result: null, source: 'none' };
      }

      await this.setCacheEntry({
        dateKey: todayKey,
        callCount: nextLocaleCallCount,
        cachedAt: Date.now(),
        signature,
        result,
      });
      return { result, source: 'gemini' };
    } catch (error) {
      console.info('[AiInsightService] Falling back to local insights:', error);
      return fallbackCache
        ? { result: fallbackCache.result, source: 'cache' }
        : { result: null, source: 'none' };
    }
  }

  private functionsBaseUrl(): string {
    return environment.firebaseFunctionsUrl;
  }

  private async parseFailureResponse(response: Response): Promise<{ code?: string; message: string; retryAfter?: string }> {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { code?: unknown; error?: unknown; message?: unknown; detail?: unknown; retryAfter?: unknown };
      return {
        code: typeof parsed.code === 'string' ? parsed.code : undefined,
        message: String(parsed.message ?? parsed.error ?? parsed.detail ?? text),
        retryAfter: typeof parsed.retryAfter === 'string' ? parsed.retryAfter : undefined,
      };
    } catch {
      return { message: text };
    }
  }

  private isRateLimitMessage(message: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes('rate limit')
      || normalized.includes('quota')
      || normalized.includes('resource_exhausted')
      || normalized.includes('too many requests');
  }

  private nextDailyResetLabel(): string {
    const reset = new Date();
    reset.setHours(24, 0, 0, 0);
    return reset.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  private async getCacheEntries(): Promise<AiInsightCache[]> {
    const json = await this.storageService.get(this.cacheKey);
    if (!json) return [];

    try {
      const parsed = JSON.parse(json) as unknown;
      if (this.isCacheStore(parsed)) {
        return parsed.entries.filter((entry) => this.isValidCacheEntry(entry));
      }

      return this.isValidCacheEntry(parsed) ? [parsed] : [];
    } catch {
      await this.storageService.remove(this.cacheKey);
      return [];
    }
  }

  private async setCacheEntry(cache: AiInsightCache): Promise<void> {
    const now = Date.now();
    const existing = await this.getCacheEntries();
    const entries = [
      cache,
      ...existing.filter((entry) => !this.hasSameInsightInput(entry.signature, cache.signature)),
    ]
      .filter((entry) => now - entry.cachedAt < this.staleCacheTtlMs)
      .sort((a, b) => b.cachedAt - a.cachedAt)
      .slice(0, this.maxCacheEntries);

    await this.storageService.set(this.cacheKey, JSON.stringify({ version: 2, entries } satisfies AiInsightCacheStore));
  }

  private async getUsage(todayKey: string, locale: string): Promise<AiInsightUsage> {
    const json = await this.storageService.get(this.usageKey);
    if (!json) return { dateKey: todayKey, callCount: 0, localeCallCount: 0, totalCallCount: 0, localeCounts: {} };

    try {
      const usage = JSON.parse(json) as AiInsightUsage;
      if (usage.dateKey !== todayKey) return { dateKey: todayKey, callCount: 0, localeCallCount: 0, totalCallCount: 0, localeCounts: {} };

      const localeCounts = usage.localeCounts ?? (usage.callCount > 0 ? { [locale]: usage.callCount } : {});
      const localeCount = localeCounts[locale] ?? 0;
      const totalCount = Object.values(localeCounts).reduce((total, count) => total + count, 0);
      return {
        dateKey: todayKey,
        callCount: totalCount,
        localeCallCount: localeCount,
        totalCallCount: totalCount,
        localeCounts,
      };
    } catch {
      await this.storageService.remove(this.usageKey);
      return { dateKey: todayKey, callCount: 0, localeCallCount: 0, totalCallCount: 0, localeCounts: {} };
    }
  }

  private async setUsage(todayKey: string, locale: string, callCount: number): Promise<void> {
    const current = await this.getUsage(todayKey, locale);
    await this.storageService.set(this.usageKey, JSON.stringify({
      dateKey: todayKey,
      callCount: Object.values({ ...current.localeCounts, [locale]: callCount })
        .reduce((total, count) => total + count, 0),
      localeCallCount: callCount,
      totalCallCount: Object.values({ ...current.localeCounts, [locale]: callCount })
        .reduce((total, count) => total + count, 0),
      localeCounts: {
        ...current.localeCounts,
        [locale]: callCount,
      },
    } satisfies AiInsightUsage));
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
    entries: AiInsightCache[],
    signature: AiInsightSignature
  ): AiInsightResult | null {
    return entries.find((entry) => this.hasSameInsightInput(entry.signature, signature))?.result ?? null;
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

  private fallbackCacheResult(
    entries: AiInsightCache[],
    signature: AiInsightSignature
  ): AiInsightCache | null {
    const now = Date.now();
    return entries
      .filter((entry) =>
        entry.signature.locale === signature.locale
        && now - entry.cachedAt < this.staleCacheTtlMs
      )
      .sort((a, b) => b.cachedAt - a.cachedAt)[0] ?? null;
  }

  private isCacheStore(value: unknown): value is AiInsightCacheStore {
    if (!value || typeof value !== 'object') return false;
    const store = value as AiInsightCacheStore;
    return store.version === 2 && Array.isArray(store.entries);
  }

  private isValidCacheEntry(value: unknown): value is AiInsightCache {
    if (!value || typeof value !== 'object') return false;
    const cache = value as AiInsightCache;
    return !!cache.signature
      && typeof cache.signature.locale === 'string'
      && typeof cache.cachedAt === 'number'
      && Array.isArray(cache.result?.sections)
      && cache.result.sections.length > 0;
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
