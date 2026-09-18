import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeClientIp, trustedProxyHops } from './node-client-ip.mjs';

// Production receives process environment from Easypanel; no local secrets are loaded.
process.env.NODE_ENV ??= 'production';
const proxyHops = trustedProxyHops(process.env.LETRIA_TRUST_PROXY_HOPS);
const port = Number(process.env.PORT || '3000');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.');
let database;
try { database = new URL(process.env.DATABASE_URL || ''); } catch { throw new Error('Configure DATABASE_URL para PostgreSQL.'); }
if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new Error('DATABASE_URL precisa usar PostgreSQL.');
if (process.env.DATABASE_DRIVER && process.env.DATABASE_DRIVER !== 'postgres') throw new Error('O servidor Node usa DATABASE_DRIVER=postgres.');
process.env.DATABASE_DRIVER = 'postgres';
const directory = process.env.AUDIO_STORAGE_DIR;
if (!directory || !isAbsolute(directory)) throw new Error('Configure AUDIO_STORAGE_DIR com o caminho absoluto do volume privado.');
await mkdir(directory, { recursive: true, mode: 0o700 });
await access(directory, constants.R_OK | constants.W_OK);

// Dynamic import lets vinext read the proxy configuration from the container env.
const { startProdServer } = await import('vinext/server/prod-server');
const { server } = await startProdServer({
  port, host: process.env.HOST || '0.0.0.0',
  outDir: fileURLToPath(new URL('../dist', import.meta.url)),
});
// This runs before vinext converts the request to the Web API form.
// The proxy must append its verified peer IP and the app port must stay private.
server.prependListener('request', request => sanitizeClientIp(request, proxyHops));
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (closing) return;
  closing = true;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 20_000).unref();
});
