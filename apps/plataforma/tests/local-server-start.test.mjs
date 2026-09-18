import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const launcher = fileURLToPath(new URL('../scripts/start-server.mjs', import.meta.url));
const fake = {
  openai: 'TEST_OPENAI_KEY_NOT_A_REAL_CREDENTIAL',
  deepseek: 'TEST_DEEPSEEK_KEY_NOT_A_REAL_CREDENTIAL',
  qwen: 'TEST_QWEN_TOKEN_NOT_A_REAL_CREDENTIAL',
  kokoro: 'TEST_KOKORO_TOKEN_NOT_A_REAL_CREDENTIAL',
  secret: 'TEST_APPLICATION_SECRET_ONLY',
  password: 'TEST-DATABASE@PASSWORD/ONLY',
};
const databaseUrl = 'postgresql://test-user:' + encodeURIComponent(fake.password) + '@database.invalid:5432/unused';
const baseEnv = `TUTOR_PROVIDER=deepseek\nDEEPSEEK_API_KEY=${fake.deepseek}\nSETTING_PRECEDENCE=base\nAPPLICATION_SECRET=${fake.secret}\n`;
const postgresEnv = `DATABASE_DRIVER=postgres\nDATABASE_URL=${databaseUrl}\nSETTING_PRECEDENCE=postgres\n`;

// The fake Wrangler only reads generated test files and emits generated test data.
// It never loads the application's environment, connects to a service or opens a port.
const wranglerStub = `
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
const args = process.argv.slice(2);
const files = args.flatMap((value, index) => value === '--env-file' ? [args[index + 1]] : []);
const values = Object.assign({}, ...files.map(file => parseEnv(readFileSync(file, 'utf8'))));
writeFileSync(process.env.LETRIA_TEST_LAUNCH_CAPTURE, JSON.stringify({
  args, files, values, cwd: process.cwd(),
  metrics: process.env.WRANGLER_SEND_METRICS, writeLogs: process.env.WRANGLER_WRITE_LOGS,
}));
const secrets = Object.entries(values).filter(([key, value]) => /KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL/.test(key) && value).map(([, value]) => value);
if (values.DATABASE_URL) secrets.push(decodeURIComponent(new URL(values.DATABASE_URL).password));
for (const secret of secrets) {
  const split = Math.max(1, Math.floor(secret.length / 2));
  process.stdout.write('stdout-test-value=' + secret.slice(0, split));
  await delay(5);
  process.stdout.write(secret.slice(split) + '\\n');
  process.stderr.write('stderr-test-value=' + secret + '\\n');
}
process.stdout.write('fake-wrangler-ready\\n');
process.stderr.write('last-value-without-newline=' + (secrets.at(-1) || 'none'));
`;

async function fixture(t, files = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'letria-local-start-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('letria-local-start-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, 'node_modules', 'wrangler', 'bin'), { recursive: true });
  await mkdir(path.join(root, 'dist', 'server'), { recursive: true });
  await copyFile(launcher, path.join(root, 'scripts', 'start-server.mjs'));
  await writeFile(path.join(root, 'node_modules', 'wrangler', 'package.json'), JSON.stringify({ name: 'wrangler', version: '0.0.0-test', type: 'module' }));
  await writeFile(path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), wranglerStub);
  await writeFile(path.join(root, 'dist', 'server', 'wrangler.json'), '{}\n');
  for (const [name, contents] of Object.entries({ '.env': baseEnv, '.env.postgres.local': postgresEnv, ...files })) {
    await writeFile(path.join(root, name), contents);
  }
  return { root, capture: path.join(root, 'fake-wrangler-capture.json') };
}

function run(fixture, args = []) {
  const env = { ...process.env, LETRIA_TEST_LAUNCH_CAPTURE: fixture.capture };
  for (const name of Object.keys(env)) {
    if (/^(OPENAI|DEEPSEEK|QWEN|KOKORO|DATABASE|TTS|TUTOR)_/.test(name)) delete env[name];
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(fixture.root, 'scripts', 'start-server.mjs'), ...args], {
      cwd: fixture.root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Local launcher test timed out.')); }, 10_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}
const capture = async fixture => JSON.parse(await readFile(fixture.capture, 'utf8'));
const notStarted = async fixture => assert.rejects(access(fixture.capture), { code: 'ENOENT' });

test('npm start selects OpenAI ahead of Qwen while retaining DeepSeek and PostgreSQL settings', async t => {
  const setup = await fixture(t, {
    '.env.openai.local': `TTS_PROVIDER=openai\nOPENAI_API_KEY=${fake.openai}\nOPENAI_TTS_VOICE=marin\nSETTING_PRECEDENCE=voice\n`,
    '.env.qwen.local': `TTS_PROVIDER=qwen\nQWEN_TTS_API_TOKEN=${fake.qwen}\n`,
  });
  const result = await run(setup);
  assert.equal(result.code, 0, result.stderr);
  const started = await capture(setup);
  assert.deepEqual(started.files, ['.env', '.env.openai.local', '.env.postgres.local'].map(file => path.join(setup.root, file)));
  assert.equal(started.values.TTS_PROVIDER, 'openai');
  assert.equal(started.values.OPENAI_API_KEY, fake.openai);
  assert.equal(started.values.OPENAI_TTS_VOICE, 'marin');
  assert.equal(started.values.QWEN_TTS_API_TOKEN, undefined);
  assert.equal(started.values.TUTOR_PROVIDER, 'deepseek');
  assert.equal(started.values.DEEPSEEK_API_KEY, fake.deepseek);
  assert.equal(started.values.DATABASE_DRIVER, 'postgres');
  assert.equal(started.values.DATABASE_URL, databaseUrl);
  assert.equal(started.values.SETTING_PRECEDENCE, 'postgres');
  assert.equal(started.cwd, setup.root);
  assert.equal(started.metrics, 'false');
  assert.equal(started.writeLogs, 'false');
  assert.ok(started.args.includes('--local'));
  assert.equal(started.args[started.args.indexOf('--ip') + 1], '127.0.0.1');
});

test('explicit OpenAI launch uses the configured file and keeps its credentials out of stdout and stderr', async t => {
  const setup = await fixture(t, { '.env.openai.local': `TTS_PROVIDER=openai\nOPENAI_API_KEY=${fake.openai}\n` });
  const result = await run(setup, ['--voice=openai']);
  assert.equal(result.code, 0, result.stderr);
  const started = await capture(setup);
  assert.equal(started.values.TTS_PROVIDER, 'openai');
  for (const stream of [result.stdout, result.stderr]) {
    assert.match(stream, /\[hidden\]/);
    for (const secret of [fake.openai, fake.deepseek, fake.secret, databaseUrl, fake.password]) assert.ok(!stream.includes(secret));
  }
  assert.match(result.stdout, /fake-wrangler-ready/);
  assert.match(result.stderr, /last-value-without-newline=\[hidden\]$/);
});

test('explicit OpenAI launch rejects a missing file instead of silently selecting existing Qwen settings', async t => {
  const setup = await fixture(t, { '.env.qwen.local': `TTS_PROVIDER=qwen\nQWEN_TTS_API_TOKEN=${fake.qwen}\n` });
  const result = await run(setup, ['--voice=openai']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /\.env\.openai\.local/);
  await notStarted(setup);
});

test('missing and whitespace OpenAI keys prevent startup before Wrangler is invoked', async t => {
  for (const configured of ['TTS_PROVIDER=openai\n', 'TTS_PROVIDER=openai\nOPENAI_API_KEY="   "\n']) {
    const setup = await fixture(t, { '.env.openai.local': configured });
    const result = await run(setup, ['--voice=openai']);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /OPENAI_API_KEY/);
    await notStarted(setup);
  }
});

test('the automatically selected OpenAI file must declare the OpenAI provider', async t => {
  const setup = await fixture(t, {
    '.env.openai.local': `TTS_PROVIDER=qwen\nOPENAI_API_KEY=${fake.openai}\n`,
    '.env.qwen.local': `TTS_PROVIDER=qwen\nQWEN_TTS_API_TOKEN=${fake.qwen}\n`,
  });
  const result = await run(setup);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /TTS_PROVIDER=openai/);
  assert.ok(!result.stderr.includes(fake.openai));
  await notStarted(setup);
});

test('default startup preserves Qwen when the OpenAI file does not exist', async t => {
  const setup = await fixture(t, {
    '.env.qwen.local': `TTS_PROVIDER=qwen\nQWEN_TTS_API_TOKEN=${fake.qwen}\nQWEN_TTS_URL=http://127.0.0.1:8766\n`,
    '.env.kokoro.local': `TTS_PROVIDER=kokoro\nKOKORO_TTS_API_TOKEN=${fake.kokoro}\n`,
  });
  const result = await run(setup);
  assert.equal(result.code, 0, result.stderr);
  const started = await capture(setup);
  assert.deepEqual(started.files, ['.env', '.env.qwen.local', '.env.postgres.local'].map(file => path.join(setup.root, file)));
  assert.equal(started.values.TTS_PROVIDER, 'qwen');
  assert.equal(started.values.QWEN_TTS_API_TOKEN, fake.qwen);
  assert.equal(started.values.KOKORO_TTS_API_TOKEN, undefined);
  assert.equal(started.values.TUTOR_PROVIDER, 'deepseek');
  assert.equal(started.values.DATABASE_URL, databaseUrl);
  assert.ok(!result.stdout.includes(fake.qwen));
  assert.ok(!result.stderr.includes(fake.qwen));
});

test('legacy Kokoro fallback remains available when neither OpenAI nor Qwen is configured', async t => {
  const setup = await fixture(t, { '.env.kokoro.local': `TTS_PROVIDER=kokoro\nKOKORO_TTS_API_TOKEN=${fake.kokoro}\n` });
  const result = await run(setup);
  assert.equal(result.code, 0, result.stderr);
  const started = await capture(setup);
  assert.deepEqual(started.files, ['.env', '.env.kokoro.local', '.env.postgres.local'].map(file => path.join(setup.root, file)));
  assert.equal(started.values.TTS_PROVIDER, 'kokoro');
  assert.ok(!result.stdout.includes(fake.kokoro));
  assert.ok(!result.stderr.includes(fake.kokoro));
});
