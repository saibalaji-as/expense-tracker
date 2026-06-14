"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseVoiceReminder = void 0;
const https_1 = require("firebase-functions/v2/https");
const auth_1 = require("./auth");
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const MAX_TRANSCRIPT_LENGTH = 1000;
const DEFAULT_GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const GEMINI_API_VERSION = 'v1beta';
const REMINDER_SCHEMA = {
    type: 'OBJECT',
    properties: {
        type: { type: 'STRING' },
        title: { type: 'STRING' },
        remindAt: { type: 'STRING', nullable: true },
        locationName: { type: 'STRING', nullable: true },
        ambiguous: { type: 'BOOLEAN' },
        clarification: { type: 'STRING', nullable: true },
    },
    required: ['type', 'title', 'remindAt', 'locationName', 'ambiguous', 'clarification'],
};
exports.parseVoiceReminder = (0, https_1.onRequest)({ cors: true, secrets: ['GROQ_API_KEY', 'GEMINI_API_KEY'] }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }
    const userApiKey = req.headers['x-gemini-api-key']?.trim() || null;
    const hostedGroqKey = process.env.GROQ_API_KEY?.trim() || null;
    if (!userApiKey && !hostedGroqKey) {
        res.status(503).json({ error: 'AI reminder parsing unavailable: no API key configured on server.' });
        return;
    }
    if (!userApiKey) {
        try {
            await (0, auth_1.requireFirebaseUid)(req);
        }
        catch {
            res.status(401).json({ error: 'Unauthorized: sign in to use hosted AI reminder parsing.' });
            return;
        }
    }
    try {
        const payload = req.body;
        const transcript = cleanTranscript(payload.transcript);
        if (!transcript) {
            res.status(400).json({ error: 'Voice transcript is required' });
            return;
        }
        const result = userApiKey
            ? await callGeminiWithFallbacks(userApiKey, modelCandidates(process.env.GEMINI_MODEL), payload, transcript)
            : await callGroq(hostedGroqKey, payload, transcript);
        if (!result.ok) {
            res.status(result.statusCode).json({ error: result.clientMessage, detail: result.detail });
            return;
        }
        res.json({ provider: result.provider, reminder: result.reminder });
    }
    catch (error) {
        console.error('[parseVoiceReminder] Error', error instanceof Error ? error.message : error);
        res.status(502).json({ error: 'Could not parse voice reminder' });
    }
});
async function callGroq(apiKey, payload, transcript) {
    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [{ role: 'user', content: buildPrompt(payload, transcript) }],
            temperature: 0.1,
            max_tokens: 500,
            response_format: { type: 'json_object' },
        }),
    });
    if (!response.ok) {
        const raw = await response.text();
        let message = raw.slice(0, 300) || response.statusText;
        try {
            message = JSON.parse(raw).error?.message ?? message;
        }
        catch { /* ignore */ }
        return { ok: false, statusCode: response.status === 429 ? 429 : 502, clientMessage: response.status === 429 ? 'Rate limit reached' : 'AI reminder parsing temporarily unavailable', detail: message };
    }
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    const reminder = parseReminder(text);
    if (reminder)
        return { ok: true, provider: 'groq', reminder };
    return { ok: false, statusCode: 502, clientMessage: 'AI reminder parsing temporarily unavailable', detail: 'Groq returned malformed JSON.' };
}
async function callGeminiWithFallbacks(apiKey, models, payload, transcript) {
    let lastFailure = null;
    for (const model of models) {
        const response = await fetch(`https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: buildPrompt(payload, transcript) }] }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 500,
                    responseMimeType: 'application/json',
                    responseSchema: REMINDER_SCHEMA,
                },
            }),
        });
        if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
            const reminder = parseReminder(text);
            if (reminder)
                return { ok: true, provider: 'gemini', reminder };
            continue;
        }
        lastFailure = await readGeminiFailure(response, model);
        if (![404, 429].includes(response.status))
            break;
    }
    const f = lastFailure ?? { model: models[0] ?? 'unknown', status: 502, message: 'No Gemini response.' };
    return {
        ok: false,
        statusCode: [401, 403].includes(f.status) ? 403 : f.status === 429 ? 429 : 502,
        clientMessage: [401, 403].includes(f.status) ? 'Gemini API key not authorized' : f.status === 429 ? 'Gemini quota exhausted' : 'AI reminder parsing temporarily unavailable',
        detail: f.message,
    };
}
function buildPrompt(payload, transcript) {
    const now = payload.nowIso ?? new Date().toISOString();
    const tz = payload.timezone ?? 'Asia/Kolkata';
    return [
        'You are Spenza voice reminder parsing. Convert spoken reminder intent into JSON only.',
        `Transcript: ${transcript}`,
        `Current datetime (ISO 8601): ${now}. Timezone: ${tz}.`,
        'Rules:',
        '- If the user mentions a date/time → type "datetime", resolve remindAt to full ISO 8601 in IST (e.g. 2026-06-12T18:00:00+05:30). Handle relative phrases: "tomorrow", "next Friday", "evening" (=18:00), "morning" (=09:00), "night" (=21:00).',
        '- If the user mentions a place/location → type "location", put raw place name in locationName, set remindAt null. Do NOT invent coordinates.',
        '- If both date/time AND location are present → prefer type "datetime" and note the place in title.',
        '- If unclear or missing → ambiguous true, provide a short clarification question in the same language as the transcript.',
        '- title: concise reminder title derived from the transcript (what to do/buy/remember).',
        '- Return ONLY the JSON object, no markdown fences.',
    ].join('\n');
}
function parseReminder(text) {
    const cleaned = stripJsonFence(text);
    for (const attempt of [cleaned, extractJsonObject(cleaned)].filter((v) => Boolean(v))) {
        try {
            const parsed = JSON.parse(attempt);
            if (typeof parsed.title === 'string' && typeof parsed.ambiguous === 'boolean') {
                return {
                    type: parsed.type === 'location' ? 'location' : 'datetime',
                    title: parsed.title.trim().slice(0, 200),
                    remindAt: typeof parsed.remindAt === 'string' ? parsed.remindAt : null,
                    locationName: typeof parsed.locationName === 'string' ? parsed.locationName : null,
                    ambiguous: parsed.ambiguous,
                    clarification: typeof parsed.clarification === 'string' ? parsed.clarification : null,
                };
            }
        }
        catch { /* try next */ }
    }
    return null;
}
function cleanTranscript(value) {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_TRANSCRIPT_LENGTH) : null;
}
function modelCandidates(configuredModel) {
    const configured = configuredModel?.trim().replace(/^models\//, '') || null;
    return [...(configured ? [configured] : []), ...DEFAULT_GEMINI_MODELS].filter((m, i, arr) => arr.indexOf(m) === i);
}
async function readGeminiFailure(response, model) {
    const raw = await response.text();
    let parsed = null;
    try {
        parsed = JSON.parse(raw);
    }
    catch { /* ignore */ }
    return { model, status: response.status, message: parsed?.error?.message ?? (raw.slice(0, 500) || response.statusText) };
}
function stripJsonFence(text) {
    return text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}
function extractJsonObject(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}
//# sourceMappingURL=ai-reminder.js.map