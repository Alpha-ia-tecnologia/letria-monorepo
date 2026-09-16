import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const origin = 'https://letria.example';
const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
type WorkerEvent = {
  request?: { url: string; method: string; mode: string; headers: Headers };
  data?: { type: string; urls?: unknown[] };
  source?: { url: string };
  ports?: { postMessage: (message: { ok: boolean; count?: number }) => void }[];
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith: (promise: Promise<Response>) => void;
};

function harness() {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const stored = new Map<string, Response>();
  const requested: string[] = [];
  const network = new Map<string, Response>();
  let connected = true;
  let skips = 0;
  let claims = 0;
  const url = (value: string) => new URL(value, origin).href;
  const fetcher = async (input: string | { url: string }) => {
    const href = url(typeof input === 'string' ? input : input.url);
    requested.push(href);
    if (!connected) throw new TypeError('Network unavailable');
    return network.get(href)?.clone() ?? new Response('Not found', { status: 404 });
  };
  const cache = {
    async put(key: string, response: Response) { stored.set(url(key), response.clone()); },
    async match(key: string) { return stored.get(url(key))?.clone(); },
    async addAll(keys: string[]) {
      const responses = await Promise.all(keys.map(fetcher));
      if (responses.some(response => !response.ok)) throw new Error('Install failed');
      for (let index = 0; index < keys.length; index++) await this.put(keys[index], responses[index]);
    },
  };
  vm.runInNewContext(worker, {
    self: {
      location: { origin },
      addEventListener: (name: string, listener: (event: WorkerEvent) => void) => listeners.set(name, listener),
      skipWaiting: async () => { skips++; },
      clients: { claim: async () => { claims++; } },
    },
    caches: { open: async () => cache },
    fetch: fetcher, URL, Response, AbortController, setTimeout, clearTimeout,
  });
  function serve(path: string, body: string, type: string, status = 200) {
    network.set(url(path), new Response(body, { status, headers: { 'content-type': type } }));
  }
  serve('/', '<html><script type="module">import("/assets/entry.js")</script><link href="/assets/style.css" rel="stylesheet"></html>', 'text/html');
  serve('/offline.html', '<html>Prepare suas atividades.</html>', 'text/html');
  serve('/manifest.webmanifest', '{}', 'application/manifest+json');
  for (const icon of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'og.png']) serve(`/${icon}`, 'image', 'image/png');
  serve('/assets/entry.js', 'import { start } from "./game.js"; const modules=["assets/deferred.js"];', 'text/javascript');
  serve('/assets/game.js', 'export const start = () => import("./deferred.js");', 'application/javascript');
  serve('/assets/deferred.js', 'export const result=20;', 'text/javascript');
  serve('/assets/style.css', '@import url("https://fonts.googleapis.com/example");body{background:url(/og.png)}', 'text/css');
  async function dispatch(name: string, details: Partial<WorkerEvent> = {}) {
    const promises: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listeners.get(name)!({
      waitUntil: promise => { promises.push(promise); },
      respondWith: promise => { response = promise; },
      ...details,
    });
    await Promise.all(promises);
    return response;
  }
  async function message(type: string, urls?: unknown[], source = `${origin}/`) {
    let reply: { ok: boolean; count?: number } | undefined;
    await dispatch('message', {
      data: { type, urls }, source: { url: source },
      ports: [{ postMessage: result => { reply = result; } }],
    });
    return reply;
  }
  const request = (path: string, mode = 'cors', method = 'GET', headers: Record<string, string> = {}) =>
    dispatch('fetch', { request: { url: url(path), method, mode, headers: new Headers(headers) } });
  return { dispatch, message, request, requested, stored, serve, url, disconnect: () => { connected = false; }, skips: () => skips, claims: () => claims };
}

test('download follows transitive and deferred build assets before making the shell available offline', async () => {
  const app = harness();
  const result = await app.message('DOWNLOAD', ['/', '/assets/entry.js']);
  assert.equal(result?.ok, true);
  assert.equal(result?.count, 11);
  for (const asset of ['/', '/assets/entry.js', '/assets/game.js', '/assets/deferred.js', '/assets/style.css']) {
    assert.ok(app.stored.has(app.url(asset)), asset);
  }
  assert.ok(app.requested.every(value => value.startsWith(origin)));
  assert.equal(app.requested.filter(value => value.endsWith('/assets/deferred.js')).length, 1);
  app.disconnect();
  assert.match(await (await app.request('/', 'navigate'))!.text(), /entry\.js/);
  assert.match(await (await app.request('/assets/game.js'))!.text(), /start/);
});

test('an incomplete transfer never replaces an existing complete offline package', async () => {
  const app = harness();
  assert.equal((await app.message('DOWNLOAD', ['/']))?.ok, true);
  app.serve('/', '<html><script src="/assets/missing.js"></script></html>', 'text/html');
  assert.equal((await app.message('DOWNLOAD', ['/']))?.ok, false);
  app.disconnect();
  assert.match(await (await app.request('/', 'navigate'))!.text(), /entry\.js/);
  assert.equal(app.stored.has(app.url('/assets/missing.js')), false);
});

test('HTML error documents returned as scripts cannot produce a successful download', async () => {
  const app = harness();
  app.serve('/assets/game.js', '<html>Sign in</html>', 'text/html');
  assert.equal((await app.message('DOWNLOAD', ['/']))?.ok, false);
  assert.equal(app.stored.size, 0);
});

test('API, audio, identity, RSC, authorized, POST, range and external requests bypass the worker', async () => {
  const app = harness();
  for (const path of ['/api/platform', '/api/audio?id=private', '/signin-with-chatgpt', '/callback', '/private.js', '/?rsc=1', '/index.rsc', 'https://other.example/assets/game.js']) {
    assert.equal(await app.request(path), undefined, path);
  }
  assert.equal(await app.request('/', 'navigate', 'POST'), undefined);
  assert.equal(await app.request('/', 'navigate', 'GET', { RSC: '1' }), undefined);
  assert.equal(await app.request('/', 'navigate', 'GET', { Accept: 'text/x-component' }), undefined);
  assert.equal(await app.request('/assets/game.js', 'cors', 'GET', { Authorization: 'Bearer example' }), undefined);
  assert.equal(await app.request('/assets/game.js', 'cors', 'GET', { Range: 'bytes=0-10' }), undefined);
  assert.equal(app.stored.size, 0);
  assert.equal(app.requested.length, 0);
});

test('download messages cannot put private or external URLs into the public cache', async () => {
  const app = harness();
  for (const path of ['/api/platform', '/api/audio?id=private', 'https://other.example/assets/game.js', '/assets/game.js?token=private', '/@vite/client']) {
    assert.equal((await app.message('DOWNLOAD', [path]))?.ok, false, path);
  }
  assert.equal(await app.message('DOWNLOAD', ['/'], 'https://other.example/'), undefined);
  assert.equal(app.requested.length, 0);
  assert.equal(app.stored.size, 0);
});

test('the first installation offers offline instructions and updates wait for an explicit choice', async () => {
  const app = harness();
  await app.dispatch('install');
  assert.equal(app.skips(), 0);
  await app.dispatch('activate');
  assert.equal(app.claims(), 1);
  assert.equal(app.stored.has(app.url('/')), false);
  app.disconnect();
  assert.match(await (await app.request('/', 'navigate'))!.text(), /Prepare suas atividades/);
  await app.message('SKIP_WAITING');
  assert.equal(app.skips(), 1);
});

test('live navigation does not overwrite the downloaded shell with a partially loaded version', async () => {
  const app = harness();
  await app.message('DOWNLOAD', ['/']);
  app.serve('/', '<html>New version</html>', 'text/html');
  assert.match(await (await app.request('/', 'navigate'))!.text(), /New version/);
  app.disconnect();
  assert.match(await (await app.request('/', 'navigate'))!.text(), /entry\.js/);
});


test('the known static HTML redirect is accepted without accepting sign-in or external redirects', () => {
  const context = vm.createContext({ self: { location: { origin }, addEventListener() {} }, URL });
  vm.runInContext(worker, context);
  const accepts = (path: string, location: string, type = 'text/html') => {
    Object.assign(context, {
      candidate: { ok: true, status: 200, redirected: true, type: 'basic', url: location, headers: new Headers({ 'content-type': type }) },
      requestedURL: origin + path,
    });
    return vm.runInContext('isCacheable(candidate, requestedURL)', context);
  };
  assert.equal(accepts('/offline.html', origin + '/offline'), true);
  assert.equal(accepts('/offline.html', origin + '/offline/'), true);
  assert.equal(accepts('/offline.html', origin + '/signin-with-chatgpt'), false);
  assert.equal(accepts('/offline.html', 'https://other.example/offline'), false);
  assert.equal(accepts('/offline.html', origin + '/offline?account=example'), false);
  assert.equal(accepts('/', origin + '/signin-with-chatgpt'), false);
  assert.equal(accepts('/assets/entry.js', origin + '/signin-with-chatgpt', 'text/javascript'), false);
});
