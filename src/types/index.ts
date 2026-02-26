import type { GeneratedMode, ModeParams } from '../engine/imageAnalyzer';

export type { GeneratedMode, ModeParams };

// Legacy fixed mode kept for save-file compatibility and fallback
export type PixelMappingMode =
  | 'glide' | 'drift' | 'sub' | 'strike' | 'grain' | 'weave' | 'mangle';

export type SoundSource = 'synth' | 'sample';
export type ScanDirection = 'horizontal' | 'vertical' | 'diagonal-down' | 'diagonal-up';
export type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface PixelSample {
  brightness: number;
  hue: number;
  saturation: number;
  edgeDensity: number;
  r: number;
  g: number;
  b: number;
  contrast: number;
  spectrumBins: Float32Array;
  rowVariance: Float32Array;
}

export interface Scale {
  x: number;
  y: number;
}

export interface DrawingRect {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export interface LayerEffects {
  reverbEnabled: boolean;
  reverbMix: number;
  reverbDecay: number;
  delayEnabled: boolean;
  delayTime: number;
  delayFeedback: number;
  delayMix: number;
  distortionEnabled: boolean;
  distortionAmount: number;
  flangerEnabled: boolean;
  flangerRate: number;
  flangerDepth: number;
  flangerMix: number;
  chorusEnabled: boolean;
  chorusRate: number;
  chorusDepth: number;
  chorusMix: number;
  eqEnabled: boolean;
  eqLowGain: number;
  eqMidGain: number;
  eqHighGain: number;
  eqMidFreq: number;
}

export const defaultEffects: LayerEffects = {
  reverbEnabled: false, reverbMix: 0.3, reverbDecay: 2,
  delayEnabled: false, delayTime: 0.3, delayFeedback: 0.4, delayMix: 0.4,
  distortionEnabled: false, distortionAmount: 100,
  flangerEnabled: false, flangerRate: 0.5, flangerDepth: 0.004, flangerMix: 0.5,
  chorusEnabled: false, chorusRate: 1.5, chorusDepth: 0.008, chorusMix: 0.5,
  eqEnabled: false, eqLowGain: 0, eqMidGain: 0, eqHighGain: 0, eqMidFreq: 1000,
};

export interface RectLayer {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scanX: number;       // legacy pixel offset, still used for horizontal
  scanPos: number;      // 0-1 normalized scan position (all directions)
  scanSpeed: number;
  scanDirection: ScanDirection;
  volume: number;
  muted: boolean;
  // Generated mode: set when an image is loaded. null = no image yet (use legacy pixelMode).
  generatedModeId: string | null;
  // Legacy fixed mode kept for fallback when no image profile exists
  pixelMode: PixelMappingMode;
  soundSource: SoundSource;
  oscillatorType: OscillatorType;
  sampleBuffer: AudioBuffer | null;
  color: string;
  label: string;
  selected: boolean;
  effects: LayerEffects;
  paramOverrides: Record<string, number>;
  pitchSemitones: number;  // semitone offset applied on top of rootHz (−24 to +24)
}

export type ExportFormat = 'mp3' | 'ogg' | 'mp4';

export interface SerializedLayer {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scanX: number;       // legacy pixel offset, still used for horizontal
  scanPos: number;      // 0-1 normalized scan position (all directions)
  scanSpeed: number;
  scanDirection: ScanDirection;
  volume: number;
  muted: boolean;
  generatedModeId: string | null;
  pixelMode: PixelMappingMode;
  soundSource: SoundSource;
  oscillatorType: OscillatorType;
  color: string;
  label: string;
  effects: LayerEffects;
  paramOverrides: Record<string, number>;
  pitchSemitones: number;
}

export interface SaveFile {
  version: 1;
  imageDataUrl: string;
  layers: SerializedLayer[];
}
