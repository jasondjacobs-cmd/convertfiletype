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

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
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
    status.textContent = 'Choose a file to begin.';
    setIdleButton();
  };

  const selectFile = (file) => {
    runId += 1;
    revokeResult();

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

  const withTimeout = (promise, timeoutMs) => Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('Conversion timed out.')), timeoutMs);
    })
  ]);

  const waitForPreview = (url) => new Promise((resolve, reject) => {
    const testImage = new Image();
    testImage.onload = () => {
      if (testImage.naturalWidth > 0 && testImage.naturalHeight > 0) resolve();
      else reject(new Error('Converted image has invalid dimensions.'));
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

    if (typeof window.heic2any !== 'function') {
      status.textContent = 'The HEIC converter could not load. Check your connection and try again.';
      return;
    }

    const activeRun = ++runId;
    const sourceFile = currentFile;
    converting = true;
    convertButton.disabled = true;
    convertButton.textContent = 'Converting…';
    status.textContent = 'Converting on your device…';
    revokeResult();

    try {
      const converted = await withTimeout(window.heic2any({
        blob: sourceFile,
        toType: 'image/jpeg',
        quality: Number(quality.value) / 100
      }), CONVERSION_TIMEOUT_MS);

      if (activeRun !== runId || sourceFile !== currentFile) return;

      const jpgBlob = Array.isArray(converted) ? converted[0] : converted;
      if (!(jpgBlob instanceof Blob) || jpgBlob.size === 0) {
        throw new Error('No converted image returned.');
      }

      const type = (jpgBlob.type || '').toLowerCase();
      if (type && type !== 'image/jpeg' && type !== 'image/jpg') {
        throw new Error(`Unexpected output type: ${jpgBlob.type}`);
      }

      const candidateUrl = URL.createObjectURL(jpgBlob);
      try {
        await withTimeout(waitForPreview(candidateUrl), 10000);
      } catch (error) {
        URL.revokeObjectURL(candidateUrl);
        throw error;
      }

      if (activeRun !== runId || sourceFile !== currentFile) {
        URL.revokeObjectURL(candidateUrl);
        return;
      }

      resultUrl = candidateUrl;
      const baseName = sourceFile.name.replace(/\.(heic|heif)$/i, '') || 'converted-image';
      preview.src = resultUrl;
      download.href = resultUrl;
      download.download = `${baseName}.jpg`;
      resultSize.textContent = `${formatBytes(jpgBlob.size)} JPG`;
      result.hidden = false;
      status.textContent = 'Conversion complete.';
    } catch (error) {
      if (activeRun !== runId) return;
      revokeResult();
      console.error('HEIC conversion failed', error);
      status.textContent = error?.message === 'Conversion timed out.'
        ? 'Conversion took too long. Try again or use a smaller HEIC file.'
        : 'We could not create a valid JPG from that file. Try a different HEIC or HEIF image.';
    } finally {
      if (activeRun === runId) setIdleButton();
    }
  });

  window.addEventListener('pagehide', () => {
    runId += 1;
    revokeResult();
  });
})();
