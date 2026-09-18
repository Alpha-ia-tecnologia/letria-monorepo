import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { activityCatalog } from '../lib/activity-catalog';
import { activitySpeech, commonSpeech, uniqueSpeech, type PreparedSpeech } from '../lib/speech-content';

const args = process.argv.slice(2);
const activityId = args.find(value => value.startsWith('--activity='))?.slice('--activity='.length);
if (args.some(value => value !== '--catalog' && value !== '--enqueue-only' && !value.startsWith('--activity='))) {
  console.error('Use: npm run voice:prepare -- [--catalog | --activity=ID] [--enqueue-only]'); process.exit(1);
}
const selected = activityId ? activityCatalog.filter(activity => activity.id === activityId) : args.includes('--catalog') ? activityCatalog : [];
if (activityId && !selected.length) { console.error('Atividade não encontrada no catálogo.'); process.exit(1); }
const items = uniqueSpeech([...commonSpeech(), ...selected.flatMap(activitySpeech)]);
const batches: PreparedSpeech[][] = [];
for (const item of items) {
  const last = batches.at(-1);
  if (!last || last.length === 32 || Buffer.byteLength(JSON.stringify({ items: [...last, item] })) > 15000) batches.push([item]);
  else last.push(item);
}
try {
  const configuration = parseEnv(await readFile(new URL('../.env.qwen.local', import.meta.url), 'utf8'));
  const base = new URL(configuration.QWEN_TTS_URL || 'http://127.0.0.1:8766');
  if (!['127.0.0.1', 'localhost'].includes(base.hostname) || base.protocol !== 'http:' || base.username || base.password || base.search || base.hash) throw new Error();
  const headers = { Authorization: 'Bearer ' + configuration.QWEN_TTS_API_TOKEN, 'Content-Type': 'application/json' };
  let completed = 0, failed = 0;
  for (const batch of batches) {
    const response = await fetch(base.href.replace(/\/+$/, '') + '/v1/audio/prepare', {
      method: 'POST', headers, body: JSON.stringify({ items: batch }), signal: AbortSignal.timeout(10000), redirect: 'manual',
    });
    if (response.status !== 202) throw new Error();
    const job = await response.json() as { job_id: string };
    if (!/^[a-f0-9]{32}$/.test(job.job_id)) throw new Error();
    if (args.includes('--enqueue-only')) { console.log('Falas adicionadas à preparação: ' + batch.length); continue; }
    let previous = '';
    // The service journal resumes queued educational content after a restart.
    while (true) {
      const statusResponse = await fetch(base.href.replace(/\/+$/, '') + '/v1/audio/prepare/' + job.job_id, { headers, signal: AbortSignal.timeout(10000) });
      if (!statusResponse.ok) throw new Error();
      const status = await statusResponse.json() as { completed: number; failed: number; remaining: number };
      const progress = `${completed + status.completed}/${items.length}`;
      if (progress !== previous) { console.log('Áudios preparados: ' + progress); previous = progress; }
      if (status.remaining === 0) { completed += status.completed; failed += status.failed; break; }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  if (failed) { console.error('Falas não concluídas: ' + failed + '. Repita o comando para tentar novamente.'); process.exitCode = 1; }
} catch { console.error('Não foi possível acompanhar a preparação. Verifique o serviço Qwen local e repita o comando; os áudios concluídos serão reaproveitados.'); process.exitCode = 1; }
