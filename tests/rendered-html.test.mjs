import assert from "node:assert/strict";
import test from "node:test";
import { testOrigin } from "./helpers/test-origin.mjs";

// Exercise the Cloudflare runtime over HTTP; its Worker bundle cannot be
// imported directly into Node because it depends on Cloudflare bindings.
test("HTTP serves the Letria application shell and product metadata", { timeout: 60_000 }, async () => {
  const response = await fetch(testOrigin, {
    headers: { accept: "text/html" },
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html\b[^>]*\blang=["']pt-BR["']/i);
  assert.match(html, /<title>Letria[^<]*Uma aventura em cada palavra<\/title>/i);
  assert.match(html, /<h1\b[^>]*>\s*Letria\b/i);
  assert.match(html, /<meta\b(?=[^>]*\bname=["']application-name["'])(?=[^>]*\bcontent=["']Letria["'])[^>]*>/i);
  assert.match(html, /<link\b(?=[^>]*\brel=["']manifest["'])(?=[^>]*\bhref=["']\/manifest\.webmanifest["'])[^>]*>/i);
  const bootstrap = html.match(/<script\b[^>]*\bsrc=["']([^"']+)["']/i)
    ?? html.match(/<script\b[^>]*>\s*import\(\s*["']([^"']+)["']/i);
  assert.ok(bootstrap, "The page must include its client bootstrap.");
  const bootstrapResponse = await fetch(new URL(bootstrap[1], testOrigin), { signal: AbortSignal.timeout(15_000) });
  assert.equal(bootstrapResponse.status, 200, "The client bootstrap must be available.");
  assert.match(bootstrapResponse.headers.get("content-type") ?? "", /^(?:application|text)\/javascript\b/i);
  assert.match(html, /<link\b[^>]*\brel=["']stylesheet["']/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Codex is working|react-loading-skeleton/i);
});

test("HTTP serves the installable PWA manifest, icons and service worker", { timeout: 60_000 }, async () => {
  async function get(path) {
    const response = await fetch(new URL(path, testOrigin), { signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200, `Expected ${path} to be available.`);
    return response;
  }

  const manifestResponse = await get("/manifest.webmanifest");
  assert.match(manifestResponse.headers.get("content-type") ?? "", /^application\/(?:manifest\+)?json\b/i);
  const manifest = await manifestResponse.json();
  assert.match(manifest.name, /Letria/i);
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");

  for (const size of [192, 512]) {
    const icon = manifest.icons.find((item) => item.sizes.split(/\s+/).includes(`${size}x${size}`));
    assert.ok(icon, `The manifest must include a ${size}x${size} icon.`);
    const iconResponse = await get(icon.src);
    assert.match(iconResponse.headers.get("content-type") ?? "", /^image\/png\b/i);
    const bytes = Buffer.from(await iconResponse.arrayBuffer());
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }

  const workerResponse = await get("/sw.js");
  assert.match(workerResponse.headers.get("content-type") ?? "", /^(?:application|text)\/javascript\b/i);
  assert.ok((await workerResponse.text()).trim().length > 0);
});
