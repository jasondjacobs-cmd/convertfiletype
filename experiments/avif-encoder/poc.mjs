const input = document.querySelector('[data-jpeg-file]');
const runButton = document.querySelector('[data-run-proof]');
const status = document.querySelector('[data-status]');
const result = document.querySelector('[data-result]');
const details = document.querySelector('[data-result-details]');
const download = document.querySelector('[data-download]');

let file = null;
let outputUrl = null;
let encoderPromise = null;

const ENCODE_OPTIONS = {
  quality: 70,
  qualityAlpha: -1,
  denoiseLevel: 0,
  tileColsLog2: 0,
  tileRowsLog2: 0,
  speed: 6,
  subsample: 1,
  chromaDeltaQ: false,
  sharpness: 0,
  tune: 0,
  enableSharpYUV: false,
  bitDepth: 8
};

const revokeOutput = () => {
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = null;
  download.removeAttribute('href');
  download.removeAttribute('download');
  result.hidden = true;
};

const loadImage = (url) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('The browser could not decode the image.'));
  image.src = url;
});

const decodeJpeg = async (jpegFile) => {
  const url = URL.createObjectURL(jpegFile);
  try {
    const image = await loadImage(url);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('JPG dimensions are invalid.');
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas is unavailable.');
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
};

const getEncoder = async () => {
  if (!encoderPromise) {
    encoderPromise = import('./vendor/avif_enc.js').then(async ({ default: moduleFactory }) => {
      const module = await moduleFactory({
        noInitialRun: true,
        locateFile: (path) => new URL(`./vendor/${path}`, import.meta.url).href
      });
      if (typeof module.encode !== 'function') throw new Error('AVIF encoder did not initialize.');
      return module;
    });
  }
  return encoderPromise;
};

const hasAvifSignature = (bytes) => {
  if (bytes.length < 16) return false;
  const text = new TextDecoder('ascii').decode(bytes.subarray(4, Math.min(bytes.length, 40)));
  return text.startsWith('ftyp') && /avif|avis/.test(text);
};

input.addEventListener('change', () => {
  revokeOutput();
  file = input.files?.[0] || null;
  if (!file) {
    runButton.disabled = true;
    status.textContent = 'Choose a JPG to begin.';
    return;
  }
  if (!(file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name))) {
    file = null;
    input.value = '';
    runButton.disabled = true;
    status.textContent = 'Please choose a JPG image.';
    return;
  }
  runButton.disabled = false;
  status.textContent = 'Ready to run the AVIF encoder proof.';
});

runButton.addEventListener('click', async () => {
  if (!file) return;
  revokeOutput();
  runButton.disabled = true;
  status.textContent = 'Loading encoder and converting locally…';
  const started = performance.now();

  try {
    const imageData = await decodeJpeg(file);
    const encoder = await getEncoder();
    const encodedView = encoder.encode(
      new Uint8Array(imageData.data.buffer),
      imageData.width,
      imageData.height,
      ENCODE_OPTIONS
    );
    if (!encodedView || encodedView.byteLength === 0) throw new Error('AVIF encoder returned no data.');

    const bytes = new Uint8Array(encodedView);
    if (!hasAvifSignature(bytes)) throw new Error('Generated output does not contain a valid AVIF file signature.');

    const blob = new Blob([bytes], { type: 'image/avif' });
    outputUrl = URL.createObjectURL(blob);
    const decoded = await loadImage(outputUrl);
    if (decoded.naturalWidth !== imageData.width || decoded.naturalHeight !== imageData.height) {
      throw new Error('Generated AVIF dimensions do not match the JPG source.');
    }

    const elapsedMs = Math.round(performance.now() - started);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'converted';
    download.href = outputUrl;
    download.download = `${baseName}.avif`;
    download.textContent = 'Download proof AVIF';
    result.dataset.proofElapsedMs = String(elapsedMs);
    result.dataset.proofWidth = String(imageData.width);
    result.dataset.proofHeight = String(imageData.height);
    result.dataset.proofBytes = String(blob.size);
    details.textContent = `${imageData.width}×${imageData.height} JPG → ${blob.size.toLocaleString()} byte AVIF in ${(elapsedMs / 1000).toFixed(2)}s.`;
    result.hidden = false;
    status.textContent = 'AVIF encoder proof passed.';
  } catch (error) {
    revokeOutput();
    status.textContent = `AVIF encoder proof failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    runButton.disabled = !file;
  }
});
