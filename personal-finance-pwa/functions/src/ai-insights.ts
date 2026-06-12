import { onRequest } from 'firebase-functions/v2/https';

// ---------------------------------------------------------------------------
// Provider config
// ---------------------------------------------------------------------------
// Hosted AI (no user key required):
//   - Text insights/voice → Groq (free tier, privacy-safe, no data training)
//     Set GROQ_API_KEY in Firebase Functions env: firebase functions:secrets:set GROQ_API_KEY
//   - Receipt extraction → hosted Gemini (multimodal required)
//     Set GEMINI_API_KEY in Firebase Functions env: firebase functions:secrets:set GEMINI_API_KEY
//
// BYOK mode: user supplies X-Gemini-Api-Key and/or X-Groq-Api-Key + X-Ai-Preference header.
// ---------------------------------------------------------------------------

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

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
  content?: { parts?: Array<{ text?: string }> };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

interface GeminiError {
  error?: { code?: number; message?: string; status?: string };
}

const SECTION_LABELS = new Set(['Anomaly', 'Behavior hack', 'What if', 'Seasonal timing', 'Intent check']);
const TONES = new Set<InsightTone>(['good', 'warn', 'info']);
const ICONS = new Set<InsightIcon>(['check-circle-2', 'alert-triangle', 'lightbulb', 'clock-3', 'sparkles']);
const DEFAULT_GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const GEMINI_API_VERSION = 'v1beta';
const INSIGHT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sections: {
      type: 'ARRAY',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING', enum: ['Anomaly', 'Behavior hack', 'What if', 'Seasonal timing', 'Intent check'] },
          title: { type: 'STRING' },
          detail: { type: 'STRING' },
          tone: { type: 'STRING', enum: ['good', 'warn', 'info'] },
          icon: { type: 'STRING', enum: ['check-circle-2', 'alert-triangle', 'lightbulb', 'clock-3', 'sparkles'] },
        },
        required: ['label', 'title', 'detail', 'tone', 'icon'],
      },
    },
  },
  required: ['sections'],
};

export const generateInsights = onRequest({ cors: true, secrets: ['GROQ_API_KEY', 'GEMINI_API_KEY'] }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const userGeminiKey = (req.headers['x-gemini-api-key'] as string | undefined)?.trim() || null;
  const userGroqKey   = (req.headers['x-groq-api-key']   as string | undefined)?.trim() || null;
  const aiPreference  = ((req.headers['x-ai-preference']  as string | undefined)?.trim() || 'gemini') as 'groq' | 'gemini' | 'both';
  const hostedGroqKey = process.env.GROQ_API_KEY?.trim() || null;
  const hostedGeminiKey = process.env.GEMINI_API_KEY?.trim() || null;

  const hasUserKey = !!(userGeminiKey || userGroqKey);

  // Require at least one key (user or server)
  if (!hasUserKey && !hostedGroqKey && !hostedGeminiKey) {
    res.status(503).json({ error: 'AI insights unavailable: no API key configured on server.' });
    return;
  }

  try {
    const payload = req.body;
    const prompt = buildPrompt(payload);

    let generated: Awaited<ReturnType<typeof callGroq | typeof callGeminiWithFallbacks>>;

    if (!hasUserKey) {
      // Hosted path: try Groq first, auto-fallback to Gemini if Groq fails
      if (hostedGroqKey) {
        generated = await callGroq(hostedGroqKey, prompt);
        if (!generated.ok && generated.statusCode !== 200 && hostedGeminiKey) {
          console.warn('[generateInsights] Groq failed, falling back to hosted Gemini');
          generated = await callGeminiWithFallbacks(hostedGeminiKey, modelCandidates(process.env.GEMINI_MODEL), prompt);
        }
      } else {
        generated = await callGeminiWithFallbacks(hostedGeminiKey!, modelCandidates(process.env.GEMINI_MODEL), prompt);
      }
    } else if (aiPreference === 'groq' && userGroqKey) {
      generated = await callGroq(userGroqKey, prompt);
    } else if (aiPreference === 'gemini' && userGeminiKey) {
      generated = await callGeminiWithFallbacks(userGeminiKey, modelCandidates(process.env.GEMINI_MODEL), prompt);
    } else if (aiPreference === 'both') {
      // Both: try user Groq first, fallback to user Gemini
      if (userGroqKey) {
        generated = await callGroq(userGroqKey, prompt);
        if (!generated.ok && generated.statusCode !== 200 && userGeminiKey) {
          console.warn('[generateInsights] User Groq failed, falling back to user Gemini');
          generated = await callGeminiWithFallbacks(userGeminiKey, modelCandidates(process.env.GEMINI_MODEL), prompt);
        }
      } else {
        generated = await callGeminiWithFallbacks(userGeminiKey!, modelCandidates(process.env.GEMINI_MODEL), prompt);
      }
    } else {
      // Fallback: use whichever key is available
      generated = userGroqKey
        ? await callGroq(userGroqKey, prompt)
        : await callGeminiWithFallbacks(userGeminiKey!, modelCandidates(process.env.GEMINI_MODEL), prompt);
    }

    if (!generated.ok) {
      if (generated.statusCode === 200) {
        res.json({ provider: 'local', sections: [], fallback: true, reason: generated.detail });
        return;
      }
      res.status(generated.statusCode).json({
        code: generated.statusCode === 429 ? 'RATE_LIMIT' : undefined,
        error: generated.clientMessage,
        detail: generated.detail,
        message: generated.detail,
        model: generated.model,
        upstreamStatus: generated.upstreamStatus,
        upstreamCode: generated.upstreamCode,
      });
      return;
    }

    res.json({ provider: generated.provider, model: generated.model, sections: generated.sections });
  } catch (error) {
    console.error('[generateInsights] Error', error instanceof Error ? error.message : error);
    res.status(503).json({
      error: 'Could not generate insights',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

function buildPrompt(payload: unknown): string {
  const locale = localeFromPayload(payload);
  return [
    'You are Spenza, a private household finance assistant.',
    'Return JSON only using the provided response schema.',
    `Write each section title and detail in this user language/locale: ${locale}.`,
    'Keep the section label values exactly as the schema enum strings: Anomaly, Behavior hack, What if, Seasonal timing, Intent check.',
    'This is the Gemini-only deep-dive lane in a hybrid UI. The app already shows local deterministic weekly summaries.',
    'Produce exactly five sections in this order: Anomaly, Behavior hack, What if, Seasonal timing, Intent check.',
    'Do not repeat basic totals, top categories, or generic budget warnings unless needed as evidence.',
    'Focus on work local rules cannot do well: anomaly explanation, cross-category contradictions, what-if simulations, seasonal timing, and budget intent vs reality.',
    'Use compact recentDailyTrend and categoryBaselines to identify meaningful category spikes or drops.',
    'Use budgetIntent to compare user-set budget priorities against actual behavior.',
    'Use monthlySeasonality to spot upcoming seasonal pressure. Only mention same-month/year-over-year patterns if the data supports it.',
    'Use whatIfCuts for the What if section; compare revised forecasts or savings from realistic category reductions.',
    'Use repeatedExpenses, spendingPattern, partnerActivity, budgetUsage, categoryChanges, dailyTrend, and topExpenses as supporting evidence.',
    'Make one concrete, actionable suggestion in each detail when possible.',
    'Be specific and useful: each detail should explain the signal, the likely implication, and one next action.',
    'Be practical and non-judgmental. Do not invent data. If data is sparse, say that clearly.',
    'Keep each title under 10 words and each detail between 20 and 40 words when enough data exists.',
    'Currency values are already summarized. Comments are intentionally excluded for privacy.',
    `Data: ${JSON.stringify(payload)}`,
  ].join('\n');
}

function localeFromPayload(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'locale' in payload) {
    const locale = (payload as { locale?: unknown }).locale;
    if (typeof locale === 'string' && locale.trim()) return locale.trim();
  }
  return 'en-IN';
}

const GROQ_SCHEMA_HINT = `
Respond with a JSON object matching this exact structure — no other keys:
{
  "sections": [
    { "label": "Anomaly",         "title": "...", "detail": "...", "tone": "warn|good|info", "icon": "alert-triangle|check-circle-2|lightbulb|clock-3|sparkles" },
    { "label": "Behavior hack",   "title": "...", "detail": "...", "tone": "warn|good|info", "icon": "alert-triangle|check-circle-2|lightbulb|clock-3|sparkles" },
    { "label": "What if",         "title": "...", "detail": "...", "tone": "warn|good|info", "icon": "alert-triangle|check-circle-2|lightbulb|clock-3|sparkles" },
    { "label": "Seasonal timing", "title": "...", "detail": "...", "tone": "warn|good|info", "icon": "alert-triangle|check-circle-2|lightbulb|clock-3|sparkles" },
    { "label": "Intent check",    "title": "...", "detail": "...", "tone": "warn|good|info", "icon": "alert-triangle|check-circle-2|lightbulb|clock-3|sparkles" }
  ]
}
Return exactly 5 sections in that order. Use only the label values shown above verbatim.`;

async function callGroq(
  apiKey: string,
  prompt: string
): Promise<
  | { ok: true; provider: 'groq'; model: string; sections: InsightSection[] }
  | { ok: false; statusCode: number; clientMessage: string; detail: string; model: string; upstreamStatus?: number; upstreamCode?: string }
> {
  const groqPrompt = prompt + '\n' + GROQ_SCHEMA_HINT;
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: groqPrompt }],
      temperature: 0.35,
      max_tokens: 1400,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = raw.slice(0, 300) || response.statusText;
    try { message = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? message; } catch { /* ignore */ }
    console.error('[generateInsights] Groq request failed', response.status, message);
    return {
      ok: false,
      statusCode: response.status === 429 ? 429 : 502,
      clientMessage: response.status === 429 ? 'Rate limit reached' : 'AI insights service temporarily unavailable',
      detail: message,
      model: GROQ_MODEL,
      upstreamStatus: response.status,
    };
  }

  interface GroqResponse { choices?: Array<{ message?: { content?: string } }> }
  const data = await response.json() as GroqResponse;
  const text = data.choices?.[0]?.message?.content ?? '';
  const sections = parseGeminiSections(text); // parser is format-agnostic
  if (sections) return { ok: true, provider: 'groq', model: GROQ_MODEL, sections };

  console.warn('[generateInsights] Groq returned unparsable sections, preview:', text.slice(0, 300));
  return { ok: false, statusCode: 200, clientMessage: 'AI insights fell back to local summaries', detail: 'Groq returned malformed JSON.', model: GROQ_MODEL };
}

async function callGeminiWithFallbacks(
  apiKey: string,
  models: string[],
  prompt: string
): Promise<
  | { ok: true; provider: 'gemini'; model: string; sections: InsightSection[] }
  | { ok: false; statusCode: number; clientMessage: string; detail: string; model: string; upstreamStatus?: number; upstreamCode?: string }
> {
  let lastFailure: { model: string; status: number; statusText: string; code?: string; message: string } | null = null;
  let lastMalformed: { model: string; finishReason?: string; preview: string } | null = null;

  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 1400,
            responseMimeType: 'application/json',
            responseSchema: INSIGHT_RESPONSE_SCHEMA,
          },
        }),
      }
    );

    if (response.ok) {
      const data = await response.json() as GeminiResponse;
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('\n') ?? '';
      const sections = parseGeminiSections(text);
      if (sections) return { ok: true, provider: 'gemini' as const, model, sections };
      lastMalformed = { model, finishReason: candidate?.finishReason, preview: stripJsonFence(text).slice(0, 300) };
      console.warn('[generateInsights] Gemini returned unparsable sections', lastMalformed);
      continue;
    }

    const failure = await readGeminiFailure(response, model);
    lastFailure = failure;
    console.error('[generateInsights] Gemini request failed', failure);
    if (response.status !== 404) break;
  }

  const failure = lastFailure ?? {
    model: models[0] ?? 'unknown',
    status: 503,
    statusText: 'Unavailable',
    message: lastMalformed
      ? `Gemini returned malformed JSON from ${lastMalformed.model}${lastMalformed.finishReason ? ` (${lastMalformed.finishReason})` : ''}.`
      : 'No Gemini response was received.',
  };

  if (lastMalformed && !lastFailure) {
    return { ok: false, statusCode: 200, clientMessage: 'AI insights fell back to local summaries', detail: failure.message, model: lastMalformed.model };
  }


  return {
    ok: false,
    statusCode: failure.status === 429 ? 429 : failure.status === 401 || failure.status === 403 ? 503 : 502,
    clientMessage: failure.status === 429
      ? 'Rate limit reached'
      : failure.status === 401 || failure.status === 403
        ? 'Gemini API key is not authorized'
        : 'AI insights service temporarily unavailable',
    detail: failure.message,
    model: failure.model,
    upstreamStatus: failure.status,
    upstreamCode: failure.code,
  };
}

function parseGeminiSections(text: string): InsightSection[] | null {
  const cleaned = stripJsonFence(text);
  for (const attempt of [cleaned, extractJsonObject(cleaned), extractJsonArray(cleaned)].filter((v): v is string => Boolean(v))) {
    try { return normalizeSections(JSON.parse(attempt)); } catch { /* try next */ }
  }
  return null;
}

function normalizeSections(parsed: unknown): InsightSection[] {
  if (typeof parsed === 'string') return normalizeSections(JSON.parse(parsed));
  if (Array.isArray(parsed)) return normalizeSectionArray(parsed);
  const r = parsed as { sections?: unknown; insights?: unknown; items?: unknown; weeklyInsights?: unknown };
  const sections = parseSectionCandidate(r.sections) ?? parseSectionCandidate(r.insights) ?? parseSectionCandidate(r.items) ?? parseSectionCandidate(r.weeklyInsights);
  if (!sections) throw new Error('Gemini response did not include sections array.');
  return sections;
}

function parseSectionCandidate(candidate: unknown): InsightSection[] | null {
  if (typeof candidate === 'string') {
    try { return normalizeSections(JSON.parse(candidate)); } catch { return null; }
  }
  return Array.isArray(candidate) ? normalizeSectionArray(candidate) : null;
}

function normalizeSectionArray(sections: unknown[]): InsightSection[] {
  return completeSections(sections.slice(0, 5).map((item): InsightSection => {
    const s = item as Partial<InsightSection>;
    return {
      label: typeof s.label === 'string' && SECTION_LABELS.has(s.label) ? s.label : 'Behavior hack',
      title: typeof s.title === 'string' ? s.title.slice(0, 90) : (s.label ?? 'Behavior hack'),
      detail: typeof s.detail === 'string' ? s.detail.slice(0, 520) : '',
      tone: s.tone && TONES.has(s.tone) ? s.tone : 'info',
      icon: s.icon && ICONS.has(s.icon) ? s.icon : 'lightbulb',
    };
  }));
}

function completeSections(sections: InsightSection[]): InsightSection[] {
  const byLabel = new Map(sections.map((s) => [s.label, s]));
  return Array.from(SECTION_LABELS).map((label): InsightSection =>
    byLabel.get(label) ?? { label, title: label, detail: 'Not enough AI detail was returned for this section.', tone: 'info', icon: 'lightbulb' }
  );
}

function modelCandidates(configuredModel: string | undefined): string[] {
  const configured = configuredModel?.trim().replace(/^models\//, '') || null;
  return [...(configured ? [configured] : []), ...DEFAULT_GEMINI_MODELS].filter((m, i, arr) => arr.indexOf(m) === i);
}

async function readGeminiFailure(response: Response, model: string): Promise<{ model: string; status: number; statusText: string; code?: string; message: string }> {
  const raw = await response.text();
  let parsed: GeminiError | null = null;
  try { parsed = JSON.parse(raw) as GeminiError; } catch { /* ignore */ }
  return { model, status: response.status, statusText: response.statusText, code: parsed?.error?.status, message: parsed?.error?.message ?? (raw.slice(0, 500) || response.statusText) };
}

function stripJsonFence(text: string): string {
  return text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}
