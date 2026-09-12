import createLibheif from '/assets/vendor/libheif/libheif-bundle.mjs';

window.libheifReady = Promise.resolve()
  .then(() => createLibheif())
  .then((libheif) => {
    window.libheif = libheif;
    return libheif;
  })
  .catch((error) => {
    window.libheifLoadError = error?.message || String(error);
    throw error;
  });
