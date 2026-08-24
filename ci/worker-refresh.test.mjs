/**
 * Tests for the worker's admin-only profiles refresh endpoint.
 *
 * Run: npm run test:worker
 *
 * The endpoint is unreachable without the secret and answers every refused
 * request with the same bare 404 an unknown path gets, so it cannot be probed
 * from outside. These tests pin that behaviour down, along with the rules that
 * keep a bad upstream from taking /profiles down.
 *
 * worker/index.js is an ES module but the repo root is CommonJS, so it is
 * loaded through a data: URL rather than a plain import.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'worker', 'index.js'), 'utf8');
const worker = (await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))).default;


const SECRET = 'super-secret-value';
const PROFILES = JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }]);

function makeKV(initial = {}) {
  const store = { ...initial };
  return {
    _store: store,
    async get(k, opts) {
      const v = store[k];
      if (v === undefined) return null;
      return opts?.type === 'json' ? JSON.parse(v) : v;
    },
    async put(k, v) { store[k] = v; },
    async delete(k) { delete store[k]; },
  };
}

function makeEnv(over = {}) {
  return {
    insta: makeKV(),
    PROFILES_PURGE_SECRET: SECRET,
    ALLOWED_ORIGINS: 'https://instarishta.me',
    ...over,
  };
}

const URL_REFRESH = 'https://w.dev/api/profiles/refresh';
const req = (method, headers = {}) => new Request(URL_REFRESH, { method, headers });

let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name); } };

// Stub the network so no real fetch happens.
let fetchImpl = async () => new Response(PROFILES, { status: 200 });
let lastUrl = null;
globalThis.fetch = async (u, o) => { lastUrl = String(u); return fetchImpl(u, o); };

const ctx = { waitUntil() {} };

// 1. no secret configured -> dead route
let res = await worker.fetch(req('POST', { authorization: `Bearer ${SECRET}` }), makeEnv({ PROFILES_PURGE_SECRET: '' }), ctx);
t('unset secret -> 404 (fails closed)', res.status === 404);

// 2. missing auth
res = await worker.fetch(req('POST'), makeEnv(), ctx);
t('no auth header -> 404', res.status === 404);

// 3. wrong secret
res = await worker.fetch(req('POST', { authorization: 'Bearer wrong-value-here' }), makeEnv(), ctx);
t('wrong secret -> 404', res.status === 404);

// 4. right secret, wrong method
res = await worker.fetch(req('GET', { authorization: `Bearer ${SECRET}` }), makeEnv(), ctx);
t('GET with right secret -> 404', res.status === 404);

// 5. unknown path returns the SAME body/status -> endpoint indistinguishable
const unknown = await worker.fetch(new Request('https://w.dev/api/nope'), makeEnv(), ctx);
const refused = await worker.fetch(req('POST', { authorization: 'Bearer nope' }), makeEnv(), ctx);
t('refused refresh is byte-identical to an unknown path',
  unknown.status === refused.status && (await unknown.text()) === (await refused.text()));

// 6. happy path
let env = makeEnv();
env.insta._store['profiles:payload'] = JSON.stringify({ payload: '[]', source: 'stale', cachedAt: 'old' });
res = await worker.fetch(req('POST', { authorization: `Bearer ${SECRET}` }), env, ctx);
let body = await res.json();
t('valid refresh -> 200', res.status === 200);
t('returns the new profile count', body.count === 3);
t('cache repopulated with fresh payload',
  JSON.parse(env.insta._store['profiles:payload']).payload === PROFILES);
t('busts the source CDN with a cache-buster param', /[?&]cb=\d+/.test(lastUrl));

// 7. a manual KV override must survive a routine refresh
env = makeEnv();
env.insta._store['profiles:raw'] = '[{"id":"manual"}]';
await worker.fetch(req('POST', { authorization: `Bearer ${SECRET}` }), env, ctx);
t('manual profiles:raw override is preserved', env.insta._store['profiles:raw'] === '[{"id":"manual"}]');

// 8. bad upstream must not poison the cache
env = makeEnv();
env.insta._store['profiles:payload'] = JSON.stringify({ payload: PROFILES, source: 's', cachedAt: 'x' });
fetchImpl = async () => new Response('<html>502 Bad Gateway</html>', { status: 200 });
res = await worker.fetch(req('POST', { authorization: `Bearer ${SECRET}` }), env, ctx);
t('non-JSON upstream -> 502', res.status === 502);
t('non-JSON upstream does NOT overwrite cache',
  !env.insta._store['profiles:payload'] || JSON.parse(env.insta._store['profiles:payload']).payload === PROFILES);

// 9. JSON that is not an array is also rejected
fetchImpl = async () => new Response('{"error":"nope"}', { status: 200 });
res = await worker.fetch(req('POST', { authorization: `Bearer ${SECRET}` }), makeEnv(), ctx);
t('non-array JSON -> 502', res.status === 502);

// 10. upstream HTTP error
fetchImpl = async () => new Response('nope', { status: 500 });
res = await worker.fetch(req('POST', { authorization: `Bearer ${SECRET}` }), makeEnv(), ctx);
t('upstream 500 -> 502', res.status === 502);

// 10b. a GitHub 404 (jsdata.json renamed/deleted) must NOT surface as 404 —
// that is this route's "unauthorised" answer and would be misdiagnosed.
fetchImpl = async () => new Response('404: Not Found', { status: 404 });
res = await worker.fetch(req('POST', { authorization: `Bearer ${SECRET}` }), makeEnv(), ctx);
t('upstream 404 -> 502, never 404', res.status === 502);

// 11. the public GET /api/profiles still works
fetchImpl = async () => new Response(PROFILES, { status: 200 });
res = await worker.fetch(
  new Request('https://w.dev/api/profiles', { headers: { origin: 'https://instarishta.me' } }),
  makeEnv(), ctx);
t('GET /api/profiles still 200 (no regression)', res.status === 200);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
