"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseVoiceExpense = void 0;
const https_1 = require("firebase-functions/v2/https");
const DEFAULT_GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const GEMINI_API_VERSION = 'v1beta';
const MAX_TRANSCRIPT_LENGTH = 1000;
const FALLBACK_CATEGORIES = ['Housing', 'Food & Groceries', 'Transportation', 'Utilities', 'Healthcare', 'Entertainment', 'Dining Out', 'Shopping/Clothing', 'Savings/Emergency Fund', 'Investments', 'Education', 'Personal Care', 'Subscriptions', 'Miscellaneous'];
const VOICE_EXPENSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        rawText: { type: 'STRING' },
        amount: { type: 'NUMBER', nullable: true },
        date: { type: 'STRING', nullable: true },
        type: { type: 'STRING', nullable: true },
        comment: { type: 'STRING', nullable: true },
        confidence: { type: 'NUMBER' },
        readable: { type: 'BOOLEAN' },
    },
    required: ['rawText', 'amount', 'date', 'type', 'comment', 'confidence', 'readable'],
};
exports.parseVoiceExpense = (0, https_1.onRequest)({ cors: true }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }
    const apiKey = req.headers['x-gemini-api-key']?.trim();
    if (!apiKey) {
        res.status(400).json({ error: 'User Gemini API key is required' });
        return;
    }
    try {
        const payload = req.body;
        const transcript = cleanTranscript(payload.transcript);
        if (!transcript) {
            res.status(400).json({ error: 'Voice transcript is required' });
            return;
        }
        if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
            res.status(413).json({ error: 'Voice transcript is too long' });
            return;
        }
        const categories = normalizeCategories(payload.categories);
        const generated = await callGeminiWithFallbacks(apiKey, modelCandidates(process.env.GEMINI_MODEL), { ...payload, transcript }, categories);
        if (!generated.ok) {
            res.status(generated.statusCode).json({
                error: generated.clientMessage,
                detail: generated.detail,
                model: generated.model,
                upstreamStatus: generated.upstreamStatus,
                upstreamCode: generated.upstreamCode,
            });
            return;
        }
        res.json({
            provider: 'gemini',
            model: generated.model,
            expense: normalizeExpense(generated.expense, categories, transcript),
        });
    }
    catch (error) {
        console.error('[parseVoiceExpense] Error', error instanceof Error ? error.message : error);
        res.status(502).json({
            error: 'Could not parse voice expense',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
async function callGeminiWithFallbacks(apiKey, models, payload, categories) {
    let lastFailure = null;
    let lastMalformed = null;
    for (const model of models) {
        const response = await fetch(`https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: buildPrompt(payload, categories) }] }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 1000,
                    responseMimeType: 'application/json',
                    responseSchema: VOICE_EXPENSE_SCHEMA,
                },
            }),
        });
        if (response.ok) {
            const data = await response.json();
            const candidate = data.candidates?.[0];
            const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('\n') ?? '';
            const expense = parseExpense(text);
            if (expense)
                return { ok: true, model, expense };
            lastMalformed = { model, finishReason: candidate?.finishReason, preview: stripJsonFence(text).slice(0, 300) };
            console.warn('[parseVoiceExpense] Gemini returned unparsable expense', lastMalformed);
            continue;
        }
        lastFailure = await readGeminiFailure(response, model);
        console.error('[parseVoiceExpense] Gemini request failed', lastFailure);
        if (![404, 429].includes(response.status))
            break;
    }
    const failure = lastFailure ?? {
        model: models[0] ?? 'unknown',
        status: 502,
        message: lastMalformed
            ? `Gemini returned malformed voice expense from ${lastMalformed.model}${lastMalformed.finishReason ? ` (${lastMalformed.finishReason})` : ''}.`
            : 'No Gemini response was received.',
    };
    return {
        ok: false,
        statusCode: failure.status === 401 || failure.status === 403 ? 403 : failure.status === 429 ? 429 : 502,
        clientMessage: failure.status === 401 || failure.status === 403
            ? 'Gemini API key is not authorized'
            : failure.status === 429 ? 'Gemini quota exhausted' : 'AI voice expense parsing temporarily unavailable',
        detail: failure.message,
        model: failure.model,
        upstreamStatus: failure.status,
        upstreamCode: failure.code,
    };
}
function buildPrompt(payload, categories) {
    return [
        'You are Spenza voice expense parsing. Convert one spoken expense into JSON only.',
        `Transcript: ${payload.transcript ?? ''}`,
        `Locale: ${payload.locale || 'en-IN'}. Currency: ${payload.currency || 'INR'}. Today: ${payload.today || 'unknown'}.`,
        `Allowed categories: ${categories.join(', ')}.`,
        'The transcript may be English, Hindi, Tamil, or mixed native phrasing. Understand common spoken money forms, including rupees, dollars, dirhams, and numbers in words.',
        'Return amount as the actual paid/spent amount.',
        'Return date as YYYY-MM-DD. If the user says today, use Today. If yesterday, subtract one calendar day from Today. If no date is spoken, use Today.',
        'Choose type from allowed categories based on the item or purpose. Food, groceries, vegetables, milk, rice, and supermarket items map to Food & Groceries; hotel/restaurant/cafe maps to Dining Out; petrol, fuel, bus, taxi, train maps to Transportation.',
        'Comment should be short plain text in the transcript language when possible, focused on what was bought. Do not include secrets.',
        'If the transcript does not contain an expense amount or item, set readable false, confidence 0, and use null values.',
        'Do not invent missing amounts.',
    ].join('\n');
}
function parseExpense(text) {
    const cleaned = stripJsonFence(text);
    for (const attempt of [cleaned, extractJsonObject(cleaned)].filter((v) => Boolean(v))) {
        try {
            return JSON.parse(attempt);
        }
        catch { /* try next */ }
    }
    return null;
}
function normalizeExpense(expense, categories, transcript) {
    const amount = numberOrNull(expense.amount);
    const type = normalizeCategory(expense.type, categories);
    const date = normalizeDate(expense.date);
    const comment = cleanText(expense.comment) || cleanText(transcript);
    const detectedFields = [amount, date, type, comment].filter(Boolean).length;
    const confidence = clamp01(numberOrNull(expense.confidence, true) ?? detectedFields / 4);
    const readable = Boolean(expense.readable) && amount !== null && detectedFields >= 2;
    return { rawText: cleanText(expense.rawText) || transcript, amount, date, type, comment, confidence, readable };
}
function normalizeCategories(categories) {
    const clean = (categories ?? []).map((c) => String(c).trim()).filter(Boolean);
    return clean.length ? clean : FALLBACK_CATEGORIES;
}
function normalizeCategory(category, categories) {
    if (typeof category !== 'string')
        return null;
    const normalized = categoryKey(category);
    const direct = categories.find((item) => categoryKey(item) === normalized);
    if (direct)
        return direct;
    const aliases = {
        food: 'Food & Groceries', grocery: 'Food & Groceries', groceries: 'Food & Groceries',
        vegetable: 'Food & Groceries', vegetables: 'Food & Groceries', milk: 'Food & Groceries',
        restaurant: 'Dining Out', restaurants: 'Dining Out', dining: 'Dining Out', hotel: 'Dining Out', cafe: 'Dining Out',
        transport: 'Transportation', fuel: 'Transportation', petrol: 'Transportation',
        shopping: 'Shopping/Clothing', clothing: 'Shopping/Clothing',
        savings: 'Savings/Emergency Fund', emergency: 'Savings/Emergency Fund',
        misc: 'Miscellaneous', miscellaneous: 'Miscellaneous',
    };
    const alias = aliases[normalized];
    return alias ? categories.find((item) => categoryKey(item) === categoryKey(alias)) ?? null : null;
}
function categoryKey(c) {
    return c.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function normalizeDate(date) {
    if (typeof date !== 'string')
        return null;
    const trimmed = date.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}
function cleanTranscript(value) {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_TRANSCRIPT_LENGTH) : null;
}
function cleanText(value) {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, 240) : null;
}
function numberOrNull(value, allowZero = false) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return null;
    if (allowZero && n === 0)
        return 0;
    return n > 0 ? Number(n.toFixed(2)) : null;
}
function clamp01(value) {
    return Math.max(0, Math.min(1, value));
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
    return { model, status: response.status, code: parsed?.error?.status, message: parsed?.error?.message ?? (raw.slice(0, 500) || response.statusText) };
}
function stripJsonFence(text) {
    return text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}
function extractJsonObject(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}
//# sourceMappingURL=ai-voice.js.map