import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { sanitizeClientIp } from '../scripts/node-client-ip.mjs';

// Exercise the real rateLimit function with a tiny in-memory SQL boundary.
// This never creates a PostgreSQL connection or loads private configuration.
const counts = new Map();
globalThis.__letriaRateLimitEnv = { LETRIA_RUNTIME: 'node' };
globalThis.__letriaRateLimitStore = {
  prepare() {
    let values;
    return {
      bind(...input) { values = input; return this; },
      async run() { counts.set(values[0], (counts.get(values[0]) || 0) + 1); },
      async first() { return { count: counts.get(values[0]) || 0 }; },
    };
  },
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: 'letria-rate:env', shortCircuit: true };
    if (context.parentURL?.endsWith('/lib/server/platform.ts')) {
      if (specifier === './database') return { url: 'letria-rate:database', shortCircuit: true };
      if (specifier === '@/lib/content' || specifier === '@/lib/activity-catalog') return { url: 'letria-rate:catalog', shortCircuit: true };
      if (specifier === './security') return { url: new URL('./security.ts', context.parentURL).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const sources = {
      'letria-rate:env': 'export const env = globalThis.__letriaRateLimitEnv;',
      'letria-rate:database': 'export function database() { return globalThis.__letriaRateLimitStore; }',
      'letria-rate:catalog': 'export const activities = []; export function getCatalogActivity() { return undefined; }',
    };
    if (sources[url]) return { format: 'module', source: sources[url], shortCircuit: true };
    if (url.endsWith('.ts') && !url.includes('node_modules')) {
      return {
        format: 'module', shortCircuit: true,
        source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText,
      };
    }
    return nextLoad(url, context);
  },
});
const { rateLimit } = await import('../lib/server/platform.ts');

function fromProxy(client, forged) {
  const incoming = {
    headers: { 'x-forwarded-for': `${forged}, ${client}`, 'cf-connecting-ip': forged, 'x-letria-client-ip': forged },
    rawHeaders: [], socket: { remoteAddress: '10.0.0.4' },
  };
  sanitizeClientIp(incoming, 1);
  return new Request('https://letria.test/api/platform', { headers: incoming.headers });
}
const limited = error => error.status === 429 && error.code === 'RATE_LIMIT';

test('real Node rate limits isolate clients while rejecting forged Cloudflare identities', async () => {
  counts.clear();
  globalThis.__letriaRateLimitEnv.LETRIA_RUNTIME = 'node';
  for (let attempt = 0; attempt < 12; attempt++) {
    await rateLimit(fromProxy('203.0.113.8', `198.51.100.${attempt}`), 'student-login', '', 12);
  }
  await assert.rejects(rateLimit(fromProxy('203.0.113.8', '198.51.100.200'), 'student-login', '', 12), limited);
  await rateLimit(fromProxy('203.0.113.9', '203.0.113.8'), 'student-login', '', 12);
  assert.deepEqual([...counts.values()].sort((a, b) => a - b), [1, 13]);
});

test('Node never falls back to an unverified Cloudflare header when its private header is absent', async () => {
  counts.clear();
  globalThis.__letriaRateLimitEnv.LETRIA_RUNTIME = 'node';
  for (let attempt = 0; attempt < 12; attempt++) {
    await rateLimit(new Request('https://letria.test', { headers: { 'cf-connecting-ip': `198.51.100.${attempt}` } }), 'login', 'same-person', 12);
  }
  await assert.rejects(rateLimit(new Request('https://letria.test', { headers: { 'cf-connecting-ip': '203.0.113.200' } }), 'login', 'same-person', 12), limited);
});

test('Workers preserve the Cloudflare boundary and ignore the Node-only header', async () => {
  counts.clear();
  delete globalThis.__letriaRateLimitEnv.LETRIA_RUNTIME;
  for (let attempt = 0; attempt < 12; attempt++) {
    await rateLimit(new Request('https://letria.test', { headers: {
      'cf-connecting-ip': '203.0.113.8', 'x-letria-client-ip': `198.51.100.${attempt}`,
    } }), 'student-login', '', 12);
  }
  await assert.rejects(rateLimit(new Request('https://letria.test', { headers: {
    'cf-connecting-ip': '203.0.113.8', 'x-letria-client-ip': '198.51.100.200',
  } }), 'student-login', '', 12), limited);
  await rateLimit(new Request('https://letria.test', { headers: { 'cf-connecting-ip': '203.0.113.9' } }), 'student-login', '', 12);
  assert.deepEqual([...counts.values()].sort((a, b) => a - b), [1, 13]);
});
