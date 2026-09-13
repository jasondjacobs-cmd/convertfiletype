(() => {
  const input = document.querySelector('[data-avif-file]');
  if (!input) return;
  const q = (s) => document.querySelector(s);
  const dropZone = q('[data-drop-zone]');
  const selected = q('[data-selected-file]');
  const fileName = q('[data-file-name]');
  const fileSize = q('[data-file-size]');
  const clearButton = q('[data-clear-file]');
  const quality = q('[data-quality]');
  const qualityOutput = q('[data-quality-output]');
  const convertButton = q('[data-convert]');
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
  const AVIF_PROBE = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADrbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAETAAAAKgAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAAAQAAAAEAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAAMm1kYXQSAAoIGAAGiAhoNCAyHBPHh4ZlAYYYfhAAAABIWRQ/+8Ry1kOMr5I0fuA=';

  let currentFile = null;
  let resultUrl = null;
  let runId = 0;
  let converting = false;
  let startedAt = 0;
  let avifSupported = null;

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  };
  const elapsed = () => `${((performance.now() - startedAt) / 1000).toFixed(1)}s elapsed`;
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
  const setIdleButton = () => {
    converting = false;
    convertButton.textContent = 'Convert to WebP';
    convertButton.disabled = !currentFile || avifSupported === false;
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
  const reset = () => {
    runId += 1;
    currentFile = null;
    input.value = '';
    selected.hidden = true;
    revokeResult();
    hideProgress();
    status.textContent = avifSupported === false
      ? 'This browser cannot decode AVIF images. Try a current version of Chrome, Edge, Firefox, or Safari.'
      : 'Choose a file to begin.';
    setIdleButton();
  };
  const isAvif = (file) => file.type === 'image/avif' || /\.avif$/i.test(file.name);
  const selectFile = (file) => {
    runId += 1;
    revokeResult();
    hideProgress();
    if (!file) return reset();
    if (avifSupported === false) return reset();
    if (!isAvif(file)) {
      reset();
      status.textContent = 'Please choose an AVIF image.';
      return;
    }
    if (file.size > MAX_BYTES) {
      reset();
      status.textContent = 'That file is larger than the 25 MB limit.';
      return;
    }
    currentFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);
    selected.hidden = false;
    status.textContent = 'Ready to convert.';
    setIdleButton();
  };
  const withTimeout = (promise, timeoutMs, message) => Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(message)), timeoutMs))
  ]);
  const loadImage = (url, decodeError = 'Image could not be decoded by this browser.') => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0
      ? resolve(image)
      : reject(new Error('Image has invalid dimensions.'));
    image.onerror = () => reject(new Error(decodeError));
    image.src = url;
  });
  const detectAvifSupport = async () => {
    try {
      const image = await withTimeout(loadImage(AVIF_PROBE), 3000, 'AVIF support check timed out.');
      return image.naturalWidth === 1 && image.naturalHeight === 1;
    } catch { return false; }
  };
  const canvasToWebp = (canvas, webpQuality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size === 0) return reject(new Error('WebP encoding failed.'));
      resolve(blob);
    }, 'image/webp', webpQuality);
  });

  input.addEventListener('change', () => selectFile(input.files?.[0]));
  clearButton.addEventListener('click', reset);
  another.addEventListener('click', reset);
  quality.addEventListener('input', () => { qualityOutput.textContent = `${quality.value}%`; });
  ['dragenter', 'dragover'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragging');
  }));
  dropZone.addEventListener('drop', (event) => selectFile(event.dataTransfer?.files?.[0]));

  convertButton.addEventListener('click', async () => {
    if (!currentFile || converting || avifSupported === false) return;
    const activeRun = ++runId;
    const sourceFile = currentFile;
    startedAt = performance.now();
    converting = true;
    convertButton.disabled = true;
    convertButton.textContent = 'Converting…';
    revokeResult();
    try {
      const conversionPromise = (async () => {
        setProgress(10, 'Reading AVIF file', `${formatBytes(sourceFile.size)} source file`);
        status.textContent = 'Reading your AVIF on this device…';
        const sourceUrl = URL.createObjectURL(sourceFile);
        let image;
        try {
          setProgress(30, 'Decoding AVIF', elapsed());
          image = await loadImage(sourceUrl, 'This browser could not decode the selected AVIF image.');
        } finally {
          URL.revokeObjectURL(sourceUrl);
        }
        if (activeRun !== runId || sourceFile !== currentFile) throw new Error('Conversion cancelled.');
        setProgress(55, 'Preparing image', `${image.naturalWidth} × ${image.naturalHeight} · ${elapsed()}`);
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { alpha: true });
        if (!context) throw new Error('Canvas is unavailable in this browser.');
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        setProgress(72, 'Encoding WebP', `${quality.value}% quality · ${elapsed()}`);
        const webpBlob = await canvasToWebp(canvas, Number(quality.value) / 100);
        if ((webpBlob.type || '').toLowerCase() !== 'image/webp') throw new Error(`Unexpected output type: ${webpBlob.type || 'unknown'}`);
        setProgress(88, 'Validating WebP', `${formatBytes(webpBlob.size)} output · ${elapsed()}`);
        const signature = new TextDecoder('latin1').decode(new Uint8Array(await webpBlob.slice(0, 12).arrayBuffer()));
        if (!signature.startsWith('RIFF') || signature.slice(8, 12) !== 'WEBP') throw new Error('Generated WebP signature is invalid.');
        const candidateUrl = URL.createObjectURL(webpBlob);
        let validated;
        try {
          validated = await withTimeout(loadImage(candidateUrl, 'Generated WebP could not be decoded by this browser.'), PREVIEW_TIMEOUT_MS, 'Preview timed out.');
        } catch (error) {
          URL.revokeObjectURL(candidateUrl);
          throw error;
        }
        if (activeRun !== runId || sourceFile !== currentFile) {
          URL.revokeObjectURL(candidateUrl);
          throw new Error('Conversion cancelled.');
        }
        if (validated.naturalWidth !== image.naturalWidth || validated.naturalHeight !== image.naturalHeight) {
          URL.revokeObjectURL(candidateUrl);
          throw new Error('Generated WebP dimensions do not match the AVIF source.');
        }
        setProgress(96, 'Preparing download', `${validated.naturalWidth} × ${validated.naturalHeight} · ${elapsed()}`);
        resultUrl = candidateUrl;
        const baseName = sourceFile.name.replace(/\.avif$/i, '') || 'converted-image';
        preview.src = resultUrl;
        download.href = resultUrl;
        download.download = `${baseName}.webp`;
        resultSize.textContent = `${formatBytes(webpBlob.size)} WebP · ${validated.naturalWidth} × ${validated.naturalHeight}`;
        result.dataset.conversionElapsedMs = String(Math.round(performance.now() - startedAt));
        result.hidden = false;
        setProgress(100, 'Complete', `${elapsed()} total`);
        status.textContent = 'Conversion complete.';
      })();
      await withTimeout(conversionPromise, CONVERSION_TIMEOUT_MS, 'Conversion timed out.');
    } catch (error) {
      if (activeRun !== runId) return;
      revokeResult();
      console.error('AVIF to WebP conversion failed', error);
      const message = error?.message || 'Unknown conversion error';
      setProgress(100, 'Conversion stopped', `${message} · ${elapsed()}`);
      status.textContent = message === 'Conversion timed out.'
        ? 'Conversion took too long. This file could not be processed quickly enough on this device.'
        : `Conversion failed: ${message}`;
    } finally {
      if (activeRun === runId) setIdleButton();
    }
  });

  detectAvifSupport().then((supported) => {
    avifSupported = supported;
    status.textContent = supported
      ? 'Choose a file to begin.'
      : 'This browser cannot decode AVIF images. Try a current version of Chrome, Edge, Firefox, or Safari.';
    setIdleButton();
  });

  window.addEventListener('pagehide', () => {
    runId += 1;
    revokeResult();
  });
})();
