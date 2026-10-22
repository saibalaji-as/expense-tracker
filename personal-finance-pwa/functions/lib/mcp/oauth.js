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
exports.authServerMetadata = authServerMetadata;
exports.protectedResourceMetadata = protectedResourceMetadata;
exports.register = register;
exports.authorize = authorize;
exports.googleCallback = googleCallback;
exports.token = token;
exports.revoke = revoke;
exports.verifyAccessToken = verifyAccessToken;
exports.disconnectUser = disconnectUser;
/**
 * OAuth 2.1 authorization server for the MCP endpoint (MCP authorization spec):
 * metadata (RFC 8414 / RFC 9728), dynamic client registration (RFC 7591),
 * authorization code + PKCE S256, refresh-token rotation, revocation.
 *
 * Sign-in is delegated to Google: /oauth/authorize sends the user to Google with
 * the Drive appdata scope, /oauth/callback maps the Google account to the
 * existing Spenza (Firebase) user, checks Pro, stores the Google refresh token
 * in mcpGrants/{uid}, then returns our own code to the MCP client.
 * Every token is stored only as a SHA-256 hash.
 */
const admin = __importStar(require("firebase-admin"));
const config_1 = require("./config");
const google_auth_1 = require("./google-auth");
const oauth_crypto_1 = require("./oauth-crypto");
const db = () => admin.firestore();
const ts = (ms) => admin.firestore.Timestamp.fromMillis(ms);
const millis = (v) => (v instanceof admin.firestore.Timestamp ? v.toMillis() : 0);
// ─── Metadata ────────────────────────────────────────────────────────────────
function authServerMetadata() {
    return {
        issuer: config_1.OAUTH_ISSUER,
        authorization_endpoint: `${config_1.PUBLIC_BASE_URL}${config_1.PATHS.authorize}`,
        token_endpoint: `${config_1.PUBLIC_BASE_URL}${config_1.PATHS.token}`,
        registration_endpoint: `${config_1.PUBLIC_BASE_URL}${config_1.PATHS.register}`,
        revocation_endpoint: `${config_1.PUBLIC_BASE_URL}${config_1.PATHS.revoke}`,
        scopes_supported: [config_1.MCP_SCOPE],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
        revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
        service_documentation: `${config_1.PUBLIC_BASE_URL}/`,
    };
}
function protectedResourceMetadata() {
    return {
        resource: config_1.MCP_RESOURCE_URL,
        authorization_servers: [config_1.OAUTH_ISSUER],
        scopes_supported: [config_1.MCP_SCOPE],
        bearer_methods_supported: ['header'],
        resource_name: 'Spenza (read-only)',
    };
}
// ─── Helpers ─────────────────────────────────────────────────────────────────
function oauthError(res, status, error, description) {
    res.status(status).set('Cache-Control', 'no-store').json({ error, error_description: description });
}
const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function page(res, status, title, message, actionHtml = '') {
    res
        .status(status)
        .set('Cache-Control', 'no-store')
        .type('html')
        .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>${esc(title)} · Spenza</title></head>` +
        `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;line-height:1.5">` +
        `<h1 style="font-size:1.25rem">${esc(title)}</h1><p>${message}</p>${actionHtml}</body></html>`);
}
/** Reads params from the form/JSON body (functions parse both) or the query. */
function param(req, key) {
    const fromBody = req.body && typeof req.body === 'object' ? req.body[key] : undefined;
    const v = fromBody ?? req.query[key];
    return typeof v === 'string' && v !== '' ? v : undefined;
}
async function getClient(clientId) {
    if (!clientId || clientId.length > 200)
        return null;
    const snap = await db().collection(config_1.COLLECTIONS.clients).doc(clientId).get();
    return snap.exists ? snap.data() : null;
}
/** client_secret_basic / client_secret_post / none, per the client's registration. */
async function authenticateClient(req) {
    let clientId = param(req, 'client_id');
    let secret = param(req, 'client_secret');
    const basic = (req.headers.authorization ?? '').match(/^Basic (.+)$/);
    if (basic) {
        const decoded = Buffer.from(basic[1], 'base64').toString('utf8');
        const i = decoded.indexOf(':');
        if (i > 0) {
            clientId = decodeURIComponent(decoded.slice(0, i));
            secret = decodeURIComponent(decoded.slice(i + 1));
        }
    }
    const client = await getClient(clientId);
    if (!client || !clientId)
        return null;
    if (client.secretHash) {
        if (!secret || !(0, oauth_crypto_1.safeEqual)((0, oauth_crypto_1.sha256Hex)(secret), client.secretHash))
            return null;
    }
    return { clientId, client };
}
// ─── Registration (RFC 7591) ─────────────────────────────────────────────────
const registrationsByIp = new Map();
async function register(req, res) {
    const ip = req.ip ?? 'unknown';
    const recent = (registrationsByIp.get(ip) ?? []).filter((t) => Date.now() - t < 60 * 60 * 1000);
    if (recent.length >= 20)
        return oauthError(res, 429, 'invalid_client_metadata', 'Too many registrations');
    registrationsByIp.set(ip, [...recent, Date.now()]);
    const body = (req.body ?? {});
    const redirectUris = body['redirect_uris'];
    if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10 || !redirectUris.every(oauth_crypto_1.isAllowedRedirectUri)) {
        return oauthError(res, 400, 'invalid_redirect_uri', 'redirect_uris must be 1-10 https (or loopback http) URLs without fragments');
    }
    const requestedMethod = body['token_endpoint_auth_method'] ?? 'none';
    if (requestedMethod !== 'none' && requestedMethod !== 'client_secret_post' && requestedMethod !== 'client_secret_basic') {
        return oauthError(res, 400, 'invalid_client_metadata', 'Unsupported token_endpoint_auth_method');
    }
    const grantTypes = Array.isArray(body['grant_types']) ? body['grant_types'] : ['authorization_code', 'refresh_token'];
    if (!grantTypes.every((g) => g === 'authorization_code' || g === 'refresh_token')) {
        return oauthError(res, 400, 'invalid_client_metadata', 'Only authorization_code and refresh_token grants are supported');
    }
    const clientId = `spz_${(0, oauth_crypto_1.randomToken)(18)}`;
    const secret = requestedMethod === 'none' ? null : (0, oauth_crypto_1.randomToken)(32);
    const clientName = typeof body['client_name'] === 'string' ? body['client_name'].slice(0, 100) : 'MCP client';
    const record = {
        clientName,
        redirectUris: redirectUris,
        authMethod: requestedMethod,
        secretHash: secret ? (0, oauth_crypto_1.sha256Hex)(secret) : null,
    };
    await db().collection(config_1.COLLECTIONS.clients).doc(clientId).set({ ...record, createdAt: ts(Date.now()) });
    res.status(201).set('Cache-Control', 'no-store').json({
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
        client_name: clientName,
        redirect_uris: record.redirectUris,
        token_endpoint_auth_method: requestedMethod,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: config_1.MCP_SCOPE,
    });
}
// ─── Authorize → Google ──────────────────────────────────────────────────────
async function authorize(req, res) {
    const clientId = param(req, 'client_id');
    const redirectUri = param(req, 'redirect_uri');
    const client = await getClient(clientId);
    if (!client)
        return page(res, 400, 'Unknown app', esc('This app is not registered with Spenza. Try connecting again from the app.'));
    if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
        return page(res, 400, 'Invalid redirect', esc('The return address does not match what this app registered.'));
    }
    // From here on, errors go back to the client.
    const state = param(req, 'state');
    const back = (error, description) => res.redirect(302, (0, oauth_crypto_1.withParams)(redirectUri, { error, error_description: description, state, iss: config_1.OAUTH_ISSUER }));
    if (param(req, 'response_type') !== 'code')
        return back('unsupported_response_type', 'Only response_type=code is supported');
    const codeChallenge = param(req, 'code_challenge');
    if (!codeChallenge || param(req, 'code_challenge_method') !== 'S256') {
        return back('invalid_request', 'PKCE with code_challenge_method=S256 is required');
    }
    const scope = param(req, 'scope');
    if (scope && !scope.split(' ').every((s) => s === config_1.MCP_SCOPE))
        return back('invalid_scope', `Only ${config_1.MCP_SCOPE} is available`);
    const resource = param(req, 'resource');
    if (resource && resource.replace(/\/$/, '') !== config_1.MCP_RESOURCE_URL)
        return back('invalid_target', 'Unknown resource');
    const requestId = (0, oauth_crypto_1.randomToken)(24);
    await db().collection(config_1.COLLECTIONS.authRequests).doc(requestId).set({
        clientId,
        redirectUri,
        codeChallenge,
        state: state ?? null,
        expiresAt: ts(Date.now() + config_1.TTL.authRequestMs),
    });
    const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    google.searchParams.set('client_id', config_1.GOOGLE_WEB_CLIENT_ID);
    google.searchParams.set('redirect_uri', config_1.GOOGLE_CALLBACK_URL);
    google.searchParams.set('response_type', 'code');
    google.searchParams.set('scope', config_1.GOOGLE_SCOPES.join(' '));
    google.searchParams.set('access_type', 'offline');
    google.searchParams.set('prompt', 'consent'); // always returns a refresh token
    google.searchParams.set('include_granted_scopes', 'true');
    google.searchParams.set('state', requestId);
    // Consent interstitial: anyone can register a client, so the user must see WHO is
    // asking and WHERE the access goes before signing in (anti-phishing).
    const host = new URL(redirectUri).host;
    page(res, 200, 'Allow read-only access to Spenza?', `<strong>${esc(client.clientName)}</strong> (returns to <strong>${esc(host)}</strong>) wants to <strong>read</strong> ` +
        `your Spenza spending, budgets, cards, loans and circles. It cannot add, change or delete anything. ` +
        `Only continue if you started this from that app.`, `<p><a href="${esc(google.toString())}" style="display:inline-block;padding:.6rem 1rem;border-radius:.5rem;` +
        `background:#1a73e8;color:#fff;text-decoration:none">Continue with Google</a></p>` +
        `<p style="color:#666;font-size:.9rem">You can disconnect at any time from Spenza Settings.</p>`);
}
// ─── Google callback → our code ──────────────────────────────────────────────
async function googleCallback(req, res, clientSecret, isPro) {
    const requestId = typeof req.query['state'] === 'string' ? req.query['state'] : '';
    const requestRef = requestId ? db().collection(config_1.COLLECTIONS.authRequests).doc(requestId) : null;
    const snap = requestRef ? await requestRef.get() : null;
    if (!requestRef || !snap?.exists || millis(snap.data()?.['expiresAt']) < Date.now()) {
        return page(res, 400, 'Sign-in expired', esc('This sign-in link has expired. Start connecting Spenza again from your app.'));
    }
    await requestRef.delete(); // single use
    const request = snap.data();
    const back = (params) => res.redirect(302, (0, oauth_crypto_1.withParams)(request.redirectUri, { ...params, state: request.state ?? undefined, iss: config_1.OAUTH_ISSUER }));
    if (typeof req.query['error'] === 'string' || typeof req.query['code'] !== 'string') {
        return back({ error: 'access_denied', error_description: 'Google sign-in was cancelled' });
    }
    const token = await (0, google_auth_1.exchangeGoogleCode)(req.query['code'], clientSecret);
    if (!token.access_token || !token.id_token) {
        console.warn('[mcp] google code exchange failed', token.error ?? 'no token');
        return back({ error: 'server_error', error_description: 'Google sign-in failed. Please try again.' });
    }
    if (!(token.scope ?? '').split(' ').includes(config_1.DRIVE_APPDATA_SCOPE)) {
        return back({ error: 'access_denied', error_description: 'Spenza needs access to its own Google Drive data. Tick the Drive box when you sign in.' });
    }
    const claims = (0, google_auth_1.decodeJwtPayload)(token.id_token) ?? {};
    const sub = typeof claims['sub'] === 'string' ? claims['sub'] : null;
    const email = typeof claims['email'] === 'string' ? claims['email'] : null;
    if (!sub)
        return back({ error: 'server_error', error_description: 'Google did not identify the account' });
    // The app signs into Firebase with this Google account, so the Firebase user is found by provider uid.
    let uid;
    try {
        uid = (await admin.auth().getUserByProviderUid('google.com', sub)).uid;
    }
    catch {
        return back({ error: 'access_denied', error_description: `No Spenza account uses ${email ?? 'this Google account'}. Sign in to the Spenza app first.` });
    }
    if (!(await isPro(uid))) {
        return back({ error: 'access_denied', error_description: 'Spenza for Claude is a Pro feature. Upgrade to Spenza Pro in the app.' });
    }
    const grantRef = db().collection(config_1.COLLECTIONS.grants).doc(uid);
    const existing = await grantRef.get();
    const refreshToken = token.refresh_token ?? existing.data()?.['refreshToken'];
    if (!refreshToken)
        return back({ error: 'server_error', error_description: 'Google did not grant offline access. Please try again.' });
    await grantRef.set({
        googleSub: sub,
        email,
        refreshToken,
        scope: token.scope ?? null,
        updatedAt: ts(Date.now()),
        ...(existing.exists ? {} : { createdAt: ts(Date.now()) }),
    }, { merge: true });
    (0, google_auth_1.forgetGoogleAccessToken)(uid);
    const code = (0, oauth_crypto_1.randomToken)(32);
    await db().collection(config_1.COLLECTIONS.authCodes).doc((0, oauth_crypto_1.sha256Hex)(code)).set({
        uid,
        clientId: request.clientId,
        redirectUri: request.redirectUri,
        codeChallenge: request.codeChallenge,
        expiresAt: ts(Date.now() + config_1.TTL.authCodeMs),
    });
    back({ code });
}
// ─── Token endpoint ──────────────────────────────────────────────────────────
async function issueTokens(uid, clientId) {
    const access = (0, oauth_crypto_1.randomToken)(32);
    const refresh = (0, oauth_crypto_1.randomToken)(32);
    const now = Date.now();
    const batch = db().batch();
    const tokens = db().collection(config_1.COLLECTIONS.tokens);
    batch.set(tokens.doc((0, oauth_crypto_1.sha256Hex)(access)), { kind: 'access', uid, clientId, scope: config_1.MCP_SCOPE, expiresAt: ts(now + config_1.TTL.accessTokenMs), createdAt: ts(now) });
    batch.set(tokens.doc((0, oauth_crypto_1.sha256Hex)(refresh)), { kind: 'refresh', uid, clientId, scope: config_1.MCP_SCOPE, expiresAt: ts(now + config_1.TTL.refreshTokenMs), createdAt: ts(now) });
    await batch.commit();
    return {
        access_token: access,
        token_type: 'Bearer',
        expires_in: Math.floor(config_1.TTL.accessTokenMs / 1000),
        refresh_token: refresh,
        scope: config_1.MCP_SCOPE,
    };
}
async function token(req, res) {
    const auth = await authenticateClient(req);
    if (!auth)
        return oauthError(res, 401, 'invalid_client', 'Client authentication failed');
    const grantType = param(req, 'grant_type');
    if (grantType === 'authorization_code') {
        const code = param(req, 'code');
        const verifier = param(req, 'code_verifier');
        if (!code || !verifier)
            return oauthError(res, 400, 'invalid_request', 'code and code_verifier are required');
        const ref = db().collection(config_1.COLLECTIONS.authCodes).doc((0, oauth_crypto_1.sha256Hex)(code));
        // Single use even under concurrent redemption.
        const stored = await db().runTransaction(async (tx) => {
            const s = await tx.get(ref);
            if (!s.exists)
                return null;
            tx.delete(ref);
            return s.data();
        });
        if (!stored || millis(stored.expiresAt) < Date.now())
            return oauthError(res, 400, 'invalid_grant', 'Code is invalid or expired');
        if (stored.clientId !== auth.clientId)
            return oauthError(res, 400, 'invalid_grant', 'Code was issued to another client');
        const redirectUri = param(req, 'redirect_uri');
        if (redirectUri && redirectUri !== stored.redirectUri)
            return oauthError(res, 400, 'invalid_grant', 'redirect_uri mismatch');
        if (!(0, oauth_crypto_1.verifyPkceS256)(verifier, stored.codeChallenge))
            return oauthError(res, 400, 'invalid_grant', 'PKCE verification failed');
        res.set('Cache-Control', 'no-store').json(await issueTokens(stored.uid, auth.clientId));
        return;
    }
    if (grantType === 'refresh_token') {
        const refresh = param(req, 'refresh_token');
        if (!refresh)
            return oauthError(res, 400, 'invalid_request', 'refresh_token is required');
        const ref = db().collection(config_1.COLLECTIONS.tokens).doc((0, oauth_crypto_1.sha256Hex)(refresh));
        const stored = await db().runTransaction(async (tx) => {
            const s = await tx.get(ref);
            if (!s.exists)
                return null;
            tx.delete(ref); // rotation: a refresh token works once
            return s.data();
        });
        if (!stored || stored.kind !== 'refresh' || millis(stored.expiresAt) < Date.now() || stored.clientId !== auth.clientId) {
            return oauthError(res, 400, 'invalid_grant', 'Refresh token is invalid or expired');
        }
        const grant = await db().collection(config_1.COLLECTIONS.grants).doc(stored.uid).get();
        if (!grant.exists)
            return oauthError(res, 400, 'invalid_grant', 'Spenza was disconnected. Connect again.');
        res.set('Cache-Control', 'no-store').json(await issueTokens(stored.uid, auth.clientId));
        return;
    }
    oauthError(res, 400, 'unsupported_grant_type', 'Use authorization_code or refresh_token');
}
async function revoke(req, res) {
    const auth = await authenticateClient(req);
    if (!auth)
        return oauthError(res, 401, 'invalid_client', 'Client authentication failed');
    const t = param(req, 'token');
    if (t) {
        const ref = db().collection(config_1.COLLECTIONS.tokens).doc((0, oauth_crypto_1.sha256Hex)(t));
        const s = await ref.get();
        if (s.exists && s.data()?.['clientId'] === auth.clientId)
            await ref.delete();
    }
    res.status(200).set('Cache-Control', 'no-store').send(''); // RFC 7009: always 200
}
// ─── Resource side ───────────────────────────────────────────────────────────
async function verifyAccessToken(bearer) {
    if (!bearer || bearer.length > 200)
        return null;
    const s = await db().collection(config_1.COLLECTIONS.tokens).doc((0, oauth_crypto_1.sha256Hex)(bearer)).get();
    const d = s.data();
    if (!s.exists || !d || d['kind'] !== 'access' || millis(d['expiresAt']) < Date.now())
        return null;
    return { uid: d['uid'], clientId: d['clientId'] };
}
/**
 * Removes Claude's access for a user: the stored Google grant and every MCP token.
 * Called by the app (Firebase ID token). The Google refresh token is NOT revoked at
 * Google — that would also revoke the app's own sign-in, which uses the same client.
 */
async function disconnectUser(uid) {
    const tokens = await db().collection(config_1.COLLECTIONS.tokens).where('uid', '==', uid).get();
    const refs = [db().collection(config_1.COLLECTIONS.grants).doc(uid), ...tokens.docs.map((d) => d.ref)];
    for (let i = 0; i < refs.length; i += 400) {
        const batch = db().batch();
        refs.slice(i, i + 400).forEach((r) => batch.delete(r));
        await batch.commit();
    }
    (0, google_auth_1.forgetGoogleAccessToken)(uid);
    return tokens.size;
}
//# sourceMappingURL=oauth.js.map