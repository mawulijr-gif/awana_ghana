const LOCAL_IMAGE_EXTENSION = /\.(?:apng|avif|bmp|gif|heic|heif|ico|jpe?g|jfif|pjpeg|pjp|png|svg|tiff?|webp)$/i;

function isValidImageUrl(value) {
  if (!value) return true;

  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(value)) return true;

  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch (_error) {
      return false;
    }
  }

  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return false;
  }

  try {
    const rawPath = value.split(/[?#]/, 1)[0];
    const decodedPath = decodeURIComponent(rawPath);
    if (decodedPath.includes("\\") || /[\u0000-\u001f]/.test(decodedPath) ||
        decodedPath.split("/").some(segment => segment === "." || segment === "..")) {
      return false;
    }
    return LOCAL_IMAGE_EXTENSION.test(decodedPath);
  } catch (_error) {
    return false;
  }
}

module.exports = { isValidImageUrl };
