/**
 * The `mcp` Function. Firebase Hosting on spenza.site rewrites these paths here:
 *   /mcp                                        MCP endpoint (bearer token)
 *   /.well-known/oauth-protected-resource[/mcp] RFC 9728 metadata
 *   /.well-known/oauth-authorization-server     RFC 8414 metadata
 *   /oauth/register|authorize|callback|token|revoke   OAuth server
 *   /oauth/disconnect                           app-side "Disconnect Claude" (Firebase ID token)
 * Read-only: nothing on this path writes user data.
 */
import * as admin from 'firebase-admin';
import { onRequest, type Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { requireProTier } from '../auth';
import { GOOGLE_CLIENT_SECRET_NAME, MCP_RESOURCE_URL, PATHS, PUBLIC_BASE_URL, RATE_LIMIT_PER_MINUTE, TTL } from './config';
import { McpToolError, notPro } from './errors';
import { googleAccessTokenFor } from './google-auth';
import { loadCircles, loadSpenzaData, loadUserTimezone } from './loaders';
import { authorize, authServerMetadata, disconnectUser, googleCallback, protectedResourceMetadata, register, revoke, token, verifyAccessToken } from './oauth';
import { handleRpc, RPC, type JsonRpcResponse, type RequestContext } from './protocol';
import type { ToolContext } from './tools';
import { zonedNow } from './zoned-time';

const proCache = new Map<string, { pro: boolean; at: number }>();

async function isPro(uid: string): Promise<boolean> {
  const hit = proCache.get(uid);
  if (hit && Date.now() - hit.at < TTL.proCacheMs) return hit.pro;
  let pro = true;
  try {
    await requireProTier(uid);
  } catch {
    pro = false;
  }
  if (proCache.size > 5000) proCache.clear();
  proCache.set(uid, { pro, at: Date.now() });
  return pro;
}

const calls = new Map<string, number[]>();
function rateLimited(uid: string): boolean {
  const now = Date.now();
  const recent = (calls.get(uid) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  if (calls.size > 5000) calls.clear();
  calls.set(uid, recent);
  return recent.length > RATE_LIMIT_PER_MINUTE;
}

function cors(res: Response): void {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID');
  res.set('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id');
}

function unauthorized(res: Response, description: string): void {
  res
    .status(401)
    .set(
      'WWW-Authenticate',
      `Bearer error="invalid_token", error_description="${description}", resource_metadata="${PUBLIC_BASE_URL}${PATHS.protectedResourceMetadata}/mcp"`,
    )
    .json({ error: 'invalid_token', error_description: description });
}

function bearer(req: Request): string {
  return (req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
}

function clientSecret(): string {
  const secret = process.env[GOOGLE_CLIENT_SECRET_NAME];
  if (!secret) throw new Error(`${GOOGLE_CLIENT_SECRET_NAME} is not set`);
  return secret;
}

async function handleMcp(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    // Stateless server: no SSE stream to open and no session to delete.
    res.status(405).set('Allow', 'POST, OPTIONS').json({ error: 'Use POST' });
    return;
  }
  const auth = await verifyAccessToken(bearer(req));
  if (!auth) return unauthorized(res, 'Sign in to Spenza to continue');
  const { uid } = auth;
  if (rateLimited(uid)) {
    res.status(429).set('Retry-After', '60').json({ error: 'Too many requests. Try again in a minute.' });
    return;
  }

  let toolCtx: Promise<ToolContext> | null = null;
  const rc: RequestContext = {
    requirePro: async () => {
      if (!(await isPro(uid))) throw notPro();
    },
    tool: () =>
      (toolCtx ??= loadUserTimezone(uid).then((timezone) => ({
        uid,
        timezone,
        now: zonedNow(timezone),
        data: () => loadSpenzaData(uid, () => googleAccessTokenFor(uid, clientSecret())),
        circles: (circleId?: string) => loadCircles(uid, circleId),
      }))),
  };

  const body: unknown = req.body;
  if (body === undefined || body === null || (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0)) {
    res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: RPC.parse, message: 'Expected a JSON-RPC body' } });
    return;
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleRpc(m, rc)))).filter((r): r is JsonRpcResponse => r !== null);
    if (out.length === 0) res.status(202).end();
    else res.status(200).json(out);
    return;
  }
  const out = await handleRpc(body, rc);
  if (out === null) res.status(202).end();
  else res.status(200).json(out);
}

async function handleDisconnect(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(bearer(req));
    const revokedTokens = await disconnectUser(decoded.uid);
    res.json({ disconnected: true, revokedTokens });
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

export async function route(req: Request, res: Response): Promise<void> {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  const path = req.path.replace(/\/+$/, '') || '/';
  try {
    switch (path) {
      case PATHS.mcp:
        return await handleMcp(req, res);
      case PATHS.protectedResourceMetadata:
      case `${PATHS.protectedResourceMetadata}/mcp`:
        res.set('Cache-Control', 'public, max-age=3600').json(protectedResourceMetadata());
        return;
      case PATHS.authServerMetadata:
        res.set('Cache-Control', 'public, max-age=3600').json(authServerMetadata());
        return;
      case PATHS.register:
        return await (req.method === 'POST' ? register(req, res) : void res.status(405).end());
      case PATHS.authorize:
        return await authorize(req, res);
      case PATHS.googleCallback:
        return await googleCallback(req, res, clientSecret(), isPro);
      case PATHS.token:
        return await (req.method === 'POST' ? token(req, res) : void res.status(405).end());
      case PATHS.revoke:
        return await (req.method === 'POST' ? revoke(req, res) : void res.status(405).end());
      case PATHS.disconnect:
        return await handleDisconnect(req, res);
      default:
        res.status(404).json({ error: 'Not found', mcp: MCP_RESOURCE_URL });
    }
  } catch (err) {
    if (err instanceof McpToolError) {
      res.status(400).json({ error: err.code, message: err.message });
      return;
    }
    console.error('[mcp] request failed', path, err instanceof Error ? err.message : 'unknown');
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
  }
}

export const mcp = onRequest(
  {
    invoker: 'public',
    secrets: [GOOGLE_CLIENT_SECRET_NAME],
    memory: '512MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
    concurrency: 40,
  },
  route,
);
