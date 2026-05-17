import type { Handler, HandlerEvent } from '@netlify/functions';

type InsightTone = 'good' | 'warn' | 'info';

interface AiReceiptPayload {
  fileName?: string;
  mimeType?: string;
  dataBase64?: string;
  locale?: string;
  currency?: string;
  categories?: string[];
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
  };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

interface GeminiError {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface ExtractedLineItem {
  name: string;
  amount: number;
  type?: string | null;
}

interface ExtractedReceipt {
  merchant?: string | null;
  amount?: number | null;
  amountConfidence?: number;
  amountCandidates?: number[];
  lineItems?: ExtractedLineItem[];
  date?: string | null;
  type?: string | null;
  comment?: string | null;
  confidence?: number;
  readable?: boolean;
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Gemini-Api-Key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const DEFAULT_GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const GEMINI_API_VERSION = 'v1beta';
const MAX_BASE64_LENGTH = 7_000_000;
const FALLBACK_CATEGORIES = ['Food & Groceries', 'Dining Out', 'Transportation', 'Utilities', 'Healthcare', 'Shopping/Clothing', 'Education', 'Subscriptions', 'Miscellaneous'];
const RECEIPT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING', nullable: true },
    amount: { type: 'NUMBER', nullable: true },
    amountConfidence: { type: 'NUMBER' },
    amountCandidates: { type: 'ARRAY', items: { type: 'NUMBER' } },
    lineItems: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          amount: { type: 'NUMBER' },
          type: { type: 'STRING', nullable: true },
        },
        required: ['name', 'amount'],
      },
    },
    date: { type: 'STRING', nullable: true },
    type: { type: 'STRING', nullable: true },
    comment: { type: 'STRING', nullable: true },
    confidence: { type: 'NUMBER' },
    readable: { type: 'BOOLEAN' },
  },
  required: ['amount', 'amountConfidence', 'amountCandidates', 'lineItems', 'date', 'type', 'comment', 'confidence', 'readable'],
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = event.headers['x-gemini-api-key'] ?? event.headers['X-Gemini-Api-Key'];
  if (!apiKey?.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'User Gemini API key is required' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}') as AiReceiptPayload;
    if (!payload.dataBase64 || !payload.mimeType) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Receipt file is required' }) };
    }
    if (payload.dataBase64.length > MAX_BASE64_LENGTH) {
      return { statusCode: 413, headers, body: JSON.stringify({ error: 'Receipt file is too large for AI extraction' }) };
    }

    const categories = normalizeCategories(payload.categories);
    const generated = await callGeminiWithFallbacks(apiKey.trim(), modelCandidates(process.env.GEMINI_MODEL), payload, categories);
    if (!generated.ok) {
      return {
        statusCode: generated.statusCode,
        headers,
        body: JSON.stringify({
          error: generated.clientMessage,
          detail: generated.detail,
          model: generated.model,
          upstreamStatus: generated.upstreamStatus,
          upstreamCode: generated.upstreamCode,
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        provider: 'gemini',
        model: generated.model,
        extraction: normalizeExtraction(generated.extraction, categories),
      }),
    };
  } catch (error) {
    console.error('[extract-receipt] Error', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.name : 'Unknown',
    });
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: 'Could not extract receipt',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

async function callGeminiWithFallbacks(
  apiKey: string,
  models: string[],
  payload: AiReceiptPayload,
  categories: string[]
): Promise<
  | { ok: true; model: string; extraction: ExtractedReceipt }
  | {
      ok: false;
      statusCode: number;
      clientMessage: string;
      detail: string;
      model: string;
      upstreamStatus?: number;
      upstreamCode?: string;
    }
> {
  let lastFailure: { model: string; status: number; code?: string; message: string } | null = null;
  let lastMalformed: { model: string; finishReason?: string; preview: string } | null = null;

  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: buildPrompt(payload, categories) },
                {
                  inlineData: {
                    mimeType: payload.mimeType,
                    data: payload.dataBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.15,
            maxOutputTokens: 2200,
            responseMimeType: 'application/json',
            responseSchema: RECEIPT_SCHEMA,
          },
        }),
      }
    );

    if (response.ok) {
      const data = await response.json() as GeminiResponse;
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('\n') ?? '';
      const extraction = parseExtraction(text);
      if (extraction) return { ok: true, model, extraction };

      lastMalformed = {
        model,
        finishReason: candidate?.finishReason,
        preview: stripJsonFence(text).slice(0, 300),
      };
      console.warn('[extract-receipt] Gemini returned unparsable extraction', lastMalformed);
      continue;
    }

    lastFailure = await readGeminiFailure(response, model);
    console.error('[extract-receipt] Gemini request failed', lastFailure);
    if (![404, 429].includes(response.status)) break;
  }

  const failure = lastFailure ?? {
    model: models[0] ?? 'unknown',
    status: 502,
    message: lastMalformed
      ? `Gemini returned malformed extraction from ${lastMalformed.model}${lastMalformed.finishReason ? ` (${lastMalformed.finishReason})` : ''}.`
      : 'No Gemini response was received.',
  };

  return {
    ok: false,
    statusCode: failure.status === 401 || failure.status === 403 ? 403 : failure.status === 429 ? 429 : 502,
    clientMessage: failure.status === 401 || failure.status === 403
      ? 'Gemini API key is not authorized'
      : failure.status === 429
        ? 'Gemini quota exhausted'
        : 'AI receipt extraction temporarily unavailable',
    detail: failure.message,
    model: failure.model,
    upstreamStatus: failure.status,
    upstreamCode: failure.code,
  };
}

function buildPrompt(payload: AiReceiptPayload, categories: string[]): string {
  return [
    'You are Spenza receipt extraction. Extract visible bill data into JSON only.',
    `Locale: ${payload.locale || 'en-IN'}. Currency: ${payload.currency || 'INR'}. File: ${payload.fileName || 'receipt'}.`,
    `Allowed categories: ${categories.join(', ')}.`,
    'Return amount as final payable/paid/grand total, not subtotal/tax/savings.',
    'Return date as YYYY-MM-DD when visible, otherwise null.',
    'For lineItems, extract purchased items with item amount and suggested type from allowed categories.',
    'Comment should summarize purchased items with amounts, not generic merchant text. Example: "Items: Milk - 42; Bread - 35".',
    'If text is unreadable or not a bill, set readable false, confidence 0, and use null/empty values.',
    'Do not invent missing values.',
  ].join('\n');
}

function parseExtraction(text: string): ExtractedReceipt | null {
  const cleaned = stripJsonFence(text);
  const attempts = [
    cleaned,
    extractJsonObject(cleaned),
  ].filter((value): value is string => Boolean(value));

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as ExtractedReceipt;
    } catch {
      // Try next extraction candidate.
    }
  }
  return null;
}

function normalizeExtraction(extraction: ExtractedReceipt, categories: string[]) {
  const amount = numberOrNull(extraction.amount);
  const amountCandidates = uniqueAmounts([
    ...(Array.isArray(extraction.amountCandidates) ? extraction.amountCandidates : []),
    ...(amount ? [amount] : []),
  ]);
  const lineItems = (Array.isArray(extraction.lineItems) ? extraction.lineItems : [])
    .map((item) => ({
      name: String(item.name ?? '').trim().slice(0, 80),
      amount: numberOrNull(item.amount),
      type: normalizeCategory(item.type, categories),
      rawLine: String(item.name ?? '').trim().slice(0, 120),
    }))
    .filter((item): item is { name: string; amount: number; type: string | null; rawLine: string } => Boolean(item.name) && item.amount !== null)
    .slice(0, 30);
  const fallbackComment = lineItems.length
    ? `Items: ${lineItems.slice(0, 10).map((item) => `${item.name} - ${item.amount.toFixed(2)}`).join('; ')}${lineItems.length > 10 ? `; +${lineItems.length - 10} more` : ''}`
    : cleanText(extraction.comment);
  const detectedFields = [amount, extraction.date, extraction.type, fallbackComment, lineItems.length > 0 ? lineItems : null].filter(Boolean).length;
  const confidence = clamp01(numberOrNull(extraction.confidence) ?? detectedFields / 5);
  const readable = Boolean(extraction.readable) && detectedFields > 0;

  return {
    rawText: cleanText(extraction.merchant) || cleanText(extraction.comment) || '',
    amount,
    amountConfidence: clamp01(numberOrNull(extraction.amountConfidence) ?? (amount ? confidence : 0)),
    amountCandidates,
    lineItems,
    date: normalizeDate(extraction.date),
    type: normalizeCategory(extraction.type, categories),
    comment: fallbackComment,
    confidence,
    readable,
  };
}

function normalizeCategories(categories: string[] | undefined): string[] {
  const clean = (categories ?? [])
    .map((category) => String(category).trim())
    .filter(Boolean);
  return clean.length ? clean : FALLBACK_CATEGORIES;
}

function normalizeCategory(category: unknown, categories: string[]): string | null {
  if (typeof category !== 'string') return null;
  const normalized = category.trim().toLowerCase();
  return categories.find((item) => item.toLowerCase() === normalized) ?? null;
}

function normalizeDate(date: unknown): string | null {
  if (typeof date !== 'string') return null;
  const trimmed = date.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function cleanText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 240) : null;
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Number(number.toFixed(2)) : null;
}

function uniqueAmounts(values: unknown[]): number[] {
  const amounts: number[] = [];
  for (const value of values) {
    const amount = numberOrNull(value);
    if (amount === null || amounts.some((existing) => Math.abs(existing - amount) < 0.01)) continue;
    amounts.push(amount);
    if (amounts.length >= 5) break;
  }
  return amounts;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function modelCandidates(configuredModel: string | undefined): string[] {
  const configured = sanitizeModelName(configuredModel);
  return [
    ...(configured ? [configured] : []),
    ...DEFAULT_GEMINI_MODELS,
  ].filter((model, index, models) => models.indexOf(model) === index);
}

function sanitizeModelName(model: string | undefined): string | null {
  const trimmed = model?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^models\//, '');
}

async function readGeminiFailure(response: Response, model: string): Promise<{ model: string; status: number; code?: string; message: string }> {
  const raw = await response.text();
  let parsed: GeminiError | null = null;
  try {
    parsed = JSON.parse(raw) as GeminiError;
  } catch {
    parsed = null;
  }

  return {
    model,
    status: response.status,
    code: parsed?.error?.status,
    message: parsed?.error?.message ?? (raw.slice(0, 500) || response.statusText),
  };
}

function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}
