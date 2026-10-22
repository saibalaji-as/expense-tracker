"use strict";
/**
 * Spenza MCP server — read-only. Constants shared by the OAuth and MCP handlers.
 * Design: "Spenza MCP — Read-only Design" doc (2026-10-21).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLLECTIONS = exports.DEFAULT_TIMEZONE = exports.RATE_LIMIT_PER_MINUTE = exports.TTL = exports.MCP_SCOPE = exports.GOOGLE_SCOPES = exports.DRIVE_APPDATA_SCOPE = exports.GOOGLE_CLIENT_SECRET_NAME = exports.GOOGLE_WEB_CLIENT_ID = exports.GOOGLE_CALLBACK_URL = exports.PATHS = exports.OAUTH_ISSUER = exports.MCP_RESOURCE_URL = exports.PUBLIC_BASE_URL = void 0;
/** Public origin. Firebase Hosting on spenza.site rewrites the paths below to the `mcp` Function. */
exports.PUBLIC_BASE_URL = 'https://spenza.site';
exports.MCP_RESOURCE_URL = `${exports.PUBLIC_BASE_URL}/mcp`;
exports.OAUTH_ISSUER = exports.PUBLIC_BASE_URL;
exports.PATHS = {
    mcp: '/mcp',
    protectedResourceMetadata: '/.well-known/oauth-protected-resource',
    authServerMetadata: '/.well-known/oauth-authorization-server',
    register: '/oauth/register',
    authorize: '/oauth/authorize',
    googleCallback: '/oauth/callback',
    token: '/oauth/token',
    revoke: '/oauth/revoke',
    disconnect: '/oauth/disconnect',
};
exports.GOOGLE_CALLBACK_URL = `${exports.PUBLIC_BASE_URL}${exports.PATHS.googleCallback}`;
/**
 * Must be a client of the app's own Google Cloud project: Drive's appDataFolder is
 * only visible to that project's OAuth clients. Same web client as google-tokens.ts.
 */
exports.GOOGLE_WEB_CLIENT_ID = '663004583066-vu5c3p5pcsg86thjftfts1t45690kll3.apps.googleusercontent.com';
exports.GOOGLE_CLIENT_SECRET_NAME = 'GOOGLE_OAUTH_CLIENT_SECRET';
exports.DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
exports.GOOGLE_SCOPES = ['openid', 'email', exports.DRIVE_APPDATA_SCOPE];
/** The only scope this server grants. There is deliberately no write scope. */
exports.MCP_SCOPE = 'spenza.read';
exports.TTL = {
    authRequestMs: 10 * 60 * 1000,
    authCodeMs: 5 * 60 * 1000,
    accessTokenMs: 60 * 60 * 1000,
    refreshTokenMs: 30 * 24 * 60 * 60 * 1000,
    dataCacheMs: 60 * 1000,
    proCacheMs: 5 * 60 * 1000,
};
exports.RATE_LIMIT_PER_MINUTE = 60;
/** Spenza's users are mostly in India; used when the user has no timezone on file. */
exports.DEFAULT_TIMEZONE = 'Asia/Kolkata';
/** Firestore collections. All server-only (firestore.rules denies every client). */
exports.COLLECTIONS = {
    clients: 'mcpClients',
    authRequests: 'mcpAuthRequests',
    authCodes: 'mcpAuthCodes',
    tokens: 'mcpTokens',
    grants: 'mcpGrants',
};
//# sourceMappingURL=config.js.map