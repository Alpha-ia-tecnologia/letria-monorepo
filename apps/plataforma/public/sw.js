/* Cache only the public application shell and build assets. Account data and
 * answers belong to the separate, account-aware IndexedDB layer in lib/client. */
const CACHE_NAME = 'letria-public-v2';
const PUBLIC_FILES = new Set([
  '/manifest.webmanifest', '/offline.html', '/icon-192.png', '/icon-512.png',
  '/icon-maskable-512.png', '/og.png', '/favicon.svg',
  '/art/ecosystem-sounds.png','/art/ecosystem-words.png','/art/ecosystem-phrases.png','/art/ecosystem-stories.png','/art/ecosystem-logic.png',
  '/art/trail-island.png', '/art/lumi-explorer.png', '/art/hero-adventure.png', '/art/og-playful.png',
]);
const INSTALL_FILES = ['/offline.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png'];
const BUILD_ASSET = /^\/(?:assets|_next\/static|fonts)\/[a-zA-Z0-9_./-]+\.(?:m?js|css|woff2?|ttf|otf|png|jpe?g|webp|avif|gif|svg|ico)$/;
const MAX_FILES = 250;
let currentDownload;

function publicURL(value, base = self.location.origin) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, base);
    if (url.origin !== self.location.origin || url.username || url.password || url.search) return null;
    if (url.pathname !== '/' && url.pathname !== '/plataforma' && !PUBLIC_FILES.has(url.pathname) && !BUILD_ASSET.test(url.pathname)) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function isCacheable(response, url) {
  if (!response.ok || response.status !== 200 || response.type === 'opaque') return false;
  const type = response.headers.get('content-type') || '';
  const path = new URL(url).pathname;
  if (response.redirected) {
    // Cloudflare canonicalizes static HTML files to extensionless URLs.
    // Accept only this known fallback redirect, never sign-in or remote pages.
    const finalURL = new URL(response.url);
    if (path !== '/offline.html' || finalURL.origin !== self.location.origin || finalURL.search || !['/offline', '/offline/'].includes(finalURL.pathname)) return false;
  }
  if (path === '/' || path === '/plataforma' || path === '/offline.html') return type.includes('text/html');
  if (/\.m?js$/.test(path)) return /(?:java|ecma)script/.test(type);
  if (path.endsWith('.css')) return type.includes('text/css');
  if (path.endsWith('.webmanifest')) return /(?:manifest\+json|application\/json)/.test(type);
  if (/\.(?:png|jpe?g|webp|avif|gif|svg|ico)$/.test(path)) return type.startsWith('image/');
  return !type.includes('text/html') && !type.includes('text/x-component');
}

function dependencies(source, url) {
  const result = new Set();
  // Vite's entry, RSC client map and module-preload map all use literal asset
  // paths. Also follow relative module imports and CSS url() references.
  const normalized = source.replace(/\\\//g, '/').replace(/\\["']/g, '"');
  const references = [
    ...normalized.matchAll(/["'`]((?:https?:\/\/|\/|\.{1,2}\/|assets\/|_next\/static\/)[^"'`\s<>\\]*\.(?:m?js|css|woff2?|ttf|otf|png|jpe?g|webp|avif|gif|svg|ico))["'`]/g),
    ...normalized.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g),
  ];
  for (const reference of references) {
    const value = /^(?:assets|_next\/static|fonts)\//.test(reference[1]) ? `/${reference[1]}` : reference[1];
    const dependency = publicURL(value, url);
    if (dependency && new URL(dependency).pathname !== '/') result.add(dependency);
  }
  return [...result];
}

async function download(urls) {
  if (!Array.isArray(urls) || urls.length > MAX_FILES) throw new Error('INVALID_DOWNLOAD');
  const requested = urls.map(value => publicURL(value));
  if (requested.some(value => !value)) throw new Error('UNSUPPORTED_ASSET');
  const pending = new Set(['/plataforma', '/', ...INSTALL_FILES, '/og.png', ...requested].map(value => publicURL(value)));
  const staged = new Map();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    while (pending.size) {
      if (staged.size + pending.size > MAX_FILES) throw new Error('TOO_MANY_ASSETS');
      const batch = [...pending].slice(0, 6);
      batch.forEach(url => pending.delete(url));
      await Promise.all(batch.map(async url => {
        // '/plataforma' renders a generic loading shell; user records are fetched only
        // from /api/platform, which is deliberately never intercepted here.
        const response = await fetch(url, { cache: 'reload', credentials: 'same-origin', signal: controller.signal });
        if (!isCacheable(response, url)) throw new Error('DOWNLOAD_FAILED');
        staged.set(url, response);
        if (/(?:html|css|javascript|ecmascript)/.test(response.headers.get('content-type') || '')) {
          for (const dependency of dependencies(await response.clone().text(), url)) {
            if (!staged.has(dependency) && !batch.includes(dependency)) pending.add(dependency);
          }
        }
      }));
    }
    const cache = await caches.open(CACHE_NAME);
    const shell = publicURL('/plataforma');
    // Commit the shell last. A failed transfer or quota error leaves the
    // previously downloaded shell and its immutable bundles usable.
    for (const [url, response] of staged) {
      if (url !== shell) await cache.put(url, response);
    }
    await cache.put(shell, staged.get(shell));
    return staged.size;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(INSTALL_FILES);
    // Updates remain waiting until the learner chooses "Atualizar".
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Keep older Letria caches while another tab may still use their bundles.
    // Downloading again replaces the shell only after all assets are ready.
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (!event.source || new URL(event.source.url).origin !== self.location.origin) return;
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type !== 'DOWNLOAD' && event.data?.type !== 'DOWNLOAD_OFFLINE') return;
  const port = event.ports?.[0];
  event.waitUntil((async () => {
    try {
      if (!currentDownload) currentDownload = download(event.data.urls).finally(() => { currentDownload = undefined; });
      const count = await currentDownload;
      port?.postMessage({ ok: true, count });
    } catch {
      port?.postMessage({ ok: false });
    }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('authorization') || request.headers.has('range') || request.headers.has('rsc') || (request.headers.get('accept') || '').includes('text/x-component')) return;
  const url = publicURL(request.url);
  if (!url) return; // Includes APIs, audio, identity routes and all other origins.
  if (['/', '/plataforma'].includes(new URL(url).pathname)) {
    if (request.mode !== 'navigate') return;
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.status < 500) return response;
      } catch { /* A downloaded shell can be opened without the network. */ }
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(url) || await cache.match('/offline.html') || Response.error();
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url);
    if (cached) return cached;
    // Asset cache writes happen only in the explicit download. Requests from
    // a half-loaded page cannot overwrite a complete offline package.
    return fetch(request);
  })());
});
