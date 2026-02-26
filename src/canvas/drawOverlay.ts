import type { RectLayer, Scale, DrawingRect, PixelSample } from '../types';

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  layers: RectLayer[],
  selectedLayerId: string | null,
  scale: Scale,
  offset: { x: number; y: number },
  drawingRect: DrawingRect | null,
  layerSampleCache?: Map<string, PixelSample>,
  layerScanPos?: Map<string, { absX: number; absY: number }>,
): void {
  const dpr = window.devicePixelRatio;
  const w = ctx.canvas.width / dpr;
  const h = ctx.canvas.height / dpr;
  ctx.clearRect(0, 0, w, h);

  for (const layer of layers) {
    const sx = offset.x + layer.x * scale.x;
    const sy = offset.y + layer.y * scale.y;
    const sw = layer.width  * scale.x;
    const sh = layer.height * scale.y;
    const isSelected = layer.id === selectedLayerId;
    const sample = layerSampleCache?.get(layer.id) ?? null;
    const scanPos = layerScanPos?.get(layer.id);
    const dir = layer.scanDirection ?? 'horizontal';

    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, sw, sh);
    ctx.clip();

    // Background dim
    if (!layer.muted) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(sx, sy, sw, sh);
    }

    // ── Scanline — drawn differently per direction ────────────────────────
    if (!layer.muted && scanPos) {
      const bright = sample ? sample.brightness / 255 : 0.5;
      const glowStr = 6 + bright * 10;
      ctx.strokeStyle = layer.color + 'dd';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = layer.color;
      ctx.shadowBlur = glowStr;
      ctx.beginPath();

      // Convert image-space scanPos coords to screen space
      const screenX = offset.x + scanPos.absX * scale.x;
      const screenY = offset.y + scanPos.absY * scale.y;

      if (dir === 'horizontal') {
        // Vertical line at scanX
        const lineX = offset.x + scanPos.absX * scale.x;
        ctx.moveTo(lineX, sy);
        ctx.lineTo(lineX, sy + sh);
      } else if (dir === 'vertical') {
        // Horizontal line at scanY
        const lineY = offset.y + scanPos.absY * scale.y;
        ctx.moveTo(sx, lineY);
        ctx.lineTo(sx + sw, lineY);
      } else if (dir === 'diagonal-down') {
        // Line perpendicular to ↘ direction (i.e. ↗ direction)
        const len = Math.max(sw, sh);
        ctx.moveTo(screenX - len, screenY + len);
        ctx.lineTo(screenX + len, screenY - len);
      } else {
        // diagonal-up: perpendicular to ↗ = ↘
        const len = Math.max(sw, sh);
        ctx.moveTo(screenX - len, screenY - len);
        ctx.lineTo(screenX + len, screenY + len);
      }

      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    // Rectangle border
    ctx.save();
    if (!layer.muted) {
      ctx.shadowColor = layer.color;
      ctx.shadowBlur = isSelected ? 12 : 6;
    }
    ctx.strokeStyle = isSelected ? '#ffffff' : layer.color;
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.shadowBlur = 0;

    if (layer.muted) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = layer.color + '55';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
    }

    // Label + direction indicator
    ctx.fillStyle = layer.color;
    ctx.font = '10px system-ui';
    ctx.fillText(layer.label, sx + 4, sy - 4);

    ctx.restore();
  }

  // In-progress rectangle while drawing
  if (drawingRect) {
    const rx = offset.x + Math.min(drawingRect.startX, drawingRect.currentX) * scale.x;
    const ry = offset.y + Math.min(drawingRect.startY, drawingRect.currentY) * scale.y;
    const rw = Math.abs(drawingRect.currentX - drawingRect.startX) * scale.x;
    const rh = Math.abs(drawingRect.currentY - drawingRect.startY) * scale.y;
    ctx.save();
    ctx.strokeStyle = '#ffffff88';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);
    ctx.restore();
  }
}
