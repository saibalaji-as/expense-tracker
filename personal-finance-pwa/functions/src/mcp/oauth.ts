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
import * as admin from 'firebase-admin';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import {
  COLLECTIONS,
  DRIVE_APPDATA_SCOPE,
  GOOGLE_CALLBACK_URL,
  GOOGLE_SCOPES,
  GOOGLE_WEB_CLIENT_ID,
  MCP_RESOURCE_URL,
  MCP_SCOPE,
  OAUTH_ISSUER,
  PATHS,
  PUBLIC_BASE_URL,
  TTL,
} from './config';
import { decodeJwtPayload, exchangeGoogleCode, forgetGoogleAccessToken } from './google-auth';
import { isAllowedRedirectUri, randomToken, safeEqual, sha256Hex, verifyPkceS256, withParams } from './oauth-crypto';

const db = () => admin.firestore();
const ts = (ms: number) => admin.firestore.Timestamp.fromMillis(ms);
const millis = (v: unknown): number => (v instanceof admin.firestore.Timestamp ? v.toMillis() : 0);

// ─── Metadata ────────────────────────────────────────────────────────────────

export function authServerMetadata(): Record<string, unknown> {
  return {
    issuer: OAUTH_ISSUER,
    authorization_endpoint: `${PUBLIC_BASE_URL}${PATHS.authorize}`,
    token_endpoint: `${PUBLIC_BASE_URL}${PATHS.token}`,
    registration_endpoint: `${PUBLIC_BASE_URL}${PATHS.register}`,
    revocation_endpoint: `${PUBLIC_BASE_URL}${PATHS.revoke}`,
    scopes_supported: [MCP_SCOPE],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    service_documentation: `${PUBLIC_BASE_URL}/`,
  };
}

export function protectedResourceMetadata(): Record<string, unknown> {
  return {
    resource: MCP_RESOURCE_URL,
    authorization_servers: [OAUTH_ISSUER],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Spenza (read-only)',
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function oauthError(res: Response, status: number, error: string, description: string): void {
  res.status(status).set('Cache-Control', 'no-store').json({ error, error_description: description });
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(res: Response, status: number, title: string, message: string, actionHtml = ''): void {
  res
    .status(status)
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>${esc(title)} · Spenza</title></head>` +
        `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;line-height:1.5">` +
        `<h1 style="font-size:1.25rem">${esc(title)}</h1><p>${message}</p>${actionHtml}</body></html>`,
    );
}

/** Reads params from the form/JSON body (functions parse both) or the query. */
function param(req: Request, key: string): string | undefined {
  const fromBody = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>)[key] : undefined;
  const v = fromBody ?? req.query[key];
  return typeof v === 'string' && v !== '' ? v : undefined;
}

interface ClientRecord {
  clientName: string;
  redirectUris: string[];
  authMethod: 'none' | 'client_secret_post' | 'client_secret_basic';
  secretHash: string | null;
}

async function getClient(clientId: string | undefined): Promise<ClientRecord | null> {
  if (!clientId || clientId.length > 200) return null;
  const snap = await db().collection(COLLECTIONS.clients).doc(clientId).get();
  return snap.exists ? (snap.data() as ClientRecord) : null;
}

/** client_secret_basic / client_secret_post / none, per the client's registration. */
async function authenticateClient(req: Request): Promise<{ clientId: string; client: ClientRecord } | null> {
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
  if (!client || !clientId) return null;
  if (client.secretHash) {
    if (!secret || !safeEqual(sha256Hex(secret), client.secretHash)) return null;
  }
  return { clientId, client };
}

// ─── Registration (RFC 7591) ─────────────────────────────────────────────────

const registrationsByIp = new Map<string, number[]>();

export async function register(req: Request, res: Response): Promise<void> {
  const ip = req.ip ?? 'unknown';
  const recent = (registrationsByIp.get(ip) ?? []).filter((t) => Date.now() - t < 60 * 60 * 1000);
  if (recent.length >= 20) return oauthError(res, 429, 'invalid_client_metadata', 'Too many registrations');
  registrationsByIp.set(ip, [...recent, Date.now()]);

  const body = (req.body ?? {}) as Record<string, unknown>;
  const redirectUris = body['redirect_uris'];
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10 || !redirectUris.every(isAllowedRedirectUri)) {
    return oauthError(res, 400, 'invalid_redirect_uri', 'redirect_uris must be 1-10 https (or loopback http) URLs without fragments');
  }
  const requestedMethod = body['token_endpoint_auth_method'] ?? 'none';
  if (requestedMethod !== 'none' && requestedMethod !== 'client_secret_post' && requestedMethod !== 'client_secret_basic') {
    return oauthError(res, 400, 'invalid_client_metadata', 'Unsupported token_endpoint_auth_method');
  }
  const grantTypes = Array.isArray(body['grant_types']) ? (body['grant_types'] as unknown[]) : ['authorization_code', 'refresh_token'];
  if (!grantTypes.every((g) => g === 'authorization_code' || g === 'refresh_token')) {
    return oauthError(res, 400, 'invalid_client_metadata', 'Only authorization_code and refresh_token grants are supported');
  }

  const clientId = `spz_${randomToken(18)}`;
  const secret = requestedMethod === 'none' ? null : randomToken(32);
  const clientName = typeof body['client_name'] === 'string' ? body['client_name'].slice(0, 100) : 'MCP client';
  const record: ClientRecord = {
    clientName,
    redirectUris: redirectUris as string[],
    authMethod: requestedMethod,
    secretHash: secret ? sha256Hex(secret) : null,
  };
  await db().collection(COLLECTIONS.clients).doc(clientId).set({ ...record, createdAt: ts(Date.now()) });

  res.status(201).set('Cache-Control', 'no-store').json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_name: clientName,
    redirect_uris: record.redirectUris,
    token_endpoint_auth_method: requestedMethod,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: MCP_SCOPE,
  });
}

// ─── Authorize → Google ──────────────────────────────────────────────────────

export async function authorize(req: Request, res: Response): Promise<void> {
  const clientId = param(req, 'client_id');
  const redirectUri = param(req, 'redirect_uri');
  const client = await getClient(clientId);
  if (!client) return page(res, 400, 'Unknown app', esc('This app is not registered with Spenza. Try connecting again from the app.'));
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return page(res, 400, 'Invalid redirect', esc('The return address does not match what this app registered.'));
  }
  // From here on, errors go back to the client.
  const state = param(req, 'state');
  const back = (error: string, description: string) =>
    res.redirect(302, withParams(redirectUri, { error, error_description: description, state, iss: OAUTH_ISSUER }));

  if (param(req, 'response_type') !== 'code') return back('unsupported_response_type', 'Only response_type=code is supported');
  const codeChallenge = param(req, 'code_challenge');
  if (!codeChallenge || param(req, 'code_challenge_method') !== 'S256') {
    return back('invalid_request', 'PKCE with code_challenge_method=S256 is required');
  }
  const scope = param(req, 'scope');
  if (scope && !scope.split(' ').every((s) => s === MCP_SCOPE)) return back('invalid_scope', `Only ${MCP_SCOPE} is available`);
  const resource = param(req, 'resource');
  if (resource && resource.replace(/\/$/, '') !== MCP_RESOURCE_URL) return back('invalid_target', 'Unknown resource');

  const requestId = randomToken(24);
  await db().collection(COLLECTIONS.authRequests).doc(requestId).set({
    clientId,
    redirectUri,
    codeChallenge,
    state: state ?? null,
    expiresAt: ts(Date.now() + TTL.authRequestMs),
  });

  const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  google.searchParams.set('client_id', GOOGLE_WEB_CLIENT_ID);
  google.searchParams.set('redirect_uri', GOOGLE_CALLBACK_URL);
  google.searchParams.set('response_type', 'code');
  google.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
  google.searchParams.set('access_type', 'offline');
  google.searchParams.set('prompt', 'consent'); // always returns a refresh token
  google.searchParams.set('include_granted_scopes', 'true');
  google.searchParams.set('state', requestId);

  // Consent interstitial: anyone can register a client, so the user must see WHO is
  // asking and WHERE the access goes before signing in (anti-phishing).
  const host = new URL(redirectUri).host;
  page(
    res,
    200,
    'Allow read-only access to Spenza?',
    `<strong>${esc(client.clientName)}</strong> (returns to <strong>${esc(host)}</strong>) wants to <strong>read</strong> ` +
      `your Spenza spending, budgets, cards, loans and circles. It cannot add, change or delete anything. ` +
      `Only continue if you started this from that app.`,
    `<p><a href="${esc(google.toString())}" style="display:inline-block;padding:.6rem 1rem;border-radius:.5rem;` +
      `background:#1a73e8;color:#fff;text-decoration:none">Continue with Google</a></p>` +
      `<p style="color:#666;font-size:.9rem">You can disconnect at any time from Spenza Settings.</p>`,
  );
}

// ─── Google callback → our code ──────────────────────────────────────────────

export async function googleCallback(
  req: Request,
  res: Response,
  clientSecret: string,
  isPro: (uid: string) => Promise<boolean>,
): Promise<void> {
  const requestId = typeof req.query['state'] === 'string' ? req.query['state'] : '';
  const requestRef = requestId ? db().collection(COLLECTIONS.authRequests).doc(requestId) : null;
  const snap = requestRef ? await requestRef.get() : null;
  if (!requestRef || !snap?.exists || millis(snap.data()?.['expiresAt']) < Date.now()) {
    return page(res, 400, 'Sign-in expired', esc('This sign-in link has expired. Start connecting Spenza again from your app.'));
  }
  await requestRef.delete(); // single use
  const request = snap.data() as { clientId: string; redirectUri: string; codeChallenge: string; state: string | null };
  const back = (params: Record<string, string>) =>
    res.redirect(302, withParams(request.redirectUri, { ...params, state: request.state ?? undefined, iss: OAUTH_ISSUER }));

  if (typeof req.query['error'] === 'string' || typeof req.query['code'] !== 'string') {
    return back({ error: 'access_denied', error_description: 'Google sign-in was cancelled' });
  }

  const token = await exchangeGoogleCode(req.query['code'], clientSecret);
  if (!token.access_token || !token.id_token) {
    console.warn('[mcp] google code exchange failed', token.error ?? 'no token');
    return back({ error: 'server_error', error_description: 'Google sign-in failed. Please try again.' });
  }
  if (!(token.scope ?? '').split(' ').includes(DRIVE_APPDATA_SCOPE)) {
    return back({ error: 'access_denied', error_description: 'Spenza needs access to its own Google Drive data. Tick the Drive box when you sign in.' });
  }
  const claims = decodeJwtPayload(token.id_token) ?? {};
  const sub = typeof claims['sub'] === 'string' ? claims['sub'] : null;
  const email = typeof claims['email'] === 'string' ? claims['email'] : null;
  if (!sub) return back({ error: 'server_error', error_description: 'Google did not identify the account' });

  // The app signs into Firebase with this Google account, so the Firebase user is found by provider uid.
  let uid: string;
  try {
    uid = (await admin.auth().getUserByProviderUid('google.com', sub)).uid;
  } catch {
    return back({ error: 'access_denied', error_description: `No Spenza account uses ${email ?? 'this Google account'}. Sign in to the Spenza app first.` });
  }
  if (!(await isPro(uid))) {
    return back({ error: 'access_denied', error_description: 'Spenza for Claude is a Pro feature. Upgrade to Spenza Pro in the app.' });
  }

  const grantRef = db().collection(COLLECTIONS.grants).doc(uid);
  const existing = await grantRef.get();
  const refreshToken = token.refresh_token ?? (existing.data()?.['refreshToken'] as string | undefined);
  if (!refreshToken) return back({ error: 'server_error', error_description: 'Google did not grant offline access. Please try again.' });
  await grantRef.set({
    googleSub: sub,
    email,
    refreshToken,
    scope: token.scope ?? null,
    updatedAt: ts(Date.now()),
    ...(existing.exists ? {} : { createdAt: ts(Date.now()) }),
  }, { merge: true });
  forgetGoogleAccessToken(uid);

  const code = randomToken(32);
  await db().collection(COLLECTIONS.authCodes).doc(sha256Hex(code)).set({
    uid,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    expiresAt: ts(Date.now() + TTL.authCodeMs),
  });
  back({ code });
}

// ─── Token endpoint ──────────────────────────────────────────────────────────

async function issueTokens(uid: string, clientId: string): Promise<Record<string, unknown>> {
  const access = randomToken(32);
  const refresh = randomToken(32);
  const now = Date.now();
  const batch = db().batch();
  const tokens = db().collection(COLLECTIONS.tokens);
  batch.set(tokens.doc(sha256Hex(access)), { kind: 'access', uid, clientId, scope: MCP_SCOPE, expiresAt: ts(now + TTL.accessTokenMs), createdAt: ts(now) });
  batch.set(tokens.doc(sha256Hex(refresh)), { kind: 'refresh', uid, clientId, scope: MCP_SCOPE, expiresAt: ts(now + TTL.refreshTokenMs), createdAt: ts(now) });
  await batch.commit();
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: Math.floor(TTL.accessTokenMs / 1000),
    refresh_token: refresh,
    scope: MCP_SCOPE,
  };
}

export async function token(req: Request, res: Response): Promise<void> {
  const auth = await authenticateClient(req);
  if (!auth) return oauthError(res, 401, 'invalid_client', 'Client authentication failed');
  const grantType = param(req, 'grant_type');

  if (grantType === 'authorization_code') {
    const code = param(req, 'code');
    const verifier = param(req, 'code_verifier');
    if (!code || !verifier) return oauthError(res, 400, 'invalid_request', 'code and code_verifier are required');
    const ref = db().collection(COLLECTIONS.authCodes).doc(sha256Hex(code));
    // Single use even under concurrent redemption.
    const stored = await db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return null;
      tx.delete(ref);
      return s.data() as { uid: string; clientId: string; redirectUri: string; codeChallenge: string; expiresAt: unknown };
    });
    if (!stored || millis(stored.expiresAt) < Date.now()) return oauthError(res, 400, 'invalid_grant', 'Code is invalid or expired');
    if (stored.clientId !== auth.clientId) return oauthError(res, 400, 'invalid_grant', 'Code was issued to another client');
    const redirectUri = param(req, 'redirect_uri');
    if (redirectUri && redirectUri !== stored.redirectUri) return oauthError(res, 400, 'invalid_grant', 'redirect_uri mismatch');
    if (!verifyPkceS256(verifier, stored.codeChallenge)) return oauthError(res, 400, 'invalid_grant', 'PKCE verification failed');
    res.set('Cache-Control', 'no-store').json(await issueTokens(stored.uid, auth.clientId));
    return;
  }

  if (grantType === 'refresh_token') {
    const refresh = param(req, 'refresh_token');
    if (!refresh) return oauthError(res, 400, 'invalid_request', 'refresh_token is required');
    const ref = db().collection(COLLECTIONS.tokens).doc(sha256Hex(refresh));
    const stored = await db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return null;
      tx.delete(ref); // rotation: a refresh token works once
      return s.data() as { kind: string; uid: string; clientId: string; expiresAt: unknown };
    });
    if (!stored || stored.kind !== 'refresh' || millis(stored.expiresAt) < Date.now() || stored.clientId !== auth.clientId) {
      return oauthError(res, 400, 'invalid_grant', 'Refresh token is invalid or expired');
    }
    const grant = await db().collection(COLLECTIONS.grants).doc(stored.uid).get();
    if (!grant.exists) return oauthError(res, 400, 'invalid_grant', 'Spenza was disconnected. Connect again.');
    res.set('Cache-Control', 'no-store').json(await issueTokens(stored.uid, auth.clientId));
    return;
  }

  oauthError(res, 400, 'unsupported_grant_type', 'Use authorization_code or refresh_token');
}

export async function revoke(req: Request, res: Response): Promise<void> {
  const auth = await authenticateClient(req);
  if (!auth) return oauthError(res, 401, 'invalid_client', 'Client authentication failed');
  const t = param(req, 'token');
  if (t) {
    const ref = db().collection(COLLECTIONS.tokens).doc(sha256Hex(t));
    const s = await ref.get();
    if (s.exists && s.data()?.['clientId'] === auth.clientId) await ref.delete();
  }
  res.status(200).set('Cache-Control', 'no-store').send(''); // RFC 7009: always 200
}

// ─── Resource side ───────────────────────────────────────────────────────────

export async function verifyAccessToken(bearer: string): Promise<{ uid: string; clientId: string } | null> {
  if (!bearer || bearer.length > 200) return null;
  const s = await db().collection(COLLECTIONS.tokens).doc(sha256Hex(bearer)).get();
  const d = s.data();
  if (!s.exists || !d || d['kind'] !== 'access' || millis(d['expiresAt']) < Date.now()) return null;
  return { uid: d['uid'] as string, clientId: d['clientId'] as string };
}

/**
 * Removes Claude's access for a user: the stored Google grant and every MCP token.
 * Called by the app (Firebase ID token). The Google refresh token is NOT revoked at
 * Google — that would also revoke the app's own sign-in, which uses the same client.
 */
export async function disconnectUser(uid: string): Promise<number> {
  const tokens = await db().collection(COLLECTIONS.tokens).where('uid', '==', uid).get();
  const refs = [db().collection(COLLECTIONS.grants).doc(uid), ...tokens.docs.map((d) => d.ref)];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db().batch();
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  forgetGoogleAccessToken(uid);
  return tokens.size;
}
