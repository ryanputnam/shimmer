import type { ImageProfile } from '../engine/imageAnalyzer';
import { snapToScale } from '../engine/imageAnalyzer';

const BASE_NOTE = 110; // A2
const PENTATONIC_RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];

export function brightnessToFrequency(brightness: number, profile?: ImageProfile): number {
  if (profile) {
    // Map brightness across 3 octaves of the image's own scale
    const normalized = brightness / 255;
    const octaveShift = Math.floor(normalized * 3);
    const posInOctave = (normalized * 3) % 1;
    const degreeCount = profile.scaleRatios.length;
    const degree = Math.floor(posInOctave * degreeCount);
    const ratio = profile.scaleRatios[Math.min(degree, degreeCount - 1)];
    return profile.rootHz * Math.pow(2, octaveShift) * ratio;
  }
  // Fallback: original pentatonic from A2
  const normalized = brightness / 255;
  const octave = Math.floor(normalized * 3);
  const degree = Math.floor((normalized * 3 % 1) * 5);
  return BASE_NOTE * Math.pow(2, octave) * PENTATONIC_RATIOS[degree];
}

export function binToFrequency(binIdx: number, numBins: number, profile?: ImageProfile): number {
  // Map bin index to frequency — low bins = bass, high bins = treble
  // Spans ~3 octaves of the image's scale
  const t = binIdx / numBins;
  const brightness = t * 255;
  return brightnessToFrequency(brightness, profile);
}

export function hueToFrequency(hue: number, profile?: ImageProfile): number {
  if (profile) {
    // Map hue to a note in the image's scale
    const t = hue / 360;
    const hz = profile.rootHz * Math.pow(2, t * 2); // up to 2 octaves
    return snapToScale(hz, profile);
  }
  const semitone = Math.floor((hue / 360) * 24);
  return BASE_NOTE * Math.pow(2, semitone / 12);
}

export function brightnessToPlaybackRate(brightness: number): number {
  return 0.5 + (brightness / 255) * 1.5;
}
