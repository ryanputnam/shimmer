import { create } from 'zustand';
import type { RectLayer, DrawingRect, LayerEffects, SaveFile, SerializedLayer } from '../types';
import { defaultEffects } from '../types';
import { nextLayerColor } from '../utils/colorUtils';
import { analyzeImage } from '../engine/imageAnalyzer';
import type { ImageProfile, ScaleType } from '../engine/imageAnalyzer';

let layerCounter = 0;

interface SonimageState {
  imageDataUrl: string | null;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  cachedPixelData: Uint8ClampedArray | null;
  imageProfile: ImageProfile | null;
  rootOverride: number | null;   // semitone offset from image root (-12 to +12)
  scaleOverride: ScaleType | null;
  layers: RectLayer[];
  selectedLayerId: string | null;
  isPlaying: boolean;
  isRecording: boolean;
  masterVolume: number;
  drawingRect: DrawingRect | null;

  setImage: (dataUrl: string, width: number, height: number, pixelData: Uint8ClampedArray) => void;
  clearImage: () => void;
  addLayer: (rect: { x: number; y: number; width: number; height: number }) => RectLayer;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, patch: Partial<RectLayer>) => void;
  updateEffects: (id: string, patch: Partial<LayerEffects>) => void;
  selectLayer: (id: string | null) => void;
  toggleMute: (id: string) => void;
  setGeneratedMode: (layerId: string, modeId: string) => void;
  setParamOverride: (layerId: string, patch: Record<string, number>) => void;
  setRootOverride: (semitones: number | null) => void;
  setScaleOverride: (scale: ScaleType | null) => void;
  setDrawingRect: (rect: DrawingRect | null) => void;
  setPlaying: (playing: boolean) => void;
  setRecording: (recording: boolean) => void;
  setMasterVolume: (vol: number) => void;
  loadSaveFile: (save: SaveFile) => void;
}

export const useSonimageStore = create<SonimageState>((set, get) => ({
  imageDataUrl: null,
  imageNaturalWidth: 0,
  imageNaturalHeight: 0,
  cachedPixelData: null,
  imageProfile: null,
  rootOverride: null,
  scaleOverride: null,
  layers: [],
  selectedLayerId: null,
  isPlaying: false,
  isRecording: false,
  masterVolume: 0.8,
  drawingRect: null,

  setImage: (dataUrl, width, height, pixelData) => {
    const imageProfile = analyzeImage(pixelData, width, height);
    set({
      imageDataUrl: dataUrl,
      imageNaturalWidth: width,
      imageNaturalHeight: height,
      cachedPixelData: pixelData,
      imageProfile,
      layers: [],
      selectedLayerId: null,
    });
  },

  clearImage: () =>
    set({ imageDataUrl: null, imageNaturalWidth: 0, imageNaturalHeight: 0,
          cachedPixelData: null, imageProfile: null, layers: [],
          rootOverride: null, scaleOverride: null }),

  addLayer: (rect) => {
    layerCounter++;
    const { imageProfile } = get();
    const firstModeId = imageProfile?.generatedModes[0]?.id ?? null;
    const layer: RectLayer = {
      id: `layer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...rect,
      scanX: 0,
      scanPos: 0,
      scanSpeed: 60,
      scanDirection: 'horizontal',
      volume: 0.7,
      muted: false,
      generatedModeId: firstModeId,
      pixelMode: 'glide',
      soundSource: 'synth',
      oscillatorType: 'sine',
      sampleBuffer: null,
      color: nextLayerColor(),
      label: `Layer ${layerCounter}`,
      selected: false,
      effects: { ...defaultEffects },
      paramOverrides: {},
      pitchSemitones: 0,
    };
    set((state) => ({ layers: [...state.layers, layer], selectedLayerId: layer.id }));
    return layer;
  },

  removeLayer: (id) =>
    set((state) => ({
      layers: state.layers.filter((l) => l.id !== id),
      selectedLayerId: state.selectedLayerId === id ? null : state.selectedLayerId,
    })),

  updateLayer: (id, patch) =>
    set((state) => ({ layers: state.layers.map((l) => l.id === id ? { ...l, ...patch } : l) })),

  updateEffects: (id, patch) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, effects: { ...l.effects, ...patch } } : l
      ),
    })),

  selectLayer: (id) =>
    set((state) => ({
      layers: state.layers.map((l) => ({ ...l, selected: l.id === id })),
      selectedLayerId: id,
    })),

  toggleMute: (id) =>
    set((state) => ({ layers: state.layers.map((l) => l.id === id ? { ...l, muted: !l.muted } : l) })),

  setGeneratedMode: (layerId, modeId) =>
    set((state) => ({
      layers: state.layers.map((l) => l.id === layerId ? { ...l, generatedModeId: modeId } : l),
    })),

  setParamOverride: (layerId, patch) =>
    set((state) => ({
      layers: state.layers.map((l) => {
        if (l.id !== layerId) return l;
        // Empty patch = reset all overrides
        if (Object.keys(patch).length === 0) return { ...l, paramOverrides: {} };
        return { ...l, paramOverrides: { ...l.paramOverrides, ...patch } };
      }),
    })),

  setRootOverride: (semitones) => set({ rootOverride: semitones }),
  setScaleOverride: (scale) => set({ scaleOverride: scale }),

  setDrawingRect: (rect) => set({ drawingRect: rect }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setRecording: (recording) => set({ isRecording: recording }),
  setMasterVolume: (vol) => set({ masterVolume: vol }),

  loadSaveFile: (save: SaveFile) => {
    layerCounter = 0;
    const layers: RectLayer[] = save.layers.map((s: SerializedLayer) => ({
      ...s,
      sampleBuffer: null,
      selected: false,
      effects: { ...defaultEffects, ...s.effects },
      generatedModeId: s.generatedModeId ?? null,
      scanPos: (s as any).scanPos ?? 0,
      scanDirection: (s as any).scanDirection ?? 'horizontal',
      paramOverrides: (s as any).paramOverrides ?? {},
      pitchSemitones: (s as any).pitchSemitones ?? 0,
    }));
    layerCounter = layers.length;
    set({ imageDataUrl: save.imageDataUrl, layers, selectedLayerId: null,
          isPlaying: false, imageProfile: null });
  },
}));
