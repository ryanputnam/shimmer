export function drawImageToCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const displayW = canvas.clientWidth;
  const displayH = canvas.clientHeight;

  canvas.width = displayW * dpr;
  canvas.height = displayH * dpr;
  ctx.scale(dpr, dpr);

  // Draw image scaled to fit, centered
  const scale = Math.min(displayW / img.naturalWidth, displayH / img.naturalHeight);
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const offsetX = (displayW - drawW) / 2;
  const offsetY = (displayH - drawH) / 2;

  ctx.clearRect(0, 0, displayW, displayH);
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
}

export function computeImageScale(
  canvas: HTMLCanvasElement,
  imgW: number,
  imgH: number,
): { scale: number; offsetX: number; offsetY: number } {
  const displayW = canvas.clientWidth;
  const displayH = canvas.clientHeight;
  const scale = Math.min(displayW / imgW, displayH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const offsetX = (displayW - drawW) / 2;
  const offsetY = (displayH - drawH) / 2;
  return { scale, offsetX, offsetY };
}
