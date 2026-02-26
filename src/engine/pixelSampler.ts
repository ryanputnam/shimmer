import type { PixelSample, RectLayer } from '../types';
import { rgbToHsl } from '../utils/colorUtils';

export const NUM_BINS = 24;

const WINDOW_COLS = 7;
const HALF_WIN = Math.floor(WINDOW_COLS / 2);

/**
 * sampleWindow — reads a 2D window of pixels along the scan direction.
 *
 * For horizontal: scanPos drives X, bins = rows (Y) — original behaviour.
 * For vertical:   scanPos drives Y, bins = cols (X) — image rotated 90°.
 * For diagonal:   scanPos drives X+Y together, bins sampled perpendicular.
 *
 * absX / absY are the current scanhead position in image coordinates.
 */
export function sampleWindow(
  pixelData: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  layer: RectLayer,
  absX: number,   // for horizontal/diagonal: current X in image pixels
  absY?: number,  // for vertical/diagonal: current Y in image pixels
): PixelSample {
  const dir = layer.scanDirection ?? 'horizontal';

  if (dir === 'vertical') {
    return sampleWindowVertical(pixelData, imageWidth, imageHeight, layer, absY ?? 0);
  } else if (dir === 'diagonal-down' || dir === 'diagonal-up') {
    return sampleWindowDiagonal(pixelData, imageWidth, imageHeight, layer, absX, absY ?? 0, dir);
  }
  return sampleWindowHorizontal(pixelData, imageWidth, imageHeight, layer, absX);
}

// ── Horizontal (original) ────────────────────────────────────────────────────
function sampleWindowHorizontal(
  pixelData: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  layer: RectLayer,
  absX: number,
): PixelSample {
  const { y: layerY, height: layerH } = layer;
  const rowsPerBin = Math.max(1, Math.floor(layerH / NUM_BINS));
  const spectrumBins = new Float32Array(NUM_BINS);
  const rowVariance  = new Float32Array(NUM_BINS);
  let totalR = 0, totalG = 0, totalB = 0, totalSamples = 0;
  let prevBinBrightness = -1, edgeCount = 0;

  for (let bin = 0; bin < NUM_BINS; bin++) {
    const invBin = NUM_BINS - 1 - bin;
    const rowStart = Math.floor(layerY + (invBin / NUM_BINS) * layerH);
    const brightnessSamples: number[] = [];
    let binR = 0, binG = 0, binB = 0;

    for (let col = -HALF_WIN; col <= HALF_WIN; col++) {
      const cx = Math.max(0, Math.min(imageWidth - 1, absX + col));
      const colT = (col + HALF_WIN) / (WINDOW_COLS - 1);
      const rWeight = Math.max(0, 1 - colT * 2);
      const bWeight = Math.max(0, colT * 2 - 1);
      const gWeight = 1 - Math.abs(colT - 0.5) * 2;

      for (let row = 0; row < rowsPerBin; row++) {
        const cy = Math.max(0, Math.min(imageHeight - 1, rowStart + row));
        const idx = (cy * imageWidth + cx) * 4;
        const r = pixelData[idx] ?? 0, g = pixelData[idx+1] ?? 0, b = pixelData[idx+2] ?? 0;
        const luma = 0.299*r + 0.587*g + 0.114*b;
        brightnessSamples.push(luma);
        binR += r*rWeight; binG += g*gWeight; binB += b*bWeight;
        totalR += r; totalG += g; totalB += b; totalSamples++;
      }
    }
    const n = brightnessSamples.length;
    const mean = brightnessSamples.reduce((a,b)=>a+b,0)/n;
    const variance = brightnessSamples.reduce((acc,v)=>acc+(v-mean)**2,0)/n;
    rowVariance[bin] = Math.min(Math.sqrt(variance)/80, 1);
    const colourWeight = (binR+binG+binB)/(n*WINDOW_COLS*255)+0.1;
    spectrumBins[bin] = Math.min((mean/255)*colourWeight*2.5, 1);
    if (prevBinBrightness >= 0 && Math.abs(mean-prevBinBrightness) > 25) edgeCount++;
    prevBinBrightness = mean;
  }
  return buildSample(totalR, totalG, totalB, totalSamples, edgeCount, spectrumBins, rowVariance);
}

// ── Vertical ─────────────────────────────────────────────────────────────────
// scanPos drives Y; bins = columns (X) — frequency = horizontal position in rect
function sampleWindowVertical(
  pixelData: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  layer: RectLayer,
  absY: number,
): PixelSample {
  const { x: layerX, width: layerW } = layer;
  const colsPerBin = Math.max(1, Math.floor(layerW / NUM_BINS));
  const spectrumBins = new Float32Array(NUM_BINS);
  const rowVariance  = new Float32Array(NUM_BINS);
  let totalR = 0, totalG = 0, totalB = 0, totalSamples = 0;
  let prevBinBrightness = -1, edgeCount = 0;

  for (let bin = 0; bin < NUM_BINS; bin++) {
    // bin 0 = left edge, bin 23 = right edge
    const colStart = Math.floor(layerX + (bin / NUM_BINS) * layerW);
    const brightnessSamples: number[] = [];
    let binR = 0, binG = 0, binB = 0;

    for (let row = -HALF_WIN; row <= HALF_WIN; row++) {
      const cy = Math.max(0, Math.min(imageHeight - 1, absY + row));
      const rowT = (row + HALF_WIN) / (WINDOW_COLS - 1);
      const rWeight = Math.max(0, 1 - rowT * 2);
      const bWeight = Math.max(0, rowT * 2 - 1);
      const gWeight = 1 - Math.abs(rowT - 0.5) * 2;

      for (let col = 0; col < colsPerBin; col++) {
        const cx = Math.max(0, Math.min(imageWidth - 1, colStart + col));
        const idx = (cy * imageWidth + cx) * 4;
        const r = pixelData[idx] ?? 0, g = pixelData[idx+1] ?? 0, b = pixelData[idx+2] ?? 0;
        const luma = 0.299*r + 0.587*g + 0.114*b;
        brightnessSamples.push(luma);
        binR += r*rWeight; binG += g*gWeight; binB += b*bWeight;
        totalR += r; totalG += g; totalB += b; totalSamples++;
      }
    }
    const n = brightnessSamples.length;
    const mean = brightnessSamples.reduce((a,b)=>a+b,0)/n;
    const variance = brightnessSamples.reduce((acc,v)=>acc+(v-mean)**2,0)/n;
    rowVariance[bin] = Math.min(Math.sqrt(variance)/80, 1);
    const colourWeight = (binR+binG+binB)/(n*WINDOW_COLS*255)+0.1;
    spectrumBins[bin] = Math.min((mean/255)*colourWeight*2.5, 1);
    if (prevBinBrightness >= 0 && Math.abs(mean-prevBinBrightness) > 25) edgeCount++;
    prevBinBrightness = mean;
  }
  return buildSample(totalR, totalG, totalB, totalSamples, edgeCount, spectrumBins, rowVariance);
}

// ── Diagonal ─────────────────────────────────────────────────────────────────
// scanPos drives X+Y simultaneously; bins sampled perpendicular to travel direction
function sampleWindowDiagonal(
  pixelData: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  layer: RectLayer,
  absX: number,
  absY: number,
  dir: 'diagonal-down' | 'diagonal-up',
): PixelSample {
  const spectrumBins = new Float32Array(NUM_BINS);
  const rowVariance  = new Float32Array(NUM_BINS);
  let totalR = 0, totalG = 0, totalB = 0, totalSamples = 0;
  let prevBinBrightness = -1, edgeCount = 0;

  // Perpendicular direction to the diagonal travel:
  // diagonal-down (→↓): travel=(1,1)/√2, perp=(1,-1)/√2
  // diagonal-up   (→↑): travel=(1,-1)/√2, perp=(1,1)/√2
  const perpX = 1, perpY = dir === 'diagonal-down' ? -1 : 1;
  const perpLen = Math.sqrt(perpX*perpX + perpY*perpY);
  const pxN = perpX/perpLen, pyN = perpY/perpLen;

  // Spread bins along the perpendicular axis
  const halfSpread = Math.min(layer.width, layer.height) * 0.4;
  const binStep = (halfSpread * 2) / (NUM_BINS - 1);

  for (let bin = 0; bin < NUM_BINS; bin++) {
    const t = -halfSpread + bin * binStep;
    const cx0 = Math.round(absX + t * pxN);
    const cy0 = Math.round(absY + t * pyN);
    const brightnessSamples: number[] = [];
    let binR = 0, binG = 0, binB = 0;

    for (let w = -HALF_WIN; w <= HALF_WIN; w++) {
      const cx = Math.max(0, Math.min(imageWidth-1,  cx0 + w));
      const cy = Math.max(0, Math.min(imageHeight-1, cy0 + w * (dir === 'diagonal-down' ? 1 : -1)));
      const colT = (w + HALF_WIN) / (WINDOW_COLS - 1);
      const rWeight = Math.max(0, 1 - colT * 2);
      const bWeight = Math.max(0, colT * 2 - 1);
      const gWeight = 1 - Math.abs(colT - 0.5) * 2;
      const idx = (cy * imageWidth + cx) * 4;
      const r = pixelData[idx] ?? 0, g = pixelData[idx+1] ?? 0, b = pixelData[idx+2] ?? 0;
      const luma = 0.299*r + 0.587*g + 0.114*b;
      brightnessSamples.push(luma);
      binR += r*rWeight; binG += g*gWeight; binB += b*bWeight;
      totalR += r; totalG += g; totalB += b; totalSamples++;
    }
    const n = brightnessSamples.length;
    const mean = brightnessSamples.reduce((a,b)=>a+b,0)/n;
    const variance = brightnessSamples.reduce((acc,v)=>acc+(v-mean)**2,0)/n;
    rowVariance[bin] = Math.min(Math.sqrt(variance)/80, 1);
    const colourWeight = (binR+binG+binB)/(n*WINDOW_COLS*255)+0.1;
    spectrumBins[bin] = Math.min((mean/255)*colourWeight*2.5, 1);
    if (prevBinBrightness >= 0 && Math.abs(mean-prevBinBrightness) > 25) edgeCount++;
    prevBinBrightness = mean;
  }
  return buildSample(totalR, totalG, totalB, totalSamples, edgeCount, spectrumBins, rowVariance);
}

// ── Shared result builder ─────────────────────────────────────────────────────
function buildSample(
  totalR: number, totalG: number, totalB: number, totalSamples: number,
  edgeCount: number, spectrumBins: Float32Array, rowVariance: Float32Array,
): PixelSample {
  const s = Math.max(totalSamples, 1);
  const avgR = totalR/s, avgG = totalG/s, avgB = totalB/s;
  const brightness = 0.299*avgR + 0.587*avgG + 0.114*avgB;
  const [hue, saturation] = rgbToHsl(avgR, avgG, avgB);
  const binArr = Array.from(spectrumBins);
  const globalMean = binArr.reduce((a,b)=>a+b,0)/NUM_BINS;
  const globalVar = binArr.reduce((acc,v)=>acc+(v-globalMean)**2,0)/NUM_BINS;
  const contrast = Math.min(Math.sqrt(globalVar)*4, 1);
  return {
    brightness, hue, saturation,
    edgeDensity: edgeCount/NUM_BINS,
    r: avgR, g: avgG, b: avgB,
    contrast, spectrumBins, rowVariance,
  };
}
