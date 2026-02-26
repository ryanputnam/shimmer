import { useEffect, useRef } from 'react';
import { layerSampleCache } from '../../engine/animationLoop';

const NUM_BINS = 24;

// Archetype accent colors as [r, g, b]
const ARCHETYPE_RGB: Record<string, [number, number, number]> = {
  tonal:           [110, 156, 245],
  rhythmic:        [245, 180,  80],
  textural:        [160, 120, 245],
  sub:             [ 80, 200, 160],
  spectral:        [245, 110, 160],
  chromatic_noise: [245,  80,  80],
};

interface SpectrumCanvasProps {
  layerId: string;
  archetype: string;
  color: string;      // layer accent color (hex)
  height?: number;
}

export function SpectrumCanvas({ layerId, archetype, height = 44 }: SpectrumCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  // Smoothed display bins — decay independently for a nicer look
  const displayBins = useRef(new Float32Array(NUM_BINS));
  const displayVariance = useRef(new Float32Array(NUM_BINS));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rgb = ARCHETYPE_RGB[archetype] ?? [110, 156, 245];

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      if (!canvas || !ctx) return;

      const dpr = window.devicePixelRatio ?? 1;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;

      // Resize canvas backing store if needed
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.scale(dpr, dpr);
      }

      ctx.clearRect(0, 0, W, H);

      const sample = layerSampleCache.get(layerId);

      // Smooth bins toward live values (fast attack, slow decay)
      const db = displayBins.current;
      const dv = displayVariance.current;
      for (let i = 0; i < NUM_BINS; i++) {
        const live = sample?.spectrumBins[i] ?? 0;
        const liveVar = sample?.rowVariance?.[i] ?? 0;
        db[i] = live > db[i] ? live * 0.6 + db[i] * 0.4 : db[i] * 0.88; // fast up, slow down
        dv[i] = liveVar > dv[i] ? liveVar * 0.5 + dv[i] * 0.5 : dv[i] * 0.92;
      }

      const barW = W / NUM_BINS;
      const STRIP_H = 4; // variance strip height at top
      const BAR_AREA_H = H - STRIP_H - 2;

      // ── Variance heatmap strip (top) ──────────────────────────────────
      for (let i = 0; i < NUM_BINS; i++) {
        const v = dv[i];
        if (v < 0.015) continue;
        const alpha = v * 0.9;
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(2)})`;
        ctx.fillRect(i * barW, 0, barW - 0.5, STRIP_H);
      }

      // ── Spectrum bars (bottom section) ───────────────────────────────
      for (let i = 0; i < NUM_BINS; i++) {
        const amp = Math.min(db[i], 1);
        if (amp < 0.005) continue;

        const barH = amp * BAR_AREA_H;
        const bx = i * barW;
        const by = H - barH;

        // Gradient: brighter top, archetype color bottom
        const grad = ctx.createLinearGradient(0, by, 0, H);
        grad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.9)`);
        grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.25)`);
        ctx.fillStyle = grad;
        ctx.fillRect(bx, by + STRIP_H + 2, barW - 0.5, barH);

        // Peak dot
        ctx.fillStyle = `rgba(255,255,255,${(amp * 0.7).toFixed(2)})`;
        ctx.fillRect(bx, by + STRIP_H + 2, barW - 0.5, 1);
      }
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [layerId, archetype]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height,
        display: 'block',
        borderRadius: 4,
        background: 'var(--bg-1)',
      }}
    />
  );
}
