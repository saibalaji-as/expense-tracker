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
exports.exchangeGoogleCode = exchangeGoogleCode;
exports.decodeJwtPayload = decodeJwtPayload;
exports.forgetGoogleAccessToken = forgetGoogleAccessToken;
exports.googleAccessTokenFor = googleAccessTokenFor;
/**
 * Google OAuth for the MCP server: exchanging the sign-in code and minting
 * short-lived Drive access tokens from the stored MCP grant (`mcpGrants/{uid}`).
 * The MCP grant is separate from the app's `googleTokens/{sub}` so disconnecting
 * Claude never signs the user out of the app.
 */
const admin = __importStar(require("firebase-admin"));
const config_1 = require("./config");
const errors_1 = require("./errors");
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
async function postForm(body) {
    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
    });
    return (await res.json());
}
function exchangeGoogleCode(code, clientSecret) {
    return postForm({
        code,
        client_id: config_1.GOOGLE_WEB_CLIENT_ID,
        client_secret: clientSecret,
        redirect_uri: config_1.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
    });
}
/** The id_token comes straight from Google's token endpoint over TLS, so its payload is trusted unverified (as in google-tokens.ts). */
function decodeJwtPayload(jwt) {
    try {
        const part = jwt.split('.')[1];
        if (!part)
            return null;
        return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    }
    catch {
        return null;
    }
}
const accessTokenCache = new Map();
function forgetGoogleAccessToken(uid) {
    accessTokenCache.delete(uid);
}
/** A Drive access token for `uid`, refreshed from the MCP grant when needed. */
async function googleAccessTokenFor(uid, clientSecret) {
    const cached = accessTokenCache.get(uid);
    if (cached && cached.expiresAt - 60_000 > Date.now())
        return cached.token;
    const grantRef = admin.firestore().collection(config_1.COLLECTIONS.grants).doc(uid);
    const grant = await grantRef.get();
    const refreshToken = grant.exists ? grant.data()?.['refreshToken'] : undefined;
    if (!refreshToken) {
        throw new errors_1.McpToolError('DRIVE_ACCESS_REVOKED', 'Spenza is not connected to Google Drive any more. Reconnect Spenza in Claude.');
    }
    const token = await postForm({
        refresh_token: refreshToken,
        client_id: config_1.GOOGLE_WEB_CLIENT_ID,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
    });
    if (token.error === 'invalid_grant') {
        // Revoked or expired at Google: drop the dead grant so the next connect starts clean.
        await grantRef.delete().catch(() => undefined);
        throw new errors_1.McpToolError('DRIVE_ACCESS_REVOKED', 'Google access for Spenza was revoked. Reconnect Spenza in Claude.');
    }
    if (!token.access_token) {
        throw new errors_1.McpToolError('UPSTREAM_ERROR', 'Could not reach Google Drive. Try again in a minute.');
    }
    accessTokenCache.set(uid, { token: token.access_token, expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000 });
    return token.access_token;
}
//# sourceMappingURL=google-auth.js.map