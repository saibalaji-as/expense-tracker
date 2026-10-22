import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isAllowedRedirectUri, randomToken, sha256Hex, verifyPkceS256, withParams } from './oauth-crypto';
import { authServerMetadata, protectedResourceMetadata } from './oauth';

describe('PKCE S256', () => {
  it('accepts the RFC 7636 example', () => {
    expect(verifyPkceS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')).toBe(true);
  });
  it('rejects a wrong or malformed verifier', () => {
    const v = randomToken(32);
    const c = createHash('sha256').update(v).digest('base64url');
    expect(verifyPkceS256(v, c)).toBe(true);
    expect(verifyPkceS256(`${v}x`, c)).toBe(false);
    expect(verifyPkceS256('short', c)).toBe(false);
    expect(verifyPkceS256('a'.repeat(43) + ' ', c)).toBe(false);
  });
});

describe('redirect URIs', () => {
  it('allows https and loopback http only', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(isAllowedRedirectUri('http://localhost:6274/oauth/callback')).toBe(true);
    expect(isAllowedRedirectUri('http://127.0.0.1:33418/cb')).toBe(true);
    expect(isAllowedRedirectUri('http://evil.example/cb')).toBe(false);
    expect(isAllowedRedirectUri('https://x.example/cb#frag')).toBe(false);
    expect(isAllowedRedirectUri('https://user:pw@x.example/cb')).toBe(false);
    expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false);
    expect(isAllowedRedirectUri(42)).toBe(false);
  });
  it('keeps existing query params when adding the code', () => {
    const u = new URL(withParams('https://app.example/cb?x=1', { code: 'abc', state: 's t', error: undefined }));
    expect(u.searchParams.get('x')).toBe('1');
    expect(u.searchParams.get('code')).toBe('abc');
    expect(u.searchParams.get('state')).toBe('s t');
    expect(u.searchParams.has('error')).toBe(false);
  });
});

describe('metadata', () => {
  it('points the resource at the authorization server on spenza.site', () => {
    const pr = protectedResourceMetadata();
    const as = authServerMetadata();
    expect(pr['resource']).toBe('https://spenza.site/mcp');
    expect(pr['authorization_servers']).toEqual([as['issuer']]);
    expect(as['code_challenge_methods_supported']).toEqual(['S256']);
    expect(as['registration_endpoint']).toBe('https://spenza.site/oauth/register');
    expect(as['scopes_supported']).toEqual(['spenza.read']);
  });
  it('stores tokens only as hashes', () => {
    expect(sha256Hex('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('abc')).not.toContain('abc');
  });
});
