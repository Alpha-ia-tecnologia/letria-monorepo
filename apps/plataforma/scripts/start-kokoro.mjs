import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = resolve(appRoot, '../..');
const wrangler = createRequire(import.meta.url).resolve('wrangler/bin/wrangler.js');
const python = resolve(repoRoot, process.platform === 'win32' ? '.venv-kokoro/Scripts/python.exe' : '.venv-kokoro/bin/python');
const configPath = resolve(appRoot, '.env.kokoro.local');
const workerConfig = resolve(appRoot, 'dist/server/wrangler.json');
if (!existsSync(python) || !existsSync(configPath)) {
  console.error('Prepare a voz primeiro: npm run voice:setup'); process.exit(1);
}
if (!existsSync(workerConfig)) {
  console.error('Compile o sistema primeiro: npm run build'); process.exit(1);
}
const configuration = parseEnv(readFileSync(configPath, 'utf8'));
const token = configuration.KOKORO_API_TOKEN;
const postgresPath = resolve(appRoot, '.env.postgres.local');
const postgres = existsSync(postgresPath) ? parseEnv(readFileSync(postgresPath, 'utf8')) : {};
if (!postgres.DATABASE_URL) { console.error('Configure o PostgreSQL em .env.postgres.local antes de iniciar.'); process.exit(1); }
const baseEnv = existsSync(resolve(appRoot, '.env')) ? parseEnv(readFileSync(resolve(appRoot, '.env'), 'utf8')) : {};
const secrets = Object.entries({ ...baseEnv, ...configuration, ...postgres }).filter(([name, value]) => /KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL/.test(name) && value).map(([, value]) => value);
try { secrets.push(decodeURIComponent(new URL(postgres.DATABASE_URL).password)); } catch { console.error('A conexão PostgreSQL configurada é inválida.'); process.exit(1); }
function forward(stream, output) {
  let pending = '';
  const redact = line => secrets.reduce((text, secret) => text.replaceAll(secret, '[hidden]'), line);
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    pending += chunk;
    let newline;
    while ((newline = pending.indexOf('\n')) >= 0) { output.write(redact(pending.slice(0, newline + 1))); pending = pending.slice(newline + 1); }
  });
  stream.on('end', () => { if (pending) output.write(redact(pending)); });
}
if (configuration.TTS_PROVIDER !== 'kokoro' || !token || configuration.KOKORO_URL !== 'http://127.0.0.1:8765') {
  console.error('A configuração local deve usar Kokoro em http://127.0.0.1:8765 e um token privado.'); process.exit(1);
}
const children = new Set();
let stopping = false;
function cleanup(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => cleanup());
process.on('SIGTERM', () => cleanup());
function launch(command, args, env) {
  const child = spawn(command, args, { cwd: appRoot, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  children.add(child);
  forward(child.stdout, process.stdout); forward(child.stderr, process.stderr);
  child.once('error', () => { console.error('Não foi possível iniciar um serviço local.'); cleanup(1); });
  child.once('exit', code => { children.delete(child); if (!stopping) cleanup(code || 0); });
  return child;
}
async function healthy() {
  try {
    const response = await fetch(configuration.KOKORO_URL + '/health', {
      headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(1000),
    });
    if (!response.ok) return false;
    const status = await response.json();
    return status.status === 'ready' && status.voice === 'pf_dora';
  } catch { return false; }
}
if (!await healthy()) {
  launch(python, ['-u', resolve(repoRoot, 'services/kokoro/server.py')], {
    ...process.env, KOKORO_API_TOKEN: token, PYTHONUTF8: '1',
  });
  const deadline = Date.now() + 60000;
  while (!stopping && Date.now() < deadline && !await healthy()) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (stopping || !await healthy()) {
    console.error('A voz Dora não ficou pronta. Confira os modelos com npm run voice:setup.');
    cleanup(1);
  }
}
if (!stopping) {
  console.log('Dora pronta no computador. Iniciando a Letria em http://127.0.0.1:3002');
  const envFiles = existsSync(resolve(appRoot, '.env')) ? ['--env-file', resolve(appRoot, '.env')] : [];
  launch(process.execPath, [
    wrangler, 'dev',
    '--config', workerConfig, '--local', '--persist-to', '.wrangler/test-state',
    '--port', '3002', '--ip', '127.0.0.1',
    ...envFiles, '--env-file', configPath, '--env-file', postgresPath,
  ], { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' });
}
