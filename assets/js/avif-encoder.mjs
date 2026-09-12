import createAvifModule from '/assets/vendor/jsquash-avif/avif_enc.js';

const WASM_PATH = '/assets/vendor/jsquash-avif/avif_enc.wasm';
let modulePromise;

const clampQuality = (value) => Math.max(1, Math.min(100, Math.round(Number(value) || 80)));

export async function initAvifEncoder() {
  if (!modulePromise) {
    modulePromise = createAvifModule({
      noInitialRun: true,
      locateFile(path) {
        return path.endsWith('.wasm') ? WASM_PATH : path;
      }
    });
  }
  return modulePromise;
}

export async function encodeAvif(imageData, quality = 80) {
  if (!imageData || !imageData.data || !imageData.width || !imageData.height) {
    throw new Error('AVIF encoder received invalid image data.');
  }

  const module = await initAvifEncoder();
  const source = new Uint8Array(
    imageData.data.buffer,
    imageData.data.byteOffset,
    imageData.data.byteLength
  );

  const output = module.encode(source, imageData.width, imageData.height, {
    quality: clampQuality(quality),
    qualityAlpha: -1,
    denoiseLevel: 0,
    tileColsLog2: 0,
    tileRowsLog2: 0,
    speed: 8,
    subsample: 1,
    chromaDeltaQ: false,
    sharpness: 0,
    tune: 0,
    enableSharpYUV: false,
    bitDepth: 8
  });

  if (!output || !output.byteLength) {
    throw new Error('AVIF encoding failed.');
  }

  return new Uint8Array(output);
}
