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

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const SECTION_LABELS = new Set(['Weekly summary', 'Wins', 'Warnings', 'Suggestions', 'Forecast']);
const TONES = new Set<InsightTone>(['good', 'warn', 'info']);
const ICONS = new Set<InsightIcon>(['check-circle-2', 'alert-triangle', 'lightbulb', 'clock-3', 'sparkles']);

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: 'Gemini is not configured' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const prompt = buildPrompt(payload);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
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
          },
        }),
      }
    );

    if (!response.ok) {
      const message = await response.text();
      console.error('[generate-insights] Gemini request failed', {
        status: response.status,
        statusText: response.statusText,
        message,
        model,
      });
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: 'Gemini request failed',
          status: response.status,
          statusText: response.statusText,
          message,
        }),
      };
    }

    const data = await response.json() as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('\n') ?? '';
    const sections = normalizeSections(JSON.parse(stripJsonFence(text)));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ provider: 'gemini', sections }),
    };
  } catch (error) {
    return {
      statusCode: 500,
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
