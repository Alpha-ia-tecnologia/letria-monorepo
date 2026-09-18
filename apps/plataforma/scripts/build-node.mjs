import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./cli.js', import.meta.resolve('vinext')));
const child = spawn(process.execPath, [cli, 'build'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, LETRIA_RUNTIME: 'node', NODE_ENV: 'production' },
  stdio: 'inherit',
});
child.on('error', () => { console.error('Não foi possível iniciar o build Node.'); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
