import { describe, expect, it } from 'vitest';
import { route } from './http';

function fakeRes() {
  const r: any = { statusCode: 200, headers: {} as Record<string, string>, body: undefined as unknown, ended: false, headersSent: false };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.set = (k: string, v: string) => { r.headers[k.toLowerCase()] = v; return r; };
  r.json = (b: unknown) => { r.body = b; r.ended = true; return r; };
  r.end = () => { r.ended = true; return r; };
  r.send = (b: unknown) => { r.body = b; r.ended = true; return r; };
  r.type = () => r;
  return r;
}
const req = (method: string, path: string, headers: Record<string, string> = {}, body?: unknown): any =>
  ({ method, path, headers, body, query: {} });

describe('mcp router', () => {
  it('answers CORS preflight', async () => {
    const res = fakeRes();
    await route(req('OPTIONS', '/mcp'), res);
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-headers']).toContain('Authorization');
  });

  it('serves both metadata documents', async () => {
    const a = fakeRes();
    await route(req('GET', '/.well-known/oauth-protected-resource/mcp'), a);
    expect(a.body.resource).toBe('https://spenza.site/mcp');
    const b = fakeRes();
    await route(req('GET', '/.well-known/oauth-authorization-server'), b);
    expect(b.body.token_endpoint).toBe('https://spenza.site/oauth/token');
  });

  it('asks for sign-in with a discoverable 401', async () => {
    const res = fakeRes();
    await route(req('POST', '/mcp', {}, { jsonrpc: '2.0', id: 1, method: 'tools/list' }), res);
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toContain('resource_metadata="https://spenza.site/.well-known/oauth-protected-resource/mcp"');
  });

  it('has no SSE stream and no unknown paths', async () => {
    const get = fakeRes();
    await route(req('GET', '/mcp'), get);
    expect(get.statusCode).toBe(405);
    const nf = fakeRes();
    await route(req('GET', '/nope'), nf);
    expect(nf.statusCode).toBe(404);
  });
});
