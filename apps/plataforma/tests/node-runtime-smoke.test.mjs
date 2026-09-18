import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

test('built Node server serves the app behind an explicitly trusted HTTPS proxy', { timeout: 40_000 }, async t => {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const directory = await mkdtemp(path.join(tmpdir(), 'letria-node-smoke-'));
  const child = spawn(process.execPath, ['scripts/start-node.mjs'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1',
      DATABASE_DRIVER: 'postgres', DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/unused',
      AUDIO_STORAGE_DIR: directory, VINEXT_TRUSTED_HOSTS: 'letria.production.test',
      VINEXT_TRUST_PROXY: '', TUTOR_PROVIDER: 'local', TTS_PROVIDER: 'browser',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => { output += bytes; });
  const ended = new Promise(resolve => child.once('exit', resolve));
  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGTERM');
    await ended;
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) assert.fail('Node startup failed: ' + output);
    try { ready = (await fetch(base + '/api/health')).ok; } catch { /* Startup in progress. */ }
    if (ready) break;
    await delay(100);
  }
  assert.equal(ready, true, output);
  await t.test('health discloses no settings and makes no database/provider calls', async () => {
    const response = await fetch(base + '/api/health');
    assert.deepEqual(await response.json(), { ok: true });
    assert.match(response.headers.get('cache-control'), /no-store/);
  });
  await t.test('landing and login are available', async () => {
    for (const route of ['/', '/login', '/plataforma']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.match(await response.text(), /Letria|letria/);
    }
  });
  await t.test('root static assets are available', async () => {
    const asset = await fetch(base + '/favicon.svg');
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), /image\/svg/);
    await asset.arrayBuffer();
  });
  // vinext 0.0.50 caches path.relative() using native separators. Its Node target
  // cannot serve nested static paths on Windows; Easypanel and CI run Linux.
  await t.test('nested static assets are available on the Linux deployment target', { skip: process.platform === 'win32' }, async () => {
    const image = await fetch(base + '/art/lumi-explorer.png');
    assert.equal(image.status, 200);
    assert.match(image.headers.get('content-type'), /image\/png/);
    await image.arrayBuffer();
  });
  await t.test('forwarded HTTPS origin is accepted only for the configured host', async () => {
    const headers = { 'X-Forwarded-Host': 'letria.production.test', 'X-Forwarded-Proto': 'https', Origin: 'https://letria.production.test' };
    const session = await fetch(base + '/api/session', { headers });
    assert.equal(session.status, 200);
    assert.deepEqual(await session.json(), { ok: true, session: null });
    for (const forwarded of [
      { ...headers, Origin: 'https://other.test' },
      { ...headers, 'X-Forwarded-Host': 'evil.test', Origin: 'https://evil.test' },
    ]) {
      const response = await fetch(base + '/api/session', { headers: forwarded });
      assert.equal(response.status, 403);
      await response.arrayBuffer();
    }
  });
});
