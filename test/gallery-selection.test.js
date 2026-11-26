const assert = require("node:assert/strict");
const test = require("node:test");
const { MAX_HOME_GALLERY_IMAGES, parseHomeGallerySelection } = require("../lib/gallery-selection");

const imageFilename = index => `${String(index).padStart(8, "0")}-1234-4234-8234-123456789abc.jpg`;

test("parses an empty and valid homepage gallery selection", () => {
  assert.deepEqual(parseHomeGallerySelection("[]"), []);
  assert.deepEqual(parseHomeGallerySelection(JSON.stringify([imageFilename(1), imageFilename(2)])), [
    imageFilename(1),
    imageFilename(2)
  ]);
});

test("rejects invalid gallery selections", () => {
  assert.throws(() => parseHomeGallerySelection("{"));
  assert.throws(() => parseHomeGallerySelection(JSON.stringify([imageFilename(1), imageFilename(1)])), /duplicate/);
  assert.throws(() => parseHomeGallerySelection(JSON.stringify(["not-an-image.png"])), /uploaded image filenames/);
  assert.throws(() => parseHomeGallerySelection(JSON.stringify(Array.from(
    { length: MAX_HOME_GALLERY_IMAGES + 1 },
    (_, index) => imageFilename(index)
  ))), /up to 16/);
});
