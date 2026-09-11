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
  let currentFile = null;
  let resultUrl = null;

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  };

  const revokeResult = () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    preview.removeAttribute('src');
    download.removeAttribute('href');
    result.hidden = true;
  };

  const isAcceptedFile = (file) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    return ACCEPTED_EXTENSIONS.includes(extension) || file.type === 'image/heic' || file.type === 'image/heif';
  };

  const reset = () => {
    currentFile = null;
    input.value = '';
    selected.hidden = true;
    convertButton.disabled = true;
    revokeResult();
    status.textContent = 'Choose a file to begin.';
  };

  const selectFile = (file) => {
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
    convertButton.disabled = false;
    status.textContent = 'Ready to convert.';
  };

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
    if (!currentFile || convertButton.disabled) return;

    if (typeof window.heic2any !== 'function') {
      status.textContent = 'The HEIC converter could not load. Check your connection and try again.';
      return;
    }

    convertButton.disabled = true;
    convertButton.textContent = 'Converting…';
    status.textContent = 'Converting on your device…';
    revokeResult();

    try {
      const converted = await window.heic2any({
        blob: currentFile,
        toType: 'image/jpeg',
        quality: Number(quality.value) / 100
      });

      const jpgBlob = Array.isArray(converted) ? converted[0] : converted;
      if (!(jpgBlob instanceof Blob)) throw new Error('No converted image returned.');

      resultUrl = URL.createObjectURL(jpgBlob);
      const baseName = currentFile.name.replace(/\.(heic|heif)$/i, '') || 'converted-image';

      preview.src = resultUrl;
      download.href = resultUrl;
      download.download = `${baseName}.jpg`;
      resultSize.textContent = `${formatBytes(jpgBlob.size)} JPG`;
      result.hidden = false;
      status.textContent = 'Conversion complete.';
    } catch (error) {
      console.error('HEIC conversion failed', error);
      status.textContent = 'We could not convert that file. Try a different HEIC or HEIF image.';
    } finally {
      convertButton.disabled = !currentFile;
      convertButton.textContent = 'Convert to JPG';
    }
  });

  window.addEventListener('pagehide', revokeResult);
})();
