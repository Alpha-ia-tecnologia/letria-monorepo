import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedSpeechStream } from '../lib/server/speech-stream';

const encoder = new TextEncoder();
const start = JSON.stringify({ type: 'start', sampleRate: 24000 }) + '\n';
const frame = JSON.stringify({ type: 'audio', data: btoa('\x01\x00\x02\x00') }) + '\n';
const end = JSON.stringify({ type: 'end' }) + '\n';
const source = (text: string) => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode(text)); controller.close(); } });
test('proxy forwards the first validated audio without waiting for the final frame', async () => {
  let upstream!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(controller) { upstream = controller; } });
  const reader = checkedSpeechStream(body, new AbortController().signal).getReader();
  upstream.enqueue(encoder.encode(start + frame));
  const first = await reader.read();
  assert.ok(first.value && new TextDecoder().decode(first.value).includes('audio'));
  upstream.enqueue(encoder.encode(end)); upstream.close();
  while (!(await reader.read()).done) { /* Drain */ }
});
test('proxy rejects incomplete, malformed, oversized and trailing output', async () => {
  for (const value of [start + frame, frame + end, start + end, start + frame + end + frame, start + JSON.stringify({ type: 'audio', data: 'AA==' }) + '\n' + end, 'x'.repeat(256 * 1024 + 1)]) {
    await assert.rejects(new Response(checkedSpeechStream(source(value), new AbortController().signal)).arrayBuffer());
  }
});
test('consumer cancellation propagates to the upstream voice stream', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const reader = checkedSpeechStream(body, new AbortController().signal).getReader();
  await reader.cancel();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(cancelled, true);
});
