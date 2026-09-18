import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceServiceUrl } from '../lib/server/voice-url';

test('voice endpoints keep HTTPS and loopback defaults', () => {
  for (const url of ['https://voice.example.test/base', 'http://localhost:8766', 'http://127.0.0.1:8766', 'http://[::1]:8766']) {
    assert.equal(voiceServiceUrl(url).href, new URL(url).href);
  }
});
test('internal Docker HTTP requires the exact operator-configured origin', () => {
  const origin = 'http://projeto_voice:8766';
  assert.throws(() => voiceServiceUrl(origin));
  assert.equal(voiceServiceUrl(origin + '/prefix', origin).origin, origin);
  for (const url of ['http://projeto_voice:8767', 'http://other_voice:8766', 'http://projeto_voice.evil.test:8766']) {
    assert.throws(() => voiceServiceUrl(url, origin));
  }
});
test('voice URL credentials, query, fragment and non-HTTP protocols stay forbidden', () => {
  for (const url of ['https://user:pass@voice.test', 'https://voice.test/?key=x', 'https://voice.test/#x', 'file:///secret', 'ftp://voice.test']) {
    assert.throws(() => voiceServiceUrl(url, 'http://projeto_voice:8766'));
  }
  for (const allowed of ['*', 'http://user:pass@projeto_voice:8766', 'http://projeto_voice:8766/path', 'http://projeto_voice:8766?key=x', 'http://projeto_voice:8766#x']) {
    assert.throws(() => voiceServiceUrl('http://projeto_voice:8766', allowed));
  }
});
