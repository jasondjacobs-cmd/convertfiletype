(() => {
  const input = document.querySelector('[data-heic-file]');
  if (!input) return;

  const dropZone = document.querySelector('[data-drop-zone]');
  const selected = document.querySelector('[data-selected-file]');
  const fileName = document.querySelector('[data-file-name]');
  const fileSize = document.querySelector('[data-file-size]');
  const clearButton = document.querySelector('[data-clear-file]');
  const convertButton = document.querySelector('[data-convert]');
  const status = document.querySelector('[data-status]');
  const progress = document.querySelector('[data-progress]');
  const progressLabel = document.querySelector('[data-progress-label]');
  const progressPercent = document.querySelector('[data-progress-percent]');
  const progressTrack = document.querySelector('[data-progress-track]');
  const progressBar = document.querySelector('[data-progress-bar]');
  const progressDetail = document.querySelector('[data-progress-detail]');
  const result = document.querySelector('[data-result]');
  const resultSize = document.querySelector('[data-result-size]');
  const preview = document.querySelector('[data-preview]');
  const download = document.querySelector('[data-download]');
  const another = document.querySelector('[data-convert-another]');

  const MAX_BYTES = 25 * 1024 * 1024;
  const ACCEPTED_EXTENSIONS = ['heic', 'heif'];
  const DECODER_TIMEOUT_MS = 10000;
  const CONVERSION_TIMEOUT_MS = 15000;
  const PREVIEW_TIMEOUT_MS = 5000;
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

  let currentFile = null;
  let resultUrl = null;
  let runId = 0;
  let converting = false;
  let startedAt = 0;

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  };

  const elapsedMs = () => performance.now() - startedAt;
  const elapsed = () => `${(elapsedMs() / 1000).toFixed(1)}s elapsed`;

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
    convertButton.textContent = 'Convert to PNG';
    convertButton.disabled = !currentFile;
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

  const isAcceptedFile = (file) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    return ACCEPTED_EXTENSIONS.includes(extension) || file.type === 'image/heic' || file.type === 'image/heif';
  };

  const reset = () => {
    runId += 1;
    currentFile = null;
    input.value = '';
    selected.hidden = true;
    revokeResult();
    hideProgress();
    status.textContent = 'Choose a file to begin.';
    setIdleButton();
  };

  const selectFile = (file) => {
    runId += 1;
    revokeResult();
    hideProgress();

    if (!file) return reset();
    if (!isAcceptedFile(file)) {
      reset();
      status.textContent = 'Please choose an HEIC or HEIF image.';
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

  const renderHeifImage = (image) => new Promise((resolve, reject) => {
    const width = image.get_width();
    const height = image.get_height();
    if (!width || !height) return reject(new Error('HEIC image has invalid dimensions.'));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return reject(new Error('Canvas is unavailable in this browser.'));

    context.clearRect(0, 0, width, height);
    const imageData = context.createImageData(width, height);
    image.display(imageData, (displayData) => {
      if (!displayData) return reject(new Error('HEIC pixel decoding failed.'));
      context.putImageData(displayData, 0, 0);
      resolve({ canvas, width, height });
    });
  });

  const canvasToPng = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size === 0) return reject(new Error('PNG encoding failed.'));
      resolve(blob);
    }, 'image/png');
  });

  const validatePngSignature = async (blob) => {
    const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    if (bytes.length !== PNG_SIGNATURE.length || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
      throw new Error('Generated PNG signature is invalid.');
    }
  };

  const waitForPreview = (url) => new Promise((resolve, reject) => {
    const testImage = new Image();
    testImage.onload = () => testImage.naturalWidth > 0 && testImage.naturalHeight > 0
      ? resolve({ width: testImage.naturalWidth, height: testImage.naturalHeight })
      : reject(new Error('Converted image has invalid dimensions.'));
    testImage.onerror = () => reject(new Error('Converted PNG could not be decoded.'));
    testImage.src = url;
  });

  input.addEventListener('change', () => selectFile(input.files?.[0]));
  clearButton.addEventListener('click', reset);
  another.addEventListener('click', reset);

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
    if (!currentFile || converting) return;

    const activeRun = ++runId;
    const sourceFile = currentFile;
    startedAt = performance.now();
    converting = true;
    convertButton.disabled = true;
    convertButton.textContent = 'Converting…';
    revokeResult();

    let libheif;
    setProgress(2, 'Loading HEIC decoder', 'Starting local decoder…');
    status.textContent = 'Loading the HEIC decoder on this device…';
    try {
      const decoderReady = window.libheifReady || (window.libheif ? Promise.resolve(window.libheif) : null);
      if (!decoderReady) throw new Error('Decoder startup was not created.');
      libheif = await withTimeout(decoderReady, DECODER_TIMEOUT_MS, 'Decoder startup timed out.');
      if (!libheif || typeof libheif.HeifDecoder !== 'function') throw new Error('HEIC decoder did not initialize.');
      window.libheif = libheif;
    } catch (error) {
      const message = window.libheifLoadError || error?.message || 'libheif did not load.';
      revokeResult();
      setProgress(0, 'Decoder unavailable', message);
      status.textContent = 'The HEIC decoder could not load. Refresh the page and try again.';
      setIdleButton();
      return;
    }

    if (activeRun !== runId || sourceFile !== currentFile) return;
    let heifImage = null;

    try {
      const conversionPromise = (async () => {
        setProgress(10, 'Reading HEIC file', `${formatBytes(sourceFile.size)} source file`);
        status.textContent = 'Reading your HEIC file on this device…';
        const buffer = await sourceFile.arrayBuffer();
        if (activeRun !== runId || sourceFile !== currentFile) throw new Error('Conversion cancelled.');

        setProgress(25, 'Parsing HEIC container', elapsed());
        const decoder = new libheif.HeifDecoder();
        const images = decoder.decode(new Uint8Array(buffer));
        if (!images || images.length === 0) throw new Error('No image was found in this HEIC file.');
        heifImage = images[0];

        setProgress(45, 'Decoding HEIC pixels', elapsed());
        const rendered = await renderHeifImage(heifImage);
        if (activeRun !== runId || sourceFile !== currentFile) throw new Error('Conversion cancelled.');

        setProgress(70, 'Encoding PNG', `${rendered.width} × ${rendered.height} · ${elapsed()}`);
        const pngBlob = await canvasToPng(rendered.canvas);
        if ((pngBlob.type || '').toLowerCase() !== 'image/png') {
          throw new Error(`Unexpected output type: ${pngBlob.type || 'unknown'}`);
        }

        setProgress(86, 'Validating PNG', `${formatBytes(pngBlob.size)} output · ${elapsed()}`);
        await validatePngSignature(pngBlob);
        const candidateUrl = URL.createObjectURL(pngBlob);
        let dimensions;
        try {
          dimensions = await withTimeout(waitForPreview(candidateUrl), PREVIEW_TIMEOUT_MS, 'Preview timed out.');
        } catch (error) {
          URL.revokeObjectURL(candidateUrl);
          throw error;
        }

        if (dimensions.width !== rendered.width || dimensions.height !== rendered.height) {
          URL.revokeObjectURL(candidateUrl);
          throw new Error('Generated PNG dimensions do not match the HEIC source.');
        }
        if (activeRun !== runId || sourceFile !== currentFile) {
          URL.revokeObjectURL(candidateUrl);
          throw new Error('Conversion cancelled.');
        }

        setProgress(96, 'Preparing download', `${dimensions.width} × ${dimensions.height} · ${elapsed()}`);
        resultUrl = candidateUrl;
        const baseName = sourceFile.name.replace(/\.(heic|heif)$/i, '') || 'converted-image';
        preview.src = resultUrl;
        download.href = resultUrl;
        download.download = `${baseName}.png`;
        resultSize.textContent = `${formatBytes(pngBlob.size)} PNG · ${dimensions.width} × ${dimensions.height}`;
        result.dataset.conversionElapsedMs = String(Math.round(elapsedMs()));
        result.hidden = false;
        setProgress(100, 'Complete', `${elapsed()} total`);
        status.textContent = 'Conversion complete.';
      })();

      await withTimeout(conversionPromise, CONVERSION_TIMEOUT_MS, 'Conversion timed out.');
    } catch (error) {
      if (activeRun !== runId) return;
      revokeResult();
      console.error('HEIC to PNG conversion failed', error);
      const message = error?.message || 'Unknown conversion error';
      setProgress(100, 'Conversion stopped', `${message} · ${elapsed()}`);
      status.textContent = message === 'Conversion timed out.'
        ? 'Conversion took too long. This file could not be processed quickly enough on this device.'
        : `Conversion failed: ${message}`;
    } finally {
      if (heifImage && typeof heifImage.free === 'function') {
        try { heifImage.free(); } catch (_) {}
      }
      if (activeRun === runId) setIdleButton();
    }
  });

  window.addEventListener('pagehide', () => {
    runId += 1;
    revokeResult();
  });
})();
