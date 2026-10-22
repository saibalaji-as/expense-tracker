"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.mcp = void 0;
exports.route = route;
/**
 * The `mcp` Function. Firebase Hosting on spenza.site rewrites these paths here:
 *   /mcp                                        MCP endpoint (bearer token)
 *   /.well-known/oauth-protected-resource[/mcp] RFC 9728 metadata
 *   /.well-known/oauth-authorization-server     RFC 8414 metadata
 *   /oauth/register|authorize|callback|token|revoke   OAuth server
 *   /oauth/disconnect                           app-side "Disconnect Claude" (Firebase ID token)
 * Read-only: nothing on this path writes user data.
 */
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const auth_1 = require("../auth");
const config_1 = require("./config");
const errors_1 = require("./errors");
const google_auth_1 = require("./google-auth");
const loaders_1 = require("./loaders");
const oauth_1 = require("./oauth");
const protocol_1 = require("./protocol");
const zoned_time_1 = require("./zoned-time");
const proCache = new Map();
async function isPro(uid) {
    const hit = proCache.get(uid);
    if (hit && Date.now() - hit.at < config_1.TTL.proCacheMs)
        return hit.pro;
    let pro = true;
    try {
        await (0, auth_1.requireProTier)(uid);
    }
    catch {
        pro = false;
    }
    if (proCache.size > 5000)
        proCache.clear();
    proCache.set(uid, { pro, at: Date.now() });
    return pro;
}
const calls = new Map();
function rateLimited(uid) {
    const now = Date.now();
    const recent = (calls.get(uid) ?? []).filter((t) => now - t < 60_000);
    recent.push(now);
    if (calls.size > 5000)
        calls.clear();
    calls.set(uid, recent);
    return recent.length > config_1.RATE_LIMIT_PER_MINUTE;
}
function cors(res) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID');
    res.set('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id');
}
function unauthorized(res, description) {
    res
        .status(401)
        .set('WWW-Authenticate', `Bearer error="invalid_token", error_description="${description}", resource_metadata="${config_1.PUBLIC_BASE_URL}${config_1.PATHS.protectedResourceMetadata}/mcp"`)
        .json({ error: 'invalid_token', error_description: description });
}
function bearer(req) {
    return (req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
}
function clientSecret() {
    const secret = process.env[config_1.GOOGLE_CLIENT_SECRET_NAME];
    if (!secret)
        throw new Error(`${config_1.GOOGLE_CLIENT_SECRET_NAME} is not set`);
    return secret;
}
async function handleMcp(req, res) {
    if (req.method !== 'POST') {
        // Stateless server: no SSE stream to open and no session to delete.
        res.status(405).set('Allow', 'POST, OPTIONS').json({ error: 'Use POST' });
        return;
    }
    const auth = await (0, oauth_1.verifyAccessToken)(bearer(req));
    if (!auth)
        return unauthorized(res, 'Sign in to Spenza to continue');
    const { uid } = auth;
    if (rateLimited(uid)) {
        res.status(429).set('Retry-After', '60').json({ error: 'Too many requests. Try again in a minute.' });
        return;
    }
    let toolCtx = null;
    const rc = {
        requirePro: async () => {
            if (!(await isPro(uid)))
                throw (0, errors_1.notPro)();
        },
        tool: () => (toolCtx ??= (0, loaders_1.loadUserTimezone)(uid).then((timezone) => ({
            uid,
            timezone,
            now: (0, zoned_time_1.zonedNow)(timezone),
            data: () => (0, loaders_1.loadSpenzaData)(uid, () => (0, google_auth_1.googleAccessTokenFor)(uid, clientSecret())),
            circles: (circleId) => (0, loaders_1.loadCircles)(uid, circleId),
        }))),
    };
    const body = req.body;
    if (body === undefined || body === null || (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0)) {
        res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: protocol_1.RPC.parse, message: 'Expected a JSON-RPC body' } });
        return;
    }
    if (Array.isArray(body)) {
        const out = (await Promise.all(body.map((m) => (0, protocol_1.handleRpc)(m, rc)))).filter((r) => r !== null);
        if (out.length === 0)
            res.status(202).end();
        else
            res.status(200).json(out);
        return;
    }
    const out = await (0, protocol_1.handleRpc)(body, rc);
    if (out === null)
        res.status(202).end();
    else
        res.status(200).json(out);
}
async function handleDisconnect(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Use POST' });
        return;
    }
    try {
        const decoded = await admin.auth().verifyIdToken(bearer(req));
        const revokedTokens = await (0, oauth_1.disconnectUser)(decoded.uid);
        res.json({ disconnected: true, revokedTokens });
    }
    catch {
        res.status(401).json({ error: 'Unauthorized' });
    }
}
async function route(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    const path = req.path.replace(/\/+$/, '') || '/';
    try {
        switch (path) {
            case config_1.PATHS.mcp:
                return await handleMcp(req, res);
            case config_1.PATHS.protectedResourceMetadata:
            case `${config_1.PATHS.protectedResourceMetadata}/mcp`:
                res.set('Cache-Control', 'public, max-age=3600').json((0, oauth_1.protectedResourceMetadata)());
                return;
            case config_1.PATHS.authServerMetadata:
                res.set('Cache-Control', 'public, max-age=3600').json((0, oauth_1.authServerMetadata)());
                return;
            case config_1.PATHS.register:
                return await (req.method === 'POST' ? (0, oauth_1.register)(req, res) : void res.status(405).end());
            case config_1.PATHS.authorize:
                return await (0, oauth_1.authorize)(req, res);
            case config_1.PATHS.googleCallback:
                return await (0, oauth_1.googleCallback)(req, res, clientSecret(), isPro);
            case config_1.PATHS.token:
                return await (req.method === 'POST' ? (0, oauth_1.token)(req, res) : void res.status(405).end());
            case config_1.PATHS.revoke:
                return await (req.method === 'POST' ? (0, oauth_1.revoke)(req, res) : void res.status(405).end());
            case config_1.PATHS.disconnect:
                return await handleDisconnect(req, res);
            default:
                res.status(404).json({ error: 'Not found', mcp: config_1.MCP_RESOURCE_URL });
        }
    }
    catch (err) {
        if (err instanceof errors_1.McpToolError) {
            res.status(400).json({ error: err.code, message: err.message });
            return;
        }
        console.error('[mcp] request failed', path, err instanceof Error ? err.message : 'unknown');
        if (!res.headersSent)
            res.status(500).json({ error: 'Internal error' });
    }
}
exports.mcp = (0, https_1.onRequest)({
    invoker: 'public',
    secrets: [config_1.GOOGLE_CLIENT_SECRET_NAME],
    memory: '512MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
    concurrency: 40,
}, route);
//# sourceMappingURL=http.js.map