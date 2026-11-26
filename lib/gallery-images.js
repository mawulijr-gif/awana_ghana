function getGalleryImageFilenames(files) {
  return files
    .filter(file => file.id && /\.(jpe?g|png|gif|webp)$/i.test(file.name))
    .map(file => file.name);
}

module.exports = { getGalleryImageFilenames };
