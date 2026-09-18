import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { normalizeClientIp, sanitizeClientIp, trustedProxyHops } from '../scripts/node-client-ip.mjs';

function request(headers = {}, remoteAddress = '::ffff:10.0.0.4') {
  return { headers: { ...headers }, rawHeaders: Object.entries(headers).flat(), socket: { remoteAddress } };
}

test('proxy trust is disabled by default and only accepts an explicit bounded hop count', () => {
  for (const value of [undefined, '', '  ']) assert.equal(trustedProxyHops(value), 0);
  for (const value of ['0', '1', '2', '3', '4', '5', ' 1 ']) assert.equal(trustedProxyHops(value), Number(value));
  for (const value of ['-1', '6', '1.0', '1e0', 'true', '01', 'all']) {
    assert.throws(() => trustedProxyHops(value), /LETRIA_TRUST_PROXY_HOPS/);
  }
});

test('direct connections ignore spoofed forwarding, Cloudflare and internal headers', () => {
  const incoming = request({
    'cf-connecting-ip': '203.0.113.1', 'x-letria-client-ip': '203.0.113.2',
    'x-forwarded-for': '203.0.113.3', 'x-real-ip': '203.0.113.4',
  });
  assert.equal(sanitizeClientIp(incoming, 0), '10.0.0.4');
  assert.equal(incoming.headers['x-letria-client-ip'], '10.0.0.4');
  assert.equal(incoming.headers['cf-connecting-ip'], undefined);
  assert.equal(incoming.rawHeaders.includes('cf-connecting-ip'), false);
  assert.equal(incoming.rawHeaders.includes('203.0.113.2'), false);
});

test('one trusted proxy selects the rightmost client address, never a forged left prefix', () => {
  for (const prefix of ['198.51.100.99', 'garbage', '2001:db8::99']) {
    const incoming = request({ 'x-forwarded-for': `${prefix}, 203.0.113.8` });
    assert.equal(sanitizeClientIp(incoming, 1), '203.0.113.8');
  }
  assert.equal(sanitizeClientIp(request({ 'x-forwarded-for': '203.0.113.8, 10.0.0.3' }), 2), '203.0.113.8');
  assert.equal(sanitizeClientIp(request({ 'x-forwarded-for': '203.0.113.8' }), 2), '10.0.0.4');
});

test('malformed or excessive forwarding falls back to the socket address', () => {
  for (const forwarded of ['', 'unknown', '203.0.113.8:80', '[2001:db8::1]', '203.0.113.8,',
    '203.0.113.8\r\nforged', ['203.0.113.8'], ' '.repeat(2049), Array(33).fill('203.0.113.8').join(',')]) {
    assert.equal(sanitizeClientIp(request({ 'x-forwarded-for': forwarded }), 1), '10.0.0.4');
  }
  assert.equal(sanitizeClientIp(request({ 'x-forwarded-for': '203.0.113.8, invalid' }), 2), '10.0.0.4');
  const invalidSocket = request({ 'cf-connecting-ip': '203.0.113.8', 'x-letria-client-ip': '203.0.113.9', 'x-forwarded-for': '203.0.113.8' }, 'invalid');
  assert.equal(sanitizeClientIp(invalidSocket, 1), null);
  assert.equal(invalidSocket.headers['x-letria-client-ip'], undefined);
  assert.equal(invalidSocket.headers['cf-connecting-ip'], undefined);
});

test('IPv6 normalization prevents equivalent IP addresses from obtaining separate limits', () => {
  assert.equal(normalizeClientIp('2001:0DB8:0000:0000:0000:0000:0000:000A'), '2001:db8::a');
  assert.equal(normalizeClientIp('::ffff:192.0.2.25'), '192.0.2.25');
  assert.equal(normalizeClientIp('0:0:0:0:0:ffff:c000:219'), '192.0.2.25');
  assert.equal(normalizeClientIp('fe80::1%eth0'), null);
  assert.equal(normalizeClientIp('192.000.2.25'), null);
});

test('the prepended sanitizer reaches the HTTP handler before forged client identities', async t => {
  const counts = new Map();
  const server = createServer((incoming, response) => {
    const headers = new Headers(incoming.headers);
    const identity = headers.get('x-letria-client-ip');
    const count = (counts.get(identity) || 0) + 1;
    counts.set(identity, count);
    response.writeHead(count > 12 ? 429 : 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ identity, cloudflare: headers.get('cf-connecting-ip'), count }));
  });
  server.prependListener('request', incoming => sanitizeClientIp(incoming, 1));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/`;
  for (let attempt = 0; attempt < 13; attempt++) {
    const response = await fetch(url, { headers: {
      'x-forwarded-for': `${attempt}.0.0.1, 203.0.113.20`,
      'cf-connecting-ip': `198.51.100.${attempt}`, 'x-letria-client-ip': `198.51.100.${attempt}`,
    } });
    assert.equal(response.status, attempt < 12 ? 200 : 429);
    const body = await response.json();
    assert.equal(body.identity, '203.0.113.20');
    assert.equal(body.cloudflare, null);
  }
  const other = await fetch(url, { headers: { 'x-forwarded-for': '203.0.113.21', 'cf-connecting-ip': '203.0.113.20' } });
  assert.equal(other.status, 200);
  assert.deepEqual(await other.json(), { identity: '203.0.113.21', cloudflare: null, count: 1 });
});
