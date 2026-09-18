import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTutorProvider, tutorProviderReply, readTutorProviderResponse } from '../lib/server/tutor-provider';

test('DeepSeek stays inactive until both explicit activation and a private key exist', () => {
  for (const settings of [
    {}, { TUTOR_PROVIDER: 'deepseek' }, { TUTOR_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'fake' },
    { TUTOR_PROVIDER: 'deepseek', DEEPSEEK_ENABLED: 'true' },
    { TUTOR_PROVIDER: 'deepseek', DEEPSEEK_ENABLED: 'false', DEEPSEEK_API_KEY: 'fake', OPENAI_API_KEY: 'other' },
    { TUTOR_PROVIDER: 'deepseek', DEEPSEEK_ENABLED: 'true', OPENAI_API_KEY: 'other' },
    { TUTOR_PROVIDER: 'local', DEEPSEEK_ENABLED: 'true', DEEPSEEK_API_KEY: 'fake', OPENAI_API_KEY: 'other' },
    { TUTOR_PROVIDER: 'unknown', DEEPSEEK_ENABLED: 'true', DEEPSEEK_API_KEY: 'fake', OPENAI_API_KEY: 'other' },
  ]) assert.deepEqual(selectTutorProvider(settings), { provider: 'local' });
});

test('provider selection preserves legacy OpenAI and prioritizes only an explicitly activated DeepSeek', () => {
  assert.deepEqual(selectTutorProvider({ OPENAI_API_KEY: 'fake-openai' }), { provider: 'openai', key: 'fake-openai', model: 'gpt-4.1-mini' });
  const both = { DEEPSEEK_ENABLED: 'true', DEEPSEEK_API_KEY: 'fake-deepseek', OPENAI_API_KEY: 'fake-openai' };
  assert.deepEqual(selectTutorProvider(both), { provider: 'deepseek', key: 'fake-deepseek', model: 'deepseek-flash' });
  assert.deepEqual(selectTutorProvider({ ...both, TUTOR_PROVIDER: 'openai', OPENAI_MODEL: 'custom-openai' }), { provider: 'openai', key: 'fake-openai', model: 'custom-openai' });
  assert.deepEqual(selectTutorProvider({ ...both, TUTOR_PROVIDER: 'deepseek', DEEPSEEK_MODEL: ' custom-deepseek ' }), { provider: 'deepseek', key: 'fake-deepseek', model: 'custom-deepseek' });
  assert.deepEqual(selectTutorProvider({ ...both, DEEPSEEK_ENABLED: 'false' }), { provider: 'local' });
});

test('DeepSeek output accepts final text only and never reveals reasoning or incomplete replies', () => {
  const result = (content: unknown, finish_reason = 'stop') => ({ choices: [{ finish_reason, message: { role: 'assistant', content, reasoning_content: 'private-reasoning' } }] });
  assert.equal(tutorProviderReply('deepseek', result('  Uma pista clara.  ')), 'Uma pista clara.');
  assert.equal(tutorProviderReply('deepseek', result('x'.repeat(1500)))?.length, 1200);
  for (const reason of ['length', 'content_filter', 'tool_calls', 'insufficient_system_resource']) assert.equal(tutorProviderReply('deepseek', result('partial', reason)), null);
  for (const content of ['', ' ', null, 12, ['text'], '<think>private</think>resposta']) assert.equal(tutorProviderReply('deepseek', result(content)), null);
  assert.equal(tutorProviderReply('deepseek', { choices: [{ finish_reason: 'stop', message: { role: 'assistant', reasoning_content: 'secret' } }] }), null);
});

test('provider responses reject excess data, non-JSON and cancelled streams', async () => {
  const active = new AbortController();
  await assert.rejects(readTutorProviderResponse(new Response('private', { status: 429 }), active.signal));
  await assert.rejects(readTutorProviderResponse(new Response('private', { headers: { 'Content-Type': 'text/plain' } }), active.signal));
  await assert.rejects(readTutorProviderResponse(new Response('x'.repeat(65537), { headers: { 'Content-Type': 'application/json' } }), active.signal));
  assert.deepEqual(await readTutorProviderResponse(Response.json({ choices: [] }), active.signal), { choices: [] });
  const controller = new AbortController();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const reading = readTutorProviderResponse(new Response(stream, { headers: { 'Content-Type': 'application/json' } }), controller.signal);
  controller.abort();
  await assert.rejects(reading, error => error instanceof Error && error.name === 'AbortError');
  assert.equal(cancelled, true);
});
