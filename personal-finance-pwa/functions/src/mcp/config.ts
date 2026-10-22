/**
 * Spenza MCP server — read-only. Constants shared by the OAuth and MCP handlers.
 * Design: "Spenza MCP — Read-only Design" doc (2026-10-21).
 */

/** Public origin. Firebase Hosting on spenza.site rewrites the paths below to the `mcp` Function. */
export const PUBLIC_BASE_URL = 'https://spenza.site';
export const MCP_RESOURCE_URL = `${PUBLIC_BASE_URL}/mcp`;
export const OAUTH_ISSUER = PUBLIC_BASE_URL;

export const PATHS = {
  mcp: '/mcp',
  protectedResourceMetadata: '/.well-known/oauth-protected-resource',
  authServerMetadata: '/.well-known/oauth-authorization-server',
  register: '/oauth/register',
  authorize: '/oauth/authorize',
  googleCallback: '/oauth/callback',
  token: '/oauth/token',
  revoke: '/oauth/revoke',
  disconnect: '/oauth/disconnect',
} as const;

export const GOOGLE_CALLBACK_URL = `${PUBLIC_BASE_URL}${PATHS.googleCallback}`;

/**
 * Must be a client of the app's own Google Cloud project: Drive's appDataFolder is
 * only visible to that project's OAuth clients. Same web client as google-tokens.ts.
 */
export const GOOGLE_WEB_CLIENT_ID =
  '663004583066-vu5c3p5pcsg86thjftfts1t45690kll3.apps.googleusercontent.com';
export const GOOGLE_CLIENT_SECRET_NAME = 'GOOGLE_OAUTH_CLIENT_SECRET';
export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const GOOGLE_SCOPES = ['openid', 'email', DRIVE_APPDATA_SCOPE];

/** The only scope this server grants. There is deliberately no write scope. */
export const MCP_SCOPE = 'spenza.read';

export const TTL = {
  authRequestMs: 10 * 60 * 1000,
  authCodeMs: 5 * 60 * 1000,
  accessTokenMs: 60 * 60 * 1000,
  refreshTokenMs: 30 * 24 * 60 * 60 * 1000,
  dataCacheMs: 60 * 1000,
  proCacheMs: 5 * 60 * 1000,
} as const;

export const RATE_LIMIT_PER_MINUTE = 60;

/** Spenza's users are mostly in India; used when the user has no timezone on file. */
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** Firestore collections. All server-only (firestore.rules denies every client). */
export const COLLECTIONS = {
  clients: 'mcpClients',
  authRequests: 'mcpAuthRequests',
  authCodes: 'mcpAuthCodes',
  tokens: 'mcpTokens',
  grants: 'mcpGrants',
} as const;
