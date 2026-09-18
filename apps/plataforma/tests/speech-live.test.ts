import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechPlayer, type SpeechEnvironment } from '../lib/speech';
import { LUMI_HELLO } from '../lib/speech-content';

// Explicit opt-in: real app, GPU and one DeepSeek request. Playback is simulated;
// this validates the integration, not browser autoplay or perceived voice quality.
test('live Lumi: fixed voice, prepared greeting, new DeepSeek reply and repeated audio', {
  skip: process.env.LETRIA_TEST_LIVE_VOICE !== '1', timeout: 600000,
}, async t => {
  const base = process.env.LETRIA_TEST_URL; assert.ok(base);
  const session = await fetch(base + '/api/platform?demo=1');
  assert.equal(session.status, 200);
  const cookie = session.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie);
  const headers = { cookie, Origin: base, 'Content-Type': 'application/json' };
  const capabilities = await (await fetch(base + '/api/speech', { headers })).json() as Record<string, unknown>;
  assert.equal(capabilities.provider, 'qwen'); assert.equal(capabilities.fixedVoice, true); assert.equal(capabilities.streaming, true);
  const greet = await (await fetch(base + '/api/tutor', { method: 'POST', headers, body: JSON.stringify({ message: 'oi', history: [] }) })).json() as { reply: string; prepared: boolean };
  assert.equal(greet.reply, LUMI_HELLO); assert.equal(greet.prepared, true);
  const tutorStarted = performance.now();
  const tutor = await fetch(base + '/api/tutor', {
    method: 'POST', headers, body: JSON.stringify({ message: 'Como posso praticar vogais?', history: [] }), signal: AbortSignal.timeout(30000),
  });
  const answer = await tutor.json() as { provider: string; mode: string; reply: string };
  assert.equal(tutor.status, 200); assert.equal(answer.provider, 'deepseek'); assert.equal(answer.mode, 'ai'); assert.ok(answer.reply.length > 0);
  t.diagnostic('DeepSeek text: ' + ((performance.now() - tutorStarted) / 1000).toFixed(2) + ' s, ' + answer.reply.length + ' characters');

  async function speech(text: string, label: string) {
    let firstAudioMs = 0, sampleCount = 0, nonSilent = false, posts = 0, finished = false;
    const chunks: Float32Array[] = [], started = performance.now();
    const environment: SpeechEnvironment = {
      online: () => true, localServer: () => true,
      utterance: () => { throw new Error('No device fallback'); },
      audio: () => { throw new Error('Fixed voice must use PCM'); },
      createURL: () => { throw new Error('No blob buffering'); }, revokeURL: () => {},
      fetch: async (input, init) => {
        if (init?.method === 'POST') {
          posts++; const body = JSON.parse(String(init.body)); assert.equal(body.stream, true); assert.equal(body.text, text);
        }
        return fetch(new URL(String(input), base), { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), ...headers } });
      },
      pcmAudio: events => ({
        append(samples, rate) {
          assert.equal(rate, 24000); chunks.push(samples); sampleCount += samples.length;
          nonSilent ||= samples.some(value => Math.abs(value) > .01);
          if (!firstAudioMs) firstAudioMs = performance.now() - started;
          events.playing();
        },
        finish() { finished = true; events.ended(); },
        async resume() {}, close() {}, mouthLevel: () => .2,
      }),
    };
    const player = new SpeechPlayer(environment);
    try {
      await player.play(label, text, true, { profile: 'conversation', pace: 'natural', requireNatural: true });
      const state = player.getSnapshot(); assert.equal(state.status, 'idle'); assert.equal(state.message, '');
      assert.equal(posts, 1); assert.ok(finished && nonSilent && sampleCount > 0);
      const result = new Float32Array(sampleCount); let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      t.diagnostic(label + ': first playback ' + (firstAudioMs / 1000).toFixed(2) + ' s, audio ' + (sampleCount / 24000).toFixed(2) + ' s');
      return result;
    } finally { player.stop(); }
  }
  await speech(greet.reply, 'prepared greeting');
  const first = await speech(answer.reply, 'new reply');
  const repeated = await speech(answer.reply, 'repeated reply');
  assert.deepEqual(repeated, first, 'Repeat reuses the complete audio exactly');
});
