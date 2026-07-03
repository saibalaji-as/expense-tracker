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
exports.getGoogleAccessToken = exports.exchangeGoogleAuthCode = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v2/https"));
/**
 * Google OAuth refresh-token broker.
 *
 * Why this exists: the app needs a Google Drive *access token* (~1h life) to read/write
 * the user's backup. The native Google Sign-In plugin only hands back that short-lived
 * token — no refresh token — so the app used to re-prompt for sign-in every time the
 * token expired. These functions implement the standard "offline access" pattern:
 *
 *   1. The native client signs in once in OFFLINE mode and gets a one-time serverAuthCode.
 *   2. `exchangeGoogleAuthCode` swaps that code (with the OAuth client secret) for an
 *      access token + a long-lived REFRESH token, stores the refresh token server-side,
 *      and returns the access token + id_token (so the client can sign into Firebase).
 *   3. Thereafter `getGoogleAccessToken` mints a fresh access token from the stored
 *      refresh token with NO user interaction — so the user never sees a sign-in screen
 *      again unless they revoke access.
 *
 * Storage is keyed by the Google account id (the `sub` claim), so the very first sign-in
 * — which has no Firebase session yet — can still store its refresh token. The refresh
 * token lives in `googleTokens/{googleSub}`, locked to server-only access by Firestore
 * rules (clients can never read it).
 */
const CORS_ORIGINS = [
    'https://spenza.site',
    'http://localhost:4200',
    'http://localhost',
    'https://localhost',
    'capacitor://localhost',
];
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
// The "web client" ID the serverAuthCode is issued for. Matches the webClientId used
// by SocialLogin.initialize() on the client.
const GOOGLE_WEB_CLIENT_ID = '663004583066-vu5c3p5pcsg86thjftfts1t45690kll3.apps.googleusercontent.com';
// Set once with: firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET
const CLIENT_SECRET_NAME = 'GOOGLE_OAUTH_CLIENT_SECRET';
async function postForm(body) {
    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
    });
    return (await res.json());
}
/** Decodes a JWT payload without verifying the signature. Safe here because the token
 *  comes directly from a server-to-server call to Google's token endpoint over TLS. */
function decodeJwtPayload(jwt) {
    try {
        const part = jwt.split('.')[1];
        if (!part)
            return null;
        const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        return JSON.parse(json);
    }
    catch {
        return null;
    }
}
function tokenDocRef(googleSub) {
    return admin.firestore().doc(`googleTokens/${googleSub}`);
}
/** Pulls the Google account id (sub) out of a verified Firebase ID token. */
function googleSubFromFirebaseToken(decoded) {
    const identities = (decoded.firebase?.identities ?? {});
    const googleIds = identities['google.com'];
    if (Array.isArray(googleIds) && googleIds.length > 0)
        return String(googleIds[0]);
    return null;
}
/**
 * Exchanges a one-time serverAuthCode (from native offline-mode sign-in) for tokens,
 * persists the refresh token keyed by Google account id, and returns a usable access
 * token + id_token + email. No Firebase auth required — a valid serverAuthCode (which
 * only Google issues after real user consent for our client) is the authorization.
 */
exports.exchangeGoogleAuthCode = functions.onRequest({ cors: CORS_ORIGINS, invoker: 'public', secrets: [CLIENT_SECRET_NAME] }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const serverAuthCode = typeof req.body?.serverAuthCode === 'string' ? req.body.serverAuthCode.trim() : '';
    if (!serverAuthCode) {
        res.status(400).json({ error: 'serverAuthCode is required' });
        return;
    }
    const clientSecret = process.env[CLIENT_SECRET_NAME]?.trim();
    if (!clientSecret) {
        console.error('GOOGLE_OAUTH_CLIENT_SECRET not configured');
        res.status(500).json({ error: 'Server not configured' });
        return;
    }
    try {
        const token = await postForm({
            code: serverAuthCode,
            client_id: GOOGLE_WEB_CLIENT_ID,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            // Native serverAuthCode exchange uses an empty redirect URI.
            redirect_uri: '',
        });
        if (token.error || !token.access_token) {
            console.warn('Auth code exchange failed:', token.error, token.error_description);
            res.status(400).json({ error: 'Auth code exchange failed' });
            return;
        }
        const claims = token.id_token ? decodeJwtPayload(token.id_token) : null;
        const googleSub = claims?.['sub'] ? String(claims['sub']) : null;
        const email = claims?.['email'] ? String(claims['email']) : null;
        // Persist the refresh token (only present on first consent / when offline access
        // is granted). If Google omits it, keep any existing one for this account.
        if (googleSub && token.refresh_token) {
            await tokenDocRef(googleSub).set({
                googleSub,
                email,
                refreshToken: token.refresh_token,
                scope: token.scope ?? null,
                updatedAt: new Date().toISOString(),
            }, { merge: true });
        }
        res.json({
            accessToken: token.access_token,
            expiresIn: token.expires_in ?? 3600,
            idToken: token.id_token ?? null,
            email,
            hasRefreshToken: !!token.refresh_token,
        });
    }
    catch (err) {
        console.warn('exchangeGoogleAuthCode failed:', err);
        res.status(500).json({ error: 'Exchange failed' });
    }
});
/**
 * Mints a fresh Google access token from the caller's stored refresh token.
 * Authorized by the caller's Firebase ID token (their persistent session). Never shows
 * UI. Returns 404 when no refresh token is stored (caller must do an interactive
 * sign-in) and 410 when Google has revoked it (re-consent required).
 */
exports.getGoogleAccessToken = functions.onRequest({ cors: CORS_ORIGINS, invoker: 'public', secrets: [CLIENT_SECRET_NAME] }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const clientSecret = process.env[CLIENT_SECRET_NAME]?.trim();
    if (!clientSecret) {
        console.error('GOOGLE_OAUTH_CLIENT_SECRET not configured');
        res.status(500).json({ error: 'Server not configured' });
        return;
    }
    try {
        const authorization = req.headers.authorization ?? '';
        const match = authorization.match(/^Bearer (.+)$/);
        if (!match) {
            res.status(401).json({ error: 'Missing Firebase ID token' });
            return;
        }
        const decoded = await admin.auth().verifyIdToken(match[1]);
        const googleSub = googleSubFromFirebaseToken(decoded);
        if (!googleSub) {
            res.status(404).json({ error: 'No Google identity on this account' });
            return;
        }
        const snap = await tokenDocRef(googleSub).get();
        const refreshToken = snap.exists ? snap.data()?.['refreshToken'] : undefined;
        if (!refreshToken) {
            res.status(404).json({ error: 'No refresh token on file' });
            return;
        }
        const token = await postForm({
            client_id: GOOGLE_WEB_CLIENT_ID,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        });
        if (token.error || !token.access_token) {
            // invalid_grant => user revoked access / refresh token no longer valid.
            if (token.error === 'invalid_grant') {
                await tokenDocRef(googleSub).set({ refreshToken: admin.firestore.FieldValue.delete() }, { merge: true });
                res.status(410).json({ error: 'Refresh token revoked' });
                return;
            }
            console.warn('Refresh failed:', token.error, token.error_description);
            res.status(400).json({ error: 'Token refresh failed' });
            return;
        }
        res.json({
            accessToken: token.access_token,
            expiresIn: token.expires_in ?? 3600,
            scope: token.scope ?? null,
        });
    }
    catch (err) {
        console.warn('getGoogleAccessToken failed:', err);
        res.status(401).json({ error: 'Unauthorized' });
    }
});
//# sourceMappingURL=google-tokens.js.map