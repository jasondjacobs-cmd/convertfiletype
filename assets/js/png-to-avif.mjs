import { encodeAvif } from '/assets/js/avif-encoder.mjs';

const input = document.querySelector('[data-png-file]');
if (input) {
  const q = (selector) => document.querySelector(selector);
  const drop = q('[data-drop-zone]');
  const selected = q('[data-selected-file]');
  const name = q('[data-file-name]');
  const size = q('[data-file-size]');
  const clear = q('[data-clear-file]');
  const quality = q('[data-quality]');
  const qualityOut = q('[data-quality-output]');
  const button = q('[data-convert]');
  const status = q('[data-status]');
  const progress = q('[data-progress]');
  const progressLabel = q('[data-progress-label]');
  const progressPercent = q('[data-progress-percent]');
  const progressTrack = q('[data-progress-track]');
  const progressBar = q('[data-progress-bar]');
  const progressDetail = q('[data-progress-detail]');
  const result = q('[data-result]');
  const resultSize = q('[data-result-size]');
  const preview = q('[data-preview]');
  const download = q('[data-download]');
  const another = q('[data-convert-another]');

  const MAX_BYTES = 25 * 1024 * 1024;
  const CONVERSION_TIMEOUT_MS = 10000;
  const PREVIEW_TIMEOUT_MS = 5000;
  let file = null;
  let resultUrl = null;
  let runId = 0;
  let busy = false;
  let started = 0;

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** index;
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  };
  const elapsed = () => `${((performance.now() - started) / 1000).toFixed(1)}s elapsed`;
  const withTimeout = (promise, ms, message) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
  const setProgress = (percent, label, detail = '') => {
    const value = Math.max(0, Math.min(100, percent));
    progress.hidden = false;
    progressLabel.textContent = label;
    progressPercent.textContent = `${value}%`;
    progressTrack.setAttribute('aria-valuenow', String(value));
    progressBar.style.width = `${value}%`;
    progressDetail.textContent = detail;
  };
  const hideProgress = () => {
    progress.hidden = true;
    progressBar.style.width = '0%';
    progressTrack.setAttribute('aria-valuenow', '0');
    progressDetail.textContent = '';
  };
  const revokeResult = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    preview.removeAttribute('src');
    download.removeAttribute('href');
    download.removeAttribute('download');
    result.removeAttribute('data-conversion-elapsed-ms');
    resultSize.textContent = '';
    result.hidden = true;
  };
  const setIdle = () => {
    busy = false;
    button.textContent = 'Convert to AVIF';
    button.disabled = !file;
  };
  const reset = () => {
    runId += 1;
    file = null;
    input.value = '';
    selected.hidden = true;
    revokeResult();
    hideProgress();
    status.textContent = 'Choose a file to begin.';
    setIdle();
  };
  const isPng = (candidate) => candidate.type === 'image/png' || /\.png$/i.test(candidate.name);
  const selectFile = (candidate) => {
    runId += 1;
    revokeResult();
    hideProgress();
    if (!candidate) return reset();
    if (!isPng(candidate)) {
      reset();
      status.textContent = 'Please choose a PNG image.';
      return;
    }
    if (candidate.size > MAX_BYTES) {
      reset();
      status.textContent = 'That file is larger than the 25 MB limit.';
      return;
    }
    file = candidate;
    name.textContent = candidate.name;
    size.textContent = formatBytes(candidate.size);
    selected.hidden = false;
    status.textContent = 'Ready to convert.';
    setIdle();
  };
  const loadImage = (url, errorMessage) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth && image.naturalHeight
      ? resolve(image)
      : reject(new Error('Image has invalid dimensions.'));
    image.onerror = () => reject(new Error(errorMessage));
    image.src = url;
  });
  const validateAvifHeader = async (blob) => {
    const bytes = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
    if (bytes.length < 12) throw new Error('Generated AVIF is too small.');
    const box = new TextDecoder('ascii').decode(bytes.subarray(4, 8));
    const header = new TextDecoder('ascii').decode(bytes.subarray(8));
    if (box !== 'ftyp' || !/(avif|avis)/.test(header)) {
      throw new Error('Generated AVIF signature is invalid.');
    }
  };

  input.addEventListener('change', () => selectFile(input.files?.[0]));
  clear.addEventListener('click', reset);
  another.addEventListener('click', reset);
  quality.addEventListener('input', () => { qualityOut.textContent = `${quality.value}%`; });
  ['dragenter', 'dragover'].forEach((eventName) => drop.addEventListener(eventName, (event) => {
    event.preventDefault();
    drop.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach((eventName) => drop.addEventListener(eventName, (event) => {
    event.preventDefault();
    drop.classList.remove('is-dragging');
  }));
  drop.addEventListener('drop', (event) => selectFile(event.dataTransfer?.files?.[0]));

  button.addEventListener('click', async () => {
    if (!file || busy) return;
    const activeRun = ++runId;
    const source = file;
    started = performance.now();
    busy = true;
    button.disabled = true;
    button.textContent = 'Converting…';
    revokeResult();

    try {
      const conversion = (async () => {
        setProgress(8, 'Reading PNG file', `${formatBytes(source.size)} source file`);
        status.textContent = 'Reading your PNG on this device…';
        const sourceUrl = URL.createObjectURL(source);
        let image;
        try {
          setProgress(22, 'Decoding PNG', elapsed());
          image = await loadImage(sourceUrl, 'PNG could not be decoded by this browser.');
        } finally {
          URL.revokeObjectURL(sourceUrl);
        }
        if (activeRun !== runId || source !== file) throw new Error('Conversion cancelled.');

        setProgress(38, 'Preparing image', `${image.naturalWidth} × ${image.naturalHeight} · ${elapsed()}`);
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas is unavailable in this browser.');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        setProgress(55, 'Loading AVIF encoder', elapsed());
        setProgress(68, 'Encoding AVIF', `${quality.value}% quality · ${elapsed()}`);
        const encoded = await encodeAvif(imageData, Number(quality.value));
        const blob = new Blob([encoded], { type: 'image/avif' });
        if (blob.type !== 'image/avif' || !blob.size) throw new Error('AVIF encoding failed.');

        setProgress(84, 'Validating AVIF', `${formatBytes(blob.size)} output · ${elapsed()}`);
        await validateAvifHeader(blob);
        const candidate = URL.createObjectURL(blob);
        let validated;
        try {
          validated = await withTimeout(
            loadImage(candidate, 'Generated AVIF could not be decoded by this browser.'),
            PREVIEW_TIMEOUT_MS,
            'AVIF preview timed out.'
          );
        } catch (error) {
          URL.revokeObjectURL(candidate);
          throw error;
        }
        if (validated.naturalWidth !== image.naturalWidth || validated.naturalHeight !== image.naturalHeight) {
          URL.revokeObjectURL(candidate);
          throw new Error('Generated AVIF dimensions do not match the PNG source.');
        }
        if (activeRun !== runId || source !== file) {
          URL.revokeObjectURL(candidate);
          throw new Error('Conversion cancelled.');
        }

        setProgress(96, 'Preparing download', `${validated.naturalWidth} × ${validated.naturalHeight} · ${elapsed()}`);
        resultUrl = candidate;
        const base = source.name.replace(/\.png$/i, '') || 'converted-image';
        preview.src = resultUrl;
        download.href = resultUrl;
        download.download = `${base}.avif`;
        resultSize.textContent = `${formatBytes(blob.size)} AVIF · ${validated.naturalWidth} × ${validated.naturalHeight}`;
        result.dataset.conversionElapsedMs = String(Math.round(performance.now() - started));
        result.hidden = false;
        setProgress(100, 'Complete', `${elapsed()} total`);
        status.textContent = 'Conversion complete.';
      })();
      await withTimeout(conversion, CONVERSION_TIMEOUT_MS, 'Conversion timed out.');
    } catch (error) {
      if (activeRun !== runId) return;
      revokeResult();
      console.error('PNG to AVIF conversion failed', error);
      const message = error?.message || 'Unknown conversion error';
      setProgress(100, 'Conversion stopped', `${message} · ${elapsed()}`);
      status.textContent = message === 'Conversion timed out.'
        ? 'Conversion took too long. This file could not be processed quickly enough on this device.'
        : `Conversion failed: ${message}`;
    } finally {
      if (activeRun === runId) setIdle();
    }
  });

  window.addEventListener('pagehide', () => {
    runId += 1;
    revokeResult();
  });
}
