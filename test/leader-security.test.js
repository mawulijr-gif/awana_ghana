const assert = require("node:assert/strict");
const test = require("node:test");
const { createOneTimeToken, hashOneTimeToken, normalizeEmail } = require("../lib/leader-security");

test("one-time tokens are high entropy and stored as a one-way hash", () => {
  const first = createOneTimeToken();
  const second = createOneTimeToken();

  assert.equal(first.token.length, 43);
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, hashOneTimeToken(first.token));
  assert.notEqual(first.tokenHash, first.token);
});

test("rejects malformed or oversized one-time tokens", () => {
  assert.equal(hashOneTimeToken("short"), null);
  assert.equal(hashOneTimeToken("x".repeat(129)), null);
});

test("normalizes leader emails for case-insensitive account matching", () => {
  assert.equal(normalizeEmail("  Leader@Example.org "), "leader@example.org");
  assert.equal(normalizeEmail(null), "");
});
