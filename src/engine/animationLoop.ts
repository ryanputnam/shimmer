import type { AudioLayerNode } from './AudioLayerNode';
import { sampleWindow } from './pixelSampler';
import { drawOverlay } from '../canvas/drawOverlay';
import type { Scale, PixelSample } from '../types';
import type { ImageProfile, ModeParams } from './imageAnalyzer';

let store: any = null;
let overlayCtx: CanvasRenderingContext2D | null = null;
let audioNodeMap: Map<string, AudioLayerNode> = new Map();
let currentScale: Scale = { x: 1, y: 1 };
let currentOffset: { x: number; y: number } = { x: 0, y: 0 };
let rafId: number | null = null;
let lastTimestamp = 0;
let lastProfileId: string | null = null;

// Per-layer cache: last modeId pushed to that node
const layerModeCache = new Map<string, string | null>();
// Per-layer cache: last PixelSample for visualization
export const layerSampleCache = new Map<string, PixelSample>();
// Per-layer scan position in screen/image coords for drawOverlay
export const layerScanPos = new Map<string, { absX: number; absY: number }>();

export function setLoopDeps(
  storeRef: any,
  ctx: CanvasRenderingContext2D,
  nodeMap: Map<string, AudioLayerNode>,
) {
  store = storeRef;
  overlayCtx = ctx;
  audioNodeMap = nodeMap;
}

export function setLoopScale(scale: Scale, offset: { x: number; y: number }) {
  currentScale = scale;
  currentOffset = offset;
}

export function startLoop(): void {
  if (rafId !== null) return;
  lastTimestamp = performance.now();

  function tick(timestamp: number) {
    const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
    lastTimestamp = timestamp;

    if (!store || !overlayCtx) {
      rafId = requestAnimationFrame(tick);
      return;
    }

    const state = store.getState();
    const { layers, cachedPixelData, imageNaturalWidth, imageNaturalHeight, isPlaying, imageProfile,
            rootOverride, scaleOverride } = state;

    // Apply root/scale overrides to produce effective profile
    let effectiveProfile = imageProfile as ImageProfile | null;
    if (imageProfile && (rootOverride !== null || scaleOverride !== null)) {
      const SCALES: Record<string, number[]> = {
        major:      [1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8],
        minor:      [1, 9/8, 6/5, 4/3, 3/2, 8/5, 9/5],
        pentatonic: [1, 9/8, 5/4, 3/2, 5/3],
        wholetone:  [1, 9/8, 5/4, 45/32, 3/2, 27/16],
        chromatic:  [1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 9/5, 15/8],
      };
      const scale = scaleOverride ?? imageProfile.scale;
      const rootHz = rootOverride !== null
        ? imageProfile.rootHz * Math.pow(2, rootOverride / 12)
        : imageProfile.rootHz;
      effectiveProfile = {
        ...imageProfile,
        rootHz,
        scale,
        scaleRatios: SCALES[scale],
      };
    }

    // Push profile to all audio nodes when image changes or overrides change
    if (effectiveProfile) {
      const profileId = `${effectiveProfile.rootHz.toFixed(4)}-${effectiveProfile.scale}-${rootOverride}-${scaleOverride}`;
      if (profileId !== lastProfileId) {
        lastProfileId = profileId;
        audioNodeMap.forEach((node) => node.setImageProfile(effectiveProfile as ImageProfile));
        // Clear mode cache so params get re-pushed
        layerModeCache.clear();
        layerSampleCache.clear();
        layerScanPos.clear();
      }
    }

    if (isPlaying && cachedPixelData && layers.length > 0) {
      // Collect only scanX updates — a plain {id, scanX} map.
      // We MUST NOT spread full layer objects back into the store because
      // that would overwrite fields (e.g. paramOverrides) that may have been
      // updated by the user between when we read `layers` and when we write back.
      const scanUpdates = new Map<string, number>();

      layers.forEach((layer: any) => {
        const audioNode = audioNodeMap.get(layer.id);
        if (!audioNode) return;

        // Push ModeParams to node if mode or overrides changed
        const overridesKey = JSON.stringify(layer.paramOverrides ?? {});
        const cachedMode = layerModeCache.get(layer.id);
        const cacheKey = `${layer.generatedModeId}::${overridesKey}::${layer.pitchSemitones ?? 0}`;
        if (cacheKey !== cachedMode && effectiveProfile) {
          const mode = imageProfile!.generatedModes
            .find((m: { id: string }) => m.id === layer.generatedModeId);
          if (mode) {
            // Merge any per-layer overrides on top of the generated params
            const overrides = layer.paramOverrides ?? {};
            const pitchMult = layer.pitchSemitones
              ? Math.pow(2, layer.pitchSemitones / 12)
              : 1;
            const baseParams = effectiveProfile
              ? { ...mode.params, rootHz: effectiveProfile.rootHz * pitchMult, scaleRatios: effectiveProfile.scaleRatios }
              : { ...mode.params, rootHz: mode.params.rootHz * pitchMult } as ModeParams;
            const params: ModeParams = Object.keys(overrides).length > 0
              ? { ...baseParams, ...overrides }
              : baseParams;
            audioNode.setModeParams(params);
            audioNode.setPitchSemitones(layer.pitchSemitones ?? 0);
            layerModeCache.set(layer.id, cacheKey);
          }
        }

        const dir = layer.scanDirection ?? 'horizontal';
        const speed = layer.scanSpeed * delta;

        // Advance scanPos (0-1) based on direction
        // scanSpeed is in px/s — normalise by the relevant dimension
        let newScanPos: number;
        let absX: number, absY: number;

        if (dir === 'horizontal') {
          const newScanX = (layer.scanX + speed) % Math.max(layer.width, 1);
          newScanPos = newScanX / Math.max(layer.width, 1);
          absX = Math.floor(layer.x + newScanX);
          absY = Math.floor(layer.y + layer.height / 2);
          scanUpdates.set(layer.id, newScanX);
        } else if (dir === 'vertical') {
          newScanPos = ((layer.scanPos ?? 0) + speed / Math.max(layer.height, 1)) % 1;
          absX = Math.floor(layer.x + layer.width / 2);
          absY = Math.floor(layer.y + newScanPos * layer.height);
          scanUpdates.set(layer.id, layer.scanX); // scanX unchanged
        } else {
          // diagonal: advance along both axes simultaneously
          newScanPos = ((layer.scanPos ?? 0) + speed / Math.max(layer.width, layer.height, 1)) % 1;
          absX = Math.floor(layer.x + newScanPos * layer.width);
          absY = Math.floor(layer.y + (dir === 'diagonal-down'
            ? newScanPos * layer.height
            : (1 - newScanPos) * layer.height));
          scanUpdates.set(layer.id, layer.scanX);
        }

        const sample = sampleWindow(
          cachedPixelData,
          imageNaturalWidth,
          imageNaturalHeight,
          layer,
          absX,
          absY,
        );
        audioNode.updateFromPixel(sample, layer.volume, layer.muted, delta);
        layerSampleCache.set(layer.id, sample);
        layerScanPos.set(layer.id, { absX, absY });

        // Store scanPos for drawOverlay + next tick
        if (!scanUpdates.has(layer.id)) scanUpdates.set(layer.id, layer.scanX);
        (scanUpdates as any).set(`${layer.id}:pos`, newScanPos);
        (scanUpdates as any).set(`${layer.id}:absX`, absX);
        (scanUpdates as any).set(`${layer.id}:absY`, absY);
      });

      // Write back only scanX + scanPos — never overwrite other layer fields
      store.setState((state: any) => ({
        layers: state.layers.map((l: any) => {
          if (!scanUpdates.has(l.id)) return l;
          return {
            ...l,
            scanX: scanUpdates.get(l.id),
            scanPos: (scanUpdates as any).get(`${l.id}:pos`) ?? l.scanPos ?? 0,
          };
        }),
      }));
    }

    if (overlayCtx) {
      drawOverlay(
        overlayCtx,
        store.getState().layers,
        store.getState().selectedLayerId,
        currentScale,
        currentOffset,
        store.getState().drawingRect,
        layerSampleCache,
        layerScanPos,
      );
    }

    rafId = requestAnimationFrame(tick);
  }

  lastTimestamp = performance.now();
  rafId = requestAnimationFrame(tick);
}

export function stopLoop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}
