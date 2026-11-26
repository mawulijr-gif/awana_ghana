const MAX_HOME_GALLERY_IMAGES = 16;
const IMAGE_FILENAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpe?g|png|gif|webp)$/i;

function parseHomeGallerySelection(value) {
  if (typeof value !== "string") {
    throw new Error("Homepage gallery selection must be a JSON array.");
  }

  let filenames;
  try {
    filenames = JSON.parse(value);
  } catch {
    throw new Error("Homepage gallery selection must be valid JSON.");
  }

  if (!Array.isArray(filenames) || filenames.length > MAX_HOME_GALLERY_IMAGES) {
    throw new Error(`Select up to ${MAX_HOME_GALLERY_IMAGES} homepage gallery images.`);
  }
  if (filenames.some(filename => typeof filename !== "string" || !IMAGE_FILENAME_PATTERN.test(filename))) {
    throw new Error("Homepage gallery selections must be uploaded image filenames.");
  }
  if (new Set(filenames).size !== filenames.length) {
    throw new Error("Homepage gallery selections cannot contain duplicate images.");
  }

  return filenames;
}

module.exports = { MAX_HOME_GALLERY_IMAGES, parseHomeGallerySelection };
