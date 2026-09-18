import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const app = fileURLToPath(new URL('..', import.meta.url));
const tsx = fileURLToPath(import.meta.resolve('tsx/cli'));
const token = 'test-prepared-voice-only-' + 'x'.repeat(40);
const configurationKeys = ['QWEN_TTS_URL', 'QWEN_TTS_API_TOKEN', 'QWEN_TTS_ALLOW_HTTP_ORIGIN'];

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'letria-prepare-cli-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('letria-prepare-cli-'));
    await rm(root, { recursive: true, force: true });
  });
  // Copy only public source dependencies; never read or copy the actual local env.
  const files = ['scripts/prepare-speech.ts', 'lib/activity-catalog.ts', 'lib/activity-bank.ts',
    'lib/content.ts', 'lib/speech-content.ts', 'lib/world-themes.ts', 'lib/journey.ts', 'lib/server/voice-url.ts'];
  for (const file of files) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await copyFile(path.join(app, file), path.join(root, file));
  }
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}\n');
  return root;
}

async function mockVoice(t, redirectStage) {
  const requests = [];
  let count = 0;
  const jobId = 'a'.repeat(32);
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8');
    requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization, body: text ? JSON.parse(text) : null });
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/v1/audio/prepare') {
      if (redirectStage === 'enqueue') { response.writeHead(307, { Location: '/redirected' }); response.end('{}'); return; }
      count = requests.at(-1).body.items.length;
      response.writeHead(202); response.end(JSON.stringify({ job_id: jobId })); return;
    }
    if (request.url === '/v1/audio/prepare/' + jobId) {
      if (redirectStage === 'poll') { response.writeHead(302, { Location: '/redirected' }); response.end('{}'); return; }
      response.end(JSON.stringify({ completed: count, failed: 0, remaining: 0 })); return;
    }
    response.end(JSON.stringify({ job_id: jobId, completed: count, failed: 0, remaining: 0 }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  return { url: 'http://127.0.0.1:' + server.address().port, requests };
}

function run(root, settings = {}, args = []) {
  const env = { ...process.env };
  for (const name of configurationKeys) delete env[name];
  for (const [name, value] of Object.entries(settings)) if (value !== undefined) env[name] = value;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsx, path.join(root, 'scripts/prepare-speech.ts'), ...args], {
      cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', text => { output += text; });
    child.stderr.on('data', text => { output += text; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Preparation CLI test timed out.')); }, 20_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); resolve({ code, output }); });
  });
}

test('container environment prepares common speech without any local env file and polls to completion', async t => {
  const root = await fixture(t);
  const voice = await mockVoice(t);
  const result = await run(root, { QWEN_TTS_URL: voice.url, QWEN_TTS_API_TOKEN: token });
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /Áudios preparados:/);
  assert.deepEqual(voice.requests.map(request => request.method), ['POST', 'GET']);
  assert.ok(voice.requests[0].body.items.length > 0);
  assert.ok(voice.requests[0].body.items.every(item => typeof item.input === 'string' && item.profile === 'conversation'));
  assert.ok(voice.requests.every(request => request.authorization === 'Bearer ' + token));
  assert.ok(!result.output.includes(token));
});

test('process configuration overrides the optional local file and activity enqueue-only keeps its existing behavior', async t => {
  const root = await fixture(t);
  const voice = await mockVoice(t);
  await writeFile(path.join(root, '.env.qwen.local'), 'QWEN_TTS_URL=http://127.0.0.1:1\nQWEN_TTS_API_TOKEN=invalid-local-token\n');
  const result = await run(root, { QWEN_TTS_URL: voice.url, QWEN_TTS_API_TOKEN: token }, ['--activity=letras-1', '--enqueue-only']);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /Falas adicionadas à preparação:/);
  assert.deepEqual(voice.requests.map(request => request.method), ['POST']);
  assert.ok(voice.requests[0].body.items.some(item => item.profile === 'reading'));
  assert.ok(voice.requests[0].body.items.some(item => item.profile === 'conversation'));
  assert.equal(voice.requests[0].authorization, 'Bearer ' + token);
});

test('the optional local configuration still works when process variables are absent', async t => {
  const root = await fixture(t);
  const voice = await mockVoice(t);
  await writeFile(path.join(root, '.env.qwen.local'), `QWEN_TTS_URL=${voice.url}\nQWEN_TTS_API_TOKEN=${token}\n`);
  const result = await run(root, {}, ['--enqueue-only']);
  assert.equal(result.code, 0, result.output);
  assert.equal(voice.requests.length, 1);
  assert.equal(voice.requests[0].authorization, 'Bearer ' + token);
});

test('missing, short and whitespace tokens fail before a request and explicit empty env does not use a file secret', async t => {
  const root = await fixture(t);
  const voice = await mockVoice(t);
  for (const value of [undefined, '', 'x'.repeat(31), 'x'.repeat(20) + ' ' + 'y'.repeat(20)]) {
    const result = await run(root, { QWEN_TTS_URL: voice.url, QWEN_TTS_API_TOKEN: value }, ['--enqueue-only']);
    assert.equal(result.code, 1);
    assert.match(result.output, /Não foi possível acompanhar/);
    if (value) assert.ok(!result.output.includes(value));
  }
  await writeFile(path.join(root, '.env.qwen.local'), `QWEN_TTS_API_TOKEN=${token}\n`);
  const empty = await run(root, { QWEN_TTS_URL: voice.url, QWEN_TTS_API_TOKEN: '' }, ['--enqueue-only']);
  assert.equal(empty.code, 1);
  assert.equal(voice.requests.length, 0);
});

for (const stage of ['enqueue', 'poll']) {
  test(`the preparation CLI refuses ${stage} redirects without sending credentials to the redirected route`, async t => {
    const root = await fixture(t);
    const voice = await mockVoice(t, stage);
    const result = await run(root, { QWEN_TTS_URL: voice.url, QWEN_TTS_API_TOKEN: token });
    assert.equal(result.code, 1);
    assert.equal(voice.requests.length, stage === 'enqueue' ? 1 : 2);
    assert.ok(voice.requests.every(request => request.url !== '/redirected'));
    assert.ok(!result.output.includes(token));
    assert.ok(!result.output.includes(voice.url));
  });
}

test('unknown CLI arguments and unknown activities fail before contacting the service', async t => {
  const root = await fixture(t);
  const voice = await mockVoice(t);
  for (const args of [['--unknown'], ['--activity=not-in-catalog']]) {
    const result = await run(root, { QWEN_TTS_URL: voice.url, QWEN_TTS_API_TOKEN: token }, args);
    assert.equal(result.code, 1);
  }
  assert.equal(voice.requests.length, 0);
});
