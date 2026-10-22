"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RPC = exports.SERVER_INFO = exports.DEFAULT_PROTOCOL_VERSION = exports.SUPPORTED_PROTOCOL_VERSIONS = void 0;
exports.handleRpc = handleRpc;
/**
 * MCP over Streamable HTTP, stateless: every POST carries one JSON-RPC message
 * (or a batch) and gets a JSON response. No sessions, no server-initiated
 * messages, so `application/json` responses are enough.
 * Written by hand because the npm registry is not reachable from the build
 * environment; it implements only what a read-only server needs.
 */
const category_definitions_1 = require("../spenza-core/models/category-definitions");
const local_date_1 = require("../spenza-core/utils/local-date");
const errors_1 = require("./errors");
const tools_1 = require("./tools");
exports.SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
exports.DEFAULT_PROTOCOL_VERSION = '2025-06-18';
exports.SERVER_INFO = { name: 'spenza', title: 'Spenza', version: '1.0.0' };
const INSTRUCTIONS = 'Read-only access to the user\'s Spenza expense tracker: spending, budgets, credit cards and loans, and shared ' +
    'circles. Nothing can be added or changed from here; to log or edit an expense the user opens the Spenza app. ' +
    'Dates are YYYY-MM-DD in the user\'s timezone. Always mention the currency, and mention dataAsOf when the user ' +
    'asks about today, because entries added offline on the phone appear only after the app syncs.';
exports.RPC = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 };
const RESOURCES = [
    {
        uri: 'spenza://categories',
        name: 'categories',
        title: 'Expense types and budget buckets',
        description: 'Spenza\'s built-in expense types with their budget bucket, plus the types this user has limits for.',
        mimeType: 'application/json',
    },
    {
        uri: 'spenza://settings',
        name: 'settings',
        title: 'Spenza settings',
        description: 'Currency, timezone, today\'s date, single or family mode, and how fresh the data is.',
        mimeType: 'application/json',
    },
];
const PROMPTS = [
    {
        name: 'monthly_review',
        title: 'Monthly money review',
        description: 'Where the money went this month, which limits are over, what is due next, and three suggestions.',
        arguments: [{ name: 'month', description: 'YYYY-MM. Default: the current month.', required: false }],
    },
];
const ok = (id, result) => ({ jsonrpc: '2.0', id: id ?? null, result });
const fail = (id, code, message, data) => ({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
});
function toolResult(payload, isError = false) {
    return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        ...(isError ? { isError: true } : {}),
    };
}
async function readResource(uri, rc) {
    const ctx = await rc.tool();
    const data = await ctx.data();
    let body;
    if (uri === 'spenza://categories') {
        body = {
            builtInTypes: category_definitions_1.CATEGORY_DEFS.map((c) => ({ type: c.name, bucket: (0, category_definitions_1.budgetGroupToBudgetCategory)(c.group), recommendedPct: c.recommendedPct })),
            yourLimits: data.limits.map((l) => ({ type: l.type, bucket: l.category, limitPctOfIncome: l.userPercentage })),
        };
    }
    else if (uri === 'spenza://settings') {
        body = {
            currency: data.currency,
            timezone: ctx.timezone,
            today: (0, local_date_1.toLocalDateString)(ctx.now),
            mode: data.family ? `family (${data.family.role})` : 'single',
            dataAsOf: data.dataAsOf,
        };
    }
    else {
        return null;
    }
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(body, null, 2) }] };
}
function monthlyReviewPrompt(args) {
    const month = typeof args['month'] === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(args['month']) ? args['month'] : null;
    const which = month ? `for ${month}` : 'for the current month';
    return {
        description: `Monthly money review ${which}`,
        messages: [
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: `Give me a monthly money review ${which} using my Spenza data.\n` +
                        `1. Call get_spending_summary${month ? ` with month ${month}` : ''} and get_budget_status${month ? ` with month ${month}` : ''}.\n` +
                        '2. Call get_debts_and_dues with days 30.\n' +
                        'Then write: where the money went (top types and buckets, change vs last month); which limits are near or over; ' +
                        'what is due in the next 30 days; and three specific, practical suggestions based on these numbers. ' +
                        'Use my currency, keep it short, and do not invent numbers that the tools did not return.',
                },
            },
        ],
    };
}
async function handleRpc(msg, rc) {
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
        return fail(null, exports.RPC.invalidRequest, 'Invalid JSON-RPC request');
    }
    const req = msg;
    const isNotification = req.id === undefined;
    const params = (req.params ?? {});
    // We handle no notifications (notifications/initialized etc.); they never get a response.
    if (isNotification)
        return null;
    try {
        switch (req.method) {
            case 'initialize': {
                const requested = typeof params['protocolVersion'] === 'string' ? params['protocolVersion'] : '';
                return ok(req.id, {
                    protocolVersion: exports.SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : exports.DEFAULT_PROTOCOL_VERSION,
                    capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } },
                    serverInfo: exports.SERVER_INFO,
                    instructions: INSTRUCTIONS,
                });
            }
            case 'ping':
                return ok(req.id, {});
            case 'tools/list':
                return ok(req.id, {
                    tools: tools_1.TOOLS.map((t) => ({
                        name: t.name,
                        title: t.title,
                        description: t.description,
                        inputSchema: t.inputSchema,
                        annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
                    })),
                });
            case 'tools/call': {
                const name = params['name'];
                const tool = typeof name === 'string' ? tools_1.TOOL_BY_NAME.get(name) : undefined;
                if (!tool)
                    return fail(req.id, exports.RPC.invalidParams, `Unknown tool: ${String(name)}`);
                const args = params['arguments'];
                if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
                    return fail(req.id, exports.RPC.invalidParams, 'arguments must be an object');
                }
                try {
                    await rc.requirePro();
                    const result = await tool.run((args ?? {}), await rc.tool());
                    return ok(req.id, toolResult(result));
                }
                catch (err) {
                    if (err instanceof errors_1.McpToolError)
                        return ok(req.id, toolResult({ error: err.code, message: err.message }, true));
                    throw err;
                }
            }
            case 'resources/list':
                return ok(req.id, { resources: RESOURCES });
            case 'resources/templates/list':
                return ok(req.id, { resourceTemplates: [] });
            case 'resources/read': {
                await rc.requirePro();
                const result = await readResource(String(params['uri'] ?? ''), rc);
                if (!result)
                    return fail(req.id, -32002, 'Resource not found', { uri: params['uri'] });
                return ok(req.id, result);
            }
            case 'prompts/list':
                return ok(req.id, { prompts: PROMPTS });
            case 'prompts/get': {
                if (params['name'] !== 'monthly_review')
                    return fail(req.id, exports.RPC.invalidParams, `Unknown prompt: ${String(params['name'])}`);
                return ok(req.id, monthlyReviewPrompt((params['arguments'] ?? {})));
            }
            default:
                return fail(req.id, exports.RPC.methodNotFound, `Method not found: ${req.method}`);
        }
    }
    catch (err) {
        if (err instanceof errors_1.McpToolError)
            return fail(req.id, exports.RPC.invalidRequest, err.message, { code: err.code });
        console.error('[mcp] rpc failed', req.method, err instanceof Error ? err.message : 'unknown');
        return fail(req.id, exports.RPC.internal, 'Internal error');
    }
}
//# sourceMappingURL=protocol.js.map