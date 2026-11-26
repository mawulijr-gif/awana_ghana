const assert = require("node:assert/strict");
const test = require("node:test");
const { isValidImageUrl } = require("../lib/image-url");

test("accepts HTTP(S) URLs and root-relative image files", () => {
  assert.equal(isValidImageUrl("https://example.com/logo.webp"), true);
  assert.equal(isValidImageUrl("http://example.com/logo.png"), true);
  assert.equal(isValidImageUrl("/logo.png"), true);
  assert.equal(isValidImageUrl("/images/club photo.JPEG?size=large"), true);
  assert.equal(isValidImageUrl("/images/hero.avif"), true);
  assert.equal(isValidImageUrl("/images/photo.heic"), true);
  assert.equal(isValidImageUrl("/images/scan.tiff"), true);
  assert.equal(isValidImageUrl("/images/logo.svg"), true);
});

test("continues accepting legacy uploaded paths", () => {
  assert.equal(isValidImageUrl("/uploads/club-logo"), true);
});

test("rejects non-image, unsafe, and non-HTTP paths", () => {
  assert.equal(isValidImageUrl("/images/readme.txt"), false);
  assert.equal(isValidImageUrl("/images/../logo.png"), false);
  assert.equal(isValidImageUrl("/images/%2e%2e/logo.png"), false);
  assert.equal(isValidImageUrl("/images/%5c..%5clogo.png"), false);
  assert.equal(isValidImageUrl("//example.com/logo.png"), false);
  assert.equal(isValidImageUrl("javascript:alert(1)"), false);
  assert.equal(isValidImageUrl("images/logo.png"), false);
});
