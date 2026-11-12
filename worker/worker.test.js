// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { redactText, redactUrl } from './worker.js';

const env = {
  HARVARD_ARTMUSEUMS_KEY: 'harvard-secret-123',
  UBC_OC_API_KEY: 'ubc-secret-456',
  DATAVERSE_API_TOKEN: 'dataverse-secret-789',
};
const ctx = { waitUntil: () => undefined };
// ttl=0 bypasses the edge cache, which does not exist under Node.
const call = (path) => worker.fetch(new Request(`https://worker.test${path}`), env, ctx);
const upstream = (body, init) => vi.fn(() => Promise.resolve(new Response(body, init)));
const json = { 'content-type': 'application/json' };

afterEach(() => vi.unstubAllGlobals());

describe('redaction', () => {
  it('replaces credential parameters in URLs', () => {
    const url = new URL('https://x.test/a?q=monet&apikey=abc&key=def&size=2');
    expect(redactUrl(url)).toBe('https://x.test/a?q=monet&apikey=REDACTED&key=REDACTED&size=2');
  });

  it('removes known secrets and key parameters from text', () => {
    const text = 'failed https://x.test/?key=zzz&q=1 with ubc-secret-456 in body';
    const out = redactText(text, env);
    expect(out).not.toContain('zzz');
    expect(out).not.toContain('ubc-secret-456');
    expect(out).toContain('q=1');
  });
});

describe('diagnostics never leak keys', () => {
  it('redacts the UBC key when the upstream fails', async () => {
    const fetchMock = upstream('<html>error</html>', {
      status: 500,
      headers: { 'content-type': 'text/html' },
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await call('/ubc/search/8.5?index=calendars&q=news&ttl=0');
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(fetchMock.mock.calls[0][0]).toContain('key=ubc-secret-456');
    expect(text).not.toContain('ubc-secret-456');
    expect(JSON.parse(text).upstream).toContain('key=REDACTED');
  });

  it('redacts the Harvard key on ?debug=1', async () => {
    vi.stubGlobal('fetch', upstream('{"records":[]}', { status: 200, headers: json }));
    const res = await call('/harvard-art/object?q=monet&debug=1&ttl=0');
    const text = await res.text();
    expect(text).not.toContain('harvard-secret-123');
    expect(JSON.parse(text).upstream).toContain('apikey=REDACTED');
  });

  it('redacts a key that the upstream echoes in its body', async () => {
    vi.stubGlobal(
      'fetch',
      upstream('{"message":"bad key ubc-secret-456"}', { status: 401, headers: json }),
    );
    const text = await (await call('/ubc/collections?ttl=0')).text();
    expect(text).not.toContain('ubc-secret-456');
  });

  it('redacts the URL when the fetch itself throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('connect failed'))),
    );
    const res = await call('/ubc-oai?verb=Identify&ttl=0');
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(text).not.toContain('ubc-secret-456');
  });
});

describe('routes', () => {
  it('passes successful JSON through untouched', async () => {
    vi.stubGlobal('fetch', upstream('{"hits":{"total":3}}', { status: 200, headers: json }));
    const res = await call('/princeton-art/search?q=monet&ttl=0');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hits: { total: 3 } });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('retries Dataverse without the token when the token is rejected', async () => {
    const fetchMock = vi.fn((_url, init) =>
      Promise.resolve(
        init.headers.has('X-Dataverse-key')
          ? new Response('{"status":"ERROR","message":"Bad API key"}', {
              status: 401,
              headers: json,
            })
          : new Response('{"data":{"total_count":5}}', { status: 200, headers: json }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await call('/dataverse/search?q=art&ttl=0');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await res.json()).toEqual({ data: { total_count: 5 } });
  });

  it('does not act as an open proxy', async () => {
    const fetchMock = upstream('{}', { status: 200, headers: json });
    vi.stubGlobal('fetch', fetchMock);
    const res = await call('/yale-iiif?url=https://example.com/secret&ttl=0');
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not forward ttl or debug upstream', async () => {
    const fetchMock = upstream('<feed/>', {
      status: 200,
      headers: { 'content-type': 'application/atom+xml' },
    });
    vi.stubGlobal('fetch', fetchMock);
    await call('/arxiv/search?search_query=all:art&ttl=0');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://export.arxiv.org/api/query?search_query=all%3Aart',
    );
  });
});

describe('same-origin hosting', () => {
  it('serves the API under /api as well as the bare path', async () => {
    const res = await call('/api/diag');
    expect(res.status).toBe(200);
    expect((await res.json()).path).toBe('/diag');
  });

  it('forwards /api routes to the same upstream as the bare route', async () => {
    const fetchMock = upstream('{"info":{"totalrecords":1},"records":[]}', { headers: json });
    vi.stubGlobal('fetch', fetchMock);
    const res = await call('/api/harvard-art/object?q=monet&ttl=0');
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/object?');
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('/api/harvard-art');
  });

  it('hands /ubc-oai to the static page unless an OAI verb is present', async () => {
    const assets = { fetch: vi.fn(() => Promise.resolve(new Response('<html>page</html>'))) };
    const res = await worker.fetch(
      new Request('https://worker.test/ubc-oai'),
      { ...env, ASSETS: assets },
      ctx,
    );
    expect(await res.text()).toContain('page');
    expect(assets.fetch).toHaveBeenCalledOnce();
  });
});

describe('successful responses never carry keys either', () => {
  it('removes the Harvard key that the API echoes in info.next', async () => {
    const echoed = JSON.stringify({
      info: {
        totalrecords: 2,
        next: 'https://api.harvardartmuseums.org/object?q=monet&size=1&page=2&apikey=harvard-secret-123',
      },
      records: [{ id: 1, title: 'Étude' }],
    });
    vi.stubGlobal('fetch', upstream(echoed, { headers: json }));
    const res = await call('/harvard-art/object?q=monet&size=1&ttl=0');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain('harvard-secret-123');
    expect(JSON.parse(body).info.next).toContain('apikey=REDACTED');
    expect(JSON.parse(body).records[0].title).toBe('Étude');
  });

  it('leaves binary responses untouched', async () => {
    const bytes = new Uint8Array([0, 255, 1, 254]);
    vi.stubGlobal('fetch', upstream(bytes, { headers: { 'content-type': 'image/jpeg' } }));
    const res = await call('/ubc-iiif/x/full/full/0/default.jpg?ttl=0');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });
});

describe('slow upstreams', () => {
  it('answers 504 when the upstream does not respond in time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('timed out', 'TimeoutError'))),
    );
    const res = await call('/leipzig-iiif/0000000001/manifest.json?ttl=0');
    expect(res.status).toBe(504);
    expect((await res.json()).error).toBe('Upstream timed out');
  });
});
