/**
 * Google OAuth for the MCP server: exchanging the sign-in code and minting
 * short-lived Drive access tokens from the stored MCP grant (`mcpGrants/{uid}`).
 * The MCP grant is separate from the app's `googleTokens/{sub}` so disconnecting
 * Claude never signs the user out of the app.
 */
import * as admin from 'firebase-admin';
import { COLLECTIONS, GOOGLE_CALLBACK_URL, GOOGLE_WEB_CLIENT_ID } from './config';
import { McpToolError } from './errors';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function postForm(body: Record<string, string>): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  return (await res.json()) as GoogleTokenResponse;
}

export function exchangeGoogleCode(code: string, clientSecret: string): Promise<GoogleTokenResponse> {
  return postForm({
    code,
    client_id: GOOGLE_WEB_CLIENT_ID,
    client_secret: clientSecret,
    redirect_uri: GOOGLE_CALLBACK_URL,
    grant_type: 'authorization_code',
  });
}

/** The id_token comes straight from Google's token endpoint over TLS, so its payload is trusted unverified (as in google-tokens.ts). */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split('.')[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

export function forgetGoogleAccessToken(uid: string): void {
  accessTokenCache.delete(uid);
}

/** A Drive access token for `uid`, refreshed from the MCP grant when needed. */
export async function googleAccessTokenFor(uid: string, clientSecret: string): Promise<string> {
  const cached = accessTokenCache.get(uid);
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

  const grantRef = admin.firestore().collection(COLLECTIONS.grants).doc(uid);
  const grant = await grantRef.get();
  const refreshToken = grant.exists ? (grant.data()?.['refreshToken'] as string | undefined) : undefined;
  if (!refreshToken) {
    throw new McpToolError('DRIVE_ACCESS_REVOKED', 'Spenza is not connected to Google Drive any more. Reconnect Spenza in Claude.');
  }

  const token = await postForm({
    refresh_token: refreshToken,
    client_id: GOOGLE_WEB_CLIENT_ID,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
  if (token.error === 'invalid_grant') {
    // Revoked or expired at Google: drop the dead grant so the next connect starts clean.
    await grantRef.delete().catch(() => undefined);
    throw new McpToolError('DRIVE_ACCESS_REVOKED', 'Google access for Spenza was revoked. Reconnect Spenza in Claude.');
  }
  if (!token.access_token) {
    throw new McpToolError('UPSTREAM_ERROR', 'Could not reach Google Drive. Try again in a minute.');
  }
  accessTokenCache.set(uid, { token: token.access_token, expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000 });
  return token.access_token;
}
