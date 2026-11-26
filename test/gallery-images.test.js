const assert = require("node:assert/strict");
const test = require("node:test");
const { getGalleryImageFilenames } = require("../lib/gallery-images");

test("includes uploaded image files and excludes folders and other file types", () => {
  const files = [
    { id: "image-1", name: "club.jpg" },
    { id: "image-2", name: "leader.PNG" },
    { id: "image-3", name: "family.webp" },
    { id: "image-4", name: "animated.gif" },
    { id: "file-1", name: "guide.pdf" },
    { id: null, name: "resources" }
  ];

  assert.deepEqual(getGalleryImageFilenames(files), [
    "club.jpg",
    "leader.PNG",
    "family.webp",
    "animated.gif"
  ]);
});
