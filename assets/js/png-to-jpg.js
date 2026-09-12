(() => {
  const input = document.querySelector('[data-png-file]');
  if (!input) return;

  const dropZone = document.querySelector('[data-drop-zone]');
  const selected = document.querySelector('[data-selected-file]');
  const fileName = document.querySelector('[data-file-name]');
  const fileSize = document.querySelector('[data-file-size]');
  const clearButton = document.querySelector('[data-clear-file]');
  const quality = document.querySelector('[data-quality]');
  const qualityOutput = document.querySelector('[data-quality-output]');
  const background = document.querySelector('[data-background]');
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
  const CONVERSION_TIMEOUT_MS = 10000;
  const PREVIEW_TIMEOUT_MS = 5000;

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
    convertButton.textContent = 'Convert to JPG';
    convertButton.disabled = !currentFile;
  };

  const revokeResult = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    preview.removeAttribute('src');
    download.removeAttribute('href');
    download.removeAttribute('download');
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
    status.textContent = 'Choose a file to begin.';
    setIdleButton();
  };

  const isPng = (file) => file.type === 'image/png' || /\.png$/i.test(file.name);

  const selectFile = (file) => {
    runId += 1;
    revokeResult();
    hideProgress();

    if (!file) return reset();
    if (!isPng(file)) {
      reset();
      status.textContent = 'Please choose a PNG image.';
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

  const loadImage = (url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0
      ? resolve(image)
      : reject(new Error('PNG image has invalid dimensions.'));
    image.onerror = () => reject(new Error('PNG could not be decoded by this browser.'));
    image.src = url;
  });

  const canvasToJpeg = (canvas, jpegQuality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size === 0) return reject(new Error('JPG encoding failed.'));
      resolve(blob);
    }, 'image/jpeg', jpegQuality);
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
    if (!currentFile || converting) return;

    const activeRun = ++runId;
    const sourceFile = currentFile;
    startedAt = performance.now();
    converting = true;
    convertButton.disabled = true;
    convertButton.textContent = 'Converting…';
    revokeResult();

    try {
      const conversionPromise = (async () => {
        setProgress(10, 'Reading PNG file', `${formatBytes(sourceFile.size)} source file`);
        status.textContent = 'Reading your PNG on this device…';
        const sourceUrl = URL.createObjectURL(sourceFile);
        let image;
        try {
          setProgress(30, 'Decoding PNG', elapsed());
          image = await loadImage(sourceUrl);
        } finally {
          URL.revokeObjectURL(sourceUrl);
        }

        if (activeRun !== runId || sourceFile !== currentFile) throw new Error('Conversion cancelled.');

        setProgress(55, 'Preparing image', `${image.naturalWidth} × ${image.naturalHeight} · ${elapsed()}`);
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas is unavailable in this browser.');
        context.fillStyle = background.value === 'black' ? '#000000' : '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);

        setProgress(72, 'Encoding JPG', `${quality.value}% quality · ${elapsed()}`);
        const jpgBlob = await canvasToJpeg(canvas, Number(quality.value) / 100);
        const type = (jpgBlob.type || '').toLowerCase();
        if (type !== 'image/jpeg' && type !== 'image/jpg') throw new Error(`Unexpected output type: ${jpgBlob.type || 'unknown'}`);

        setProgress(88, 'Validating JPG', `${formatBytes(jpgBlob.size)} output · ${elapsed()}`);
        const candidateUrl = URL.createObjectURL(jpgBlob);
        let validated;
        try {
          validated = await withTimeout(loadImage(candidateUrl), PREVIEW_TIMEOUT_MS, 'Preview timed out.');
        } catch (error) {
          URL.revokeObjectURL(candidateUrl);
          throw error;
        }

        if (activeRun !== runId || sourceFile !== currentFile) {
          URL.revokeObjectURL(candidateUrl);
          throw new Error('Conversion cancelled.');
        }

        setProgress(96, 'Preparing download', `${validated.naturalWidth} × ${validated.naturalHeight} · ${elapsed()}`);
        resultUrl = candidateUrl;
        const baseName = sourceFile.name.replace(/\.png$/i, '') || 'converted-image';
        preview.src = resultUrl;
        download.href = resultUrl;
        download.download = `${baseName}.jpg`;
        resultSize.textContent = `${formatBytes(jpgBlob.size)} JPG · ${validated.naturalWidth} × ${validated.naturalHeight}`;
        result.hidden = false;
        setProgress(100, 'Complete', `${elapsed()} total`);
        status.textContent = 'Conversion complete.';
      })();

      await withTimeout(conversionPromise, CONVERSION_TIMEOUT_MS, 'Conversion timed out.');
    } catch (error) {
      if (activeRun !== runId) return;
      revokeResult();
      console.error('PNG conversion failed', error);
      const message = error?.message || 'Unknown conversion error';
      setProgress(100, 'Conversion stopped', `${message} · ${elapsed()}`);
      status.textContent = message === 'Conversion timed out.'
        ? 'Conversion took too long. This file could not be processed quickly enough on this device.'
        : `Conversion failed: ${message}`;
    } finally {
      if (activeRun === runId) setIdleButton();
    }
  });

  window.addEventListener('pagehide', () => {
    runId += 1;
    revokeResult();
  });
})();