(() => {
  const input = document.querySelector('[data-heic-file]');
  if (!input) return;

  const dropZone = document.querySelector('[data-drop-zone]');
  const selected = document.querySelector('[data-selected-file]');
  const fileName = document.querySelector('[data-file-name]');
  const fileSize = document.querySelector('[data-file-size]');
  const clearButton = document.querySelector('[data-clear-file]');
  const quality = document.querySelector('[data-quality]');
  const qualityOutput = document.querySelector('[data-quality-output]');
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
  const CONVERSION_TIMEOUT_MS = 45000;
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
  };

  const elapsed = () => `${((performance.now() - startedAt) / 1000).toFixed(1)}s elapsed`;

  const setIdleButton = () => {
    converting = false;
    convertButton.textContent = 'Convert to JPG';
    convertButton.disabled = !currentFile;
  };

  const revokeResult = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    preview.removeAttribute('src');
    download.removeAttribute('href');
    download.removeAttribute('download');
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

    if (!file) {
      reset();
      return;
    }

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
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);

  const waitForPreview = (url) => new Promise((resolve, reject) => {
    const testImage = new Image();
    testImage.onload = () => {
      if (testImage.naturalWidth > 0 && testImage.naturalHeight > 0) {
        resolve({ width: testImage.naturalWidth, height: testImage.naturalHeight });
      } else {
        reject(new Error('Converted image has invalid dimensions.'));
      }
    };
    testImage.onerror = () => reject(new Error('Converted JPG could not be decoded.'));
    testImage.src = url;
  });

  input.addEventListener('change', () => selectFile(input.files?.[0]));
  clearButton.addEventListener('click', reset);
  another.addEventListener('click', reset);

  quality.addEventListener('input', () => {
    qualityOutput.textContent = `${quality.value}%`;
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add('is-dragging');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove('is-dragging');
    });
  });

  dropZone.addEventListener('drop', (event) => {
    selectFile(event.dataTransfer?.files?.[0]);
  });

  convertButton.addEventListener('click', async () => {
    if (!currentFile || converting) return;

    startedAt = performance.now();
    const activeRun = ++runId;
    const sourceFile = currentFile;
    converting = true;
    convertButton.disabled = true;
    convertButton.textContent = 'Converting…';
    revokeResult();

    if (typeof window.heic2any !== 'function') {
      setProgress(5, 'Decoder unavailable', 'The HEIC decoder did not load.');
      status.textContent = 'The HEIC converter could not load. Refresh the page and try again.';
      setIdleButton();
      return;
    }

    try {
      setProgress(10, 'Decoder loaded', `${formatBytes(sourceFile.size)} source file`);
      status.textContent = 'Starting conversion on your device…';

      setProgress(25, 'Decoding HEIC', elapsed());
      const converted = await withTimeout(window.heic2any({
        blob: sourceFile,
        toType: 'image/jpeg',
        quality: Number(quality.value) / 100
      }), CONVERSION_TIMEOUT_MS, 'Conversion timed out.');

      if (activeRun !== runId || sourceFile !== currentFile) return;

      setProgress(65, 'Checking JPG output', elapsed());
      const jpgBlob = Array.isArray(converted) ? converted[0] : converted;
      if (!(jpgBlob instanceof Blob) || jpgBlob.size === 0) {
        throw new Error('No converted image returned.');
      }

      const type = (jpgBlob.type || '').toLowerCase();
      if (type && type !== 'image/jpeg' && type !== 'image/jpg') {
        throw new Error(`Unexpected output type: ${jpgBlob.type}`);
      }

      setProgress(80, 'Building preview', `${formatBytes(jpgBlob.size)} JPG · ${elapsed()}`);
      const candidateUrl = URL.createObjectURL(jpgBlob);
      let dimensions;
      try {
        dimensions = await withTimeout(waitForPreview(candidateUrl), 10000, 'Preview timed out.');
      } catch (error) {
        URL.revokeObjectURL(candidateUrl);
        throw error;
      }

      if (activeRun !== runId || sourceFile !== currentFile) {
        URL.revokeObjectURL(candidateUrl);
        return;
      }

      setProgress(95, 'Finalizing download', `${dimensions.width} × ${dimensions.height} · ${elapsed()}`);
      resultUrl = candidateUrl;
      const baseName = sourceFile.name.replace(/\.(heic|heif)$/i, '') || 'converted-image';
      preview.src = resultUrl;
      download.href = resultUrl;
      download.download = `${baseName}.jpg`;
      resultSize.textContent = `${formatBytes(jpgBlob.size)} JPG · ${dimensions.width} × ${dimensions.height}`;
      result.hidden = false;

      setProgress(100, 'Complete', `${elapsed()} total`);
      status.textContent = 'Conversion complete.';
    } catch (error) {
      if (activeRun !== runId) return;
      revokeResult();
      console.error('HEIC conversion failed', error);
      setProgress(100, 'Conversion stopped', `${error?.message || 'Unknown conversion error'} · ${elapsed()}`);
      status.textContent = error?.message === 'Conversion timed out.'
        ? 'Conversion took too long. Try again or use a smaller HEIC file.'
        : `Conversion failed: ${error?.message || 'Unknown error'}`;
    } finally {
      if (activeRun === runId) setIdleButton();
    }
  });

  window.addEventListener('pagehide', () => {
    runId += 1;
    revokeResult();
  });
})();
