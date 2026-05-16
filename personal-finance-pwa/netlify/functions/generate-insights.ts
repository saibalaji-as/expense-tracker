import type { Handler, HandlerEvent } from '@netlify/functions';

type InsightTone = 'good' | 'warn' | 'info';
type InsightIcon = 'check-circle-2' | 'alert-triangle' | 'lightbulb' | 'clock-3' | 'sparkles';

interface InsightSection {
  label: string;
  title: string;
  detail: string;
  tone: InsightTone;
  icon: InsightIcon;
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
  };
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

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const SECTION_LABELS = new Set(['Weekly summary', 'Wins', 'Warnings', 'Suggestions', 'Forecast']);
const TONES = new Set<InsightTone>(['good', 'warn', 'info']);
const ICONS = new Set<InsightIcon>(['check-circle-2', 'alert-triangle', 'lightbulb', 'clock-3', 'sparkles']);
const DEFAULT_GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
const GEMINI_API_VERSION = 'v1beta';

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[generate-insights] GEMINI_API_KEY not configured in environment');
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: 'Gemini is not configured' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const models = modelCandidates(process.env.GEMINI_MODEL);
    const prompt = buildPrompt(payload);

    const generated = await callGeminiWithFallbacks(apiKey, models, prompt);
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

    const data = generated.data;
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('\n') ?? '';
    
    if (!text || text.trim().length === 0) {
      console.warn('[generate-insights] Gemini returned empty response');
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
          error: 'AI insights service returned empty response',
        }),
      };
    }

    const sections = normalizeSections(JSON.parse(stripJsonFence(text)));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ provider: 'gemini', model: generated.model, sections }),
    };
  } catch (error) {
    console.error('[generate-insights] Error', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.name : 'Unknown',
    });
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'Could not generate insights',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

function buildPrompt(payload: unknown): string {
  return [
    'You are Spenza, a private household finance assistant.',
    'Return strict JSON only. No markdown. No extra keys.',
    'Use the exact schema: {"sections":[{"label":"Weekly summary|Wins|Warnings|Suggestions|Forecast","title":"...","detail":"...","tone":"good|warn|info","icon":"check-circle-2|alert-triangle|lightbulb|clock-3|sparkles"}]}',
    'Produce exactly five sections, one for each label.',
    'Be concise, practical, and non-judgmental. Do not invent data. If data is sparse, say that clearly.',
    'Currency values are already summarized; do not ask for bank data. Comments are intentionally excluded for privacy.',
    `Data: ${JSON.stringify(payload)}`,
  ].join('\n');
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

async function callGeminiWithFallbacks(
  apiKey: string,
  models: string[],
  prompt: string
): Promise<
  | { ok: true; model: string; data: GeminiResponse }
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
  let lastFailure: {
    model: string;
    status: number;
    statusText: string;
    code?: string;
    message: string;
  } | null = null;

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
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 900,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (response.ok) {
      return { ok: true, model, data: await response.json() as GeminiResponse };
    }

    const failure = await readGeminiFailure(response, model);
    lastFailure = failure;
    console.error('[generate-insights] Gemini request failed', failure);

    if (response.status !== 404) break;
  }

  const failure = lastFailure ?? {
    model: models[0] ?? 'unknown',
    status: 503,
    statusText: 'Unavailable',
    message: 'No Gemini response was received.',
  };

  return {
    ok: false,
    statusCode: failure.status === 401 || failure.status === 403 ? 503 : 502,
    clientMessage: failure.status === 401 || failure.status === 403
      ? 'Gemini API key is not authorized'
      : 'AI insights service temporarily unavailable',
    detail: failure.message,
    model: failure.model,
    upstreamStatus: failure.status,
    upstreamCode: failure.code,
  };
}

async function readGeminiFailure(
  response: Response,
  model: string
): Promise<{ model: string; status: number; statusText: string; code?: string; message: string }> {
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
    statusText: response.statusText,
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

function normalizeSections(parsed: unknown): InsightSection[] {
  const record = parsed as { sections?: unknown };
  if (!Array.isArray(record.sections)) {
    throw new Error('Gemini response did not include sections array.');
  }

  return record.sections.slice(0, 5).map((item): InsightSection => {
    const section = item as Partial<InsightSection>;
    const label = typeof section.label === 'string' && SECTION_LABELS.has(section.label)
      ? section.label
      : 'Suggestions';
    const tone = section.tone && TONES.has(section.tone) ? section.tone : 'info';
    const icon = section.icon && ICONS.has(section.icon) ? section.icon : 'lightbulb';

    return {
      label,
      title: typeof section.title === 'string' ? section.title.slice(0, 90) : label,
      detail: typeof section.detail === 'string' ? section.detail.slice(0, 220) : '',
      tone,
      icon,
    };
  });
}
