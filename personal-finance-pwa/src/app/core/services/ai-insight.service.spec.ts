import { Injector, runInInjectionContext } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./ai-settings.service', () => ({
  AiSettingsService: class AiSettingsService {},
}));

import {
  AiInsightPayload,
  AiInsightResult,
  AiInsightService,
} from './ai-insight.service';
import { AiSettingsService } from './ai-settings.service';
import { StorageService } from './storage.service';

const CACHE_KEY = 'ai_weekly_insight_cache_v1';
const USAGE_KEY = 'ai_weekly_insight_usage_v2';

class MockStorageService {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

class MockAiSettingsService {
  readonly load = vi.fn(async () => undefined);
  readonly getActiveGeminiKey = vi.fn(async () => 'gemini-key');

  isDisabled(): boolean {
    return false;
  }
}

function payload(overrides: Partial<AiInsightPayload> = {}): AiInsightPayload {
  return {
    period: 'week',
    mode: 'hybrid-deep-dive',
    locale: 'en',
    currency: 'INR',
    monthlyIncome: 50000,
    totalSpent: 1000,
    previousPeriodTotal: 800,
    delta: 200,
    entryCount: 2,
    monthForecast: 4000,
    categoryTotals: { Food: 1000 },
    budgetUsage: [{ category: 'Food', spent: 1000, limit: 3000, percent: 33 }],
    topExpenses: [
      { date: '2026-05-19', amount: 600, type: 'Food' },
      { date: '2026-05-20', amount: 400, type: 'Food' },
    ],
    dailyTrend: [
      { date: '2026-05-14', amount: 0, entryCount: 0 },
      { date: '2026-05-15', amount: 0, entryCount: 0 },
      { date: '2026-05-16', amount: 0, entryCount: 0 },
      { date: '2026-05-17', amount: 0, entryCount: 0 },
      { date: '2026-05-18', amount: 0, entryCount: 0 },
      { date: '2026-05-19', amount: 600, entryCount: 1 },
      { date: '2026-05-20', amount: 400, entryCount: 1 },
    ],
    categoryChanges: [{ category: 'Food', current: 1000, previous: 800, delta: 200, percentChange: 25 }],
    repeatedExpenses: [],
    spendingPattern: {
      highestDay: { date: '2026-05-19', amount: 600 },
      weekendTotal: 0,
      weekdayTotal: 1000,
      smallPurchaseCount: 0,
      largePurchaseThreshold: 1000,
      largePurchaseCount: 0,
    },
    partnerActivity: [{ actor: 'You', total: 1000, count: 2 }],
    ...overrides,
  };
}

function geminiResult(title: string): AiInsightResult {
  return {
    provider: 'gemini',
    sections: [
      {
        label: 'Summary',
        title,
        detail: 'Insight detail',
        tone: 'info',
        icon: 'sparkles',
      },
    ],
  };
}

describe('AiInsightService', () => {
  let service: AiInsightService;
  let storage: MockStorageService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as AiInsightPayload;
      return {
        ok: true,
        json: async () => geminiResult(`Fresh insight ${body.locale}`),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const injector = Injector.create({
      providers: [
        { provide: StorageService, useClass: MockStorageService },
        { provide: AiSettingsService, useClass: MockAiSettingsService },
      ],
    });

    service = runInInjectionContext(injector, () => new AiInsightService());
    storage = injector.get(StorageService) as unknown as MockStorageService;
  });

  it('reuses cached Gemini insight when the insight input is unchanged', async () => {
    const first = await service.generateWeeklyInsightsWithSource(payload());
    expect(first.source).toBe('gemini');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const cache = JSON.parse(storage.values.get(CACHE_KEY) ?? '{}');
    cache.cachedAt = Date.now() - (3 * 24 * 60 * 60 * 1000);
    storage.values.set(CACHE_KEY, JSON.stringify(cache));

    const second = await service.generateWeeklyInsightsWithSource(payload());
    expect(second.source).toBe('cache');
    expect(second.result?.sections[0]?.title).toBe('Fresh insight en');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('calls Gemini again when the expense-derived insight input changes', async () => {
    await service.generateWeeklyInsightsWithSource(payload());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await service.generateWeeklyInsightsWithSource(payload({
      totalSpent: 1001,
      delta: 201,
      categoryTotals: { Food: 1001 },
      topExpenses: [
        { date: '2026-05-19', amount: 601, type: 'Food' },
        { date: '2026-05-20', amount: 400, type: 'Food' },
      ],
      dailyTrend: [
        { date: '2026-05-14', amount: 0, entryCount: 0 },
        { date: '2026-05-15', amount: 0, entryCount: 0 },
        { date: '2026-05-16', amount: 0, entryCount: 0 },
        { date: '2026-05-17', amount: 0, entryCount: 0 },
        { date: '2026-05-18', amount: 0, entryCount: 0 },
        { date: '2026-05-19', amount: 601, entryCount: 1 },
        { date: '2026-05-20', amount: 400, entryCount: 1 },
      ],
      categoryChanges: [{ category: 'Food', current: 1001, previous: 800, delta: 201, percentChange: 25 }],
      spendingPattern: {
        highestDay: { date: '2026-05-19', amount: 601 },
        weekendTotal: 0,
        weekdayTotal: 1001,
        smallPurchaseCount: 0,
        largePurchaseThreshold: 1000,
        largePurchaseCount: 0,
      },
      partnerActivity: [{ actor: 'You', total: 1001, count: 2 }],
    }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('calls Gemini again when only the requested insight language changes', async () => {
    await service.generateWeeklyInsightsWithSource(payload({ locale: 'en-IN' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await service.generateWeeklyInsightsWithSource(payload({ locale: 'ta-IN' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not show a saved response from a previous language when the daily limit is reached', async () => {
    await service.generateWeeklyInsightsWithSource(payload({ locale: 'en-IN' }));

    storage.values.set(USAGE_KEY, JSON.stringify({
      dateKey: new Date().toISOString().slice(0, 10),
      callCount: 2,
      localeCounts: { 'ta-IN': 2 },
    }));

    const result = await service.generateWeeklyInsightsWithSource(payload({ locale: 'ta-IN' }));

    expect(result.source).toBe('none');
    expect(result.result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps separate cached responses when switching languages', async () => {
    const english = await service.generateWeeklyInsightsWithSource(payload({ locale: 'en-IN' }));
    const tamil = await service.generateWeeklyInsightsWithSource(payload({ locale: 'ta-IN' }));
    const englishAgain = await service.generateWeeklyInsightsWithSource(payload({ locale: 'en-IN' }));

    expect(english.source).toBe('gemini');
    expect(tamil.source).toBe('gemini');
    expect(englishAgain.source).toBe('cache');
    expect(englishAgain.result?.sections[0]?.title).toBe('Fresh insight en-IN');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not let another language daily limit block a fresh call', async () => {
    await service.generateWeeklyInsightsWithSource(payload({ locale: 'ta-IN' }));

    storage.values.set(USAGE_KEY, JSON.stringify({
      dateKey: new Date().toISOString().slice(0, 10),
      callCount: 2,
      localeCounts: { 'ta-IN': 2 },
    }));

    const english = await service.generateWeeklyInsightsWithSource(payload({ locale: 'en-IN' }));

    expect(english.source).toBe('gemini');
    expect(english.result?.sections[0]?.title).toBe('Fresh insight en-IN');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
