"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha256Hex = exports.randomToken = void 0;
exports.safeEqual = safeEqual;
exports.verifyPkceS256 = verifyPkceS256;
exports.isAllowedRedirectUri = isAllowedRedirectUri;
exports.withParams = withParams;
/** Small pure helpers for the OAuth server (unit-tested). */
const node_crypto_1 = require("node:crypto");
const randomToken = (bytes = 32) => (0, node_crypto_1.randomBytes)(bytes).toString('base64url');
exports.randomToken = randomToken;
const sha256Hex = (value) => (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
exports.sha256Hex = sha256Hex;
function safeEqual(a, b) {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && (0, node_crypto_1.timingSafeEqual)(x, y);
}
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
/** RFC 7636 S256: BASE64URL(SHA256(code_verifier)) === code_challenge. */
function verifyPkceS256(verifier, challenge) {
    if (!VERIFIER_RE.test(verifier))
        return false;
    return safeEqual((0, node_crypto_1.createHash)('sha256').update(verifier).digest('base64url'), challenge);
}
/**
 * Redirect URIs a client may register: https anywhere, or http only on loopback
 * (local MCP clients). No fragments, no credentials in the URL.
 */
function isAllowedRedirectUri(uri) {
    if (typeof uri !== 'string' || uri.length > 2000)
        return false;
    let u;
    try {
        u = new URL(uri);
    }
    catch {
        return false;
    }
    if (u.hash || u.username || u.password)
        return false;
    if (u.protocol === 'https:')
        return true;
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
}
/** Appends OAuth response params to a registered redirect URI. */
function withParams(uri, params) {
    const u = new URL(uri);
    for (const [k, v] of Object.entries(params))
        if (v !== undefined)
            u.searchParams.set(k, v);
    return u.toString();
}
//# sourceMappingURL=oauth-crypto.js.map