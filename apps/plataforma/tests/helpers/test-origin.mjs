import assert from "node:assert/strict";

const value = process.env.LETRIA_TEST_URL;
assert.ok(value, "Set LETRIA_TEST_URL to the running Letria server, e.g. http://127.0.0.1:3000.");
const url = new URL(value);
assert.ok(["http:", "https:"].includes(url.protocol), "LETRIA_TEST_URL must use HTTP or HTTPS.");
assert.ok(url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password,
  "LETRIA_TEST_URL must contain only the server origin, e.g. http://127.0.0.1:3000.");

export const testOrigin = url.origin;
