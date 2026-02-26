// Analyzes an image's pixel data to extract a sonic profile and
// generate a set of modes tuned specifically to this image.

export type ScaleType =
  | 'major' | 'minor' | 'pentatonic' | 'wholetone' | 'chromatic';

// ── Synthesis archetypes ──────────────────────────────────────────────────────
// Each archetype is a synthesis approach. The image analysis scores how well
// each archetype fits the image's character, then tunes its parameters.
export type ArchetypeId =
  | 'tonal'      // sustained spectral tones, smooth
  | 'rhythmic'   // edge-triggered percussive events
  | 'textural'   // noise/grain, high spatial frequency
  | 'sub'        // deep low-frequency rumble
  | 'spectral'   // full spectrogram read, all bins active
  | 'chromatic_noise'; // atonal, high-contrast chaos

export interface ModeParams {
  archetype: ArchetypeId;

  // Spectral shaping
  binWeightCurve: Float32Array;   // per-bin amplitude multiplier (24 values, 0–1)
  spectralSmoothing: number;      // slew rate for bin tracking (0.5 = glacial, 8 = fast)
  detuneSpread: number;           // cents of detune across bins (0–80)
  oscillatorType: OscillatorWeighting; // how to blend osc types

  // Temporal
  attackTime: number;             // seconds (0.001–0.5)
  releaseTime: number;            // seconds (0.01–2.0)
  triggerThreshold: number;       // edge density needed to trigger (rhythmic only, 0–1)
  grainDensity: number;           // grains/sec (textural only, 1–80)
  grainWidth: number;             // bins spread per grain (1–12)

  // Tonal / harmonic
  rootHz: number;
  scaleRatios: number[];
  harmonicRichness: number;       // 0 = fundamental only, 1 = full harmonic series weight

  // Spatial / color
  stereoWidth: number;            // 0 = mono, 1 = full L/R spread
  colorChannelBalance: [number, number, number]; // R/G/B mix weights

  // Output level (pre-normalisation)
  outputGain: number;             // 0.3–1.0
}

export interface OscillatorWeighting {
  sine: number; triangle: number; sawtooth: number; square: number;
}

export interface GeneratedMode {
  id: string;               // unique stable id
  name: string;             // display name derived from image character
  description: string;      // one-line description
  archetype: ArchetypeId;
  params: ModeParams;
  score: number;            // 0–1, how well this mode suits the image
}

export interface ImageProfile {
  rootHz: number;
  scale: ScaleType;
  scaleRatios: number[];
  warmth: number;
  saturation: number;
  brightness: number;
  contrast: number;
  detuneSpread: number;
  rhythmicDensity: number;
  // Spatial frequency bands (low/mid/high spatial freq energy, 0–1 each)
  spatialLow: number;
  spatialMid: number;
  spatialHigh: number;
  // Generated modes — 3 to 6, ordered by score descending
  generatedModes: GeneratedMode[];
}

const SCALES: Record<ScaleType, number[]> = {
  major:      [1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8],
  minor:      [1, 9/8, 6/5, 4/3, 3/2, 8/5, 9/5],
  pentatonic: [1, 9/8, 5/4, 3/2, 5/3],
  wholetone:  [1, 9/8, 5/4, 45/32, 3/2, 27/16],
  chromatic:  [1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 9/5, 15/8],
};

const ROOT_NOTES = [110, 116.54, 123.47, 130.81, 138.59, 146.83,
                    155.56, 164.81, 174.61, 185, 196, 207.65];

// ── Bin weight curve generators ───────────────────────────────────────────────

function makeUniformCurve(): Float32Array {
  return new Float32Array(24).fill(1);
}

function makeLowCurve(steepness = 2): Float32Array {
  const c = new Float32Array(24);
  for (let i = 0; i < 24; i++) c[i] = Math.pow(1 - i / 24, steepness);
  return c;
}

function makeHighCurve(steepness = 2): Float32Array {
  const c = new Float32Array(24);
  for (let i = 0; i < 24; i++) c[i] = Math.pow(i / 24, steepness);
  return c;
}

function makeBandCurve(centre: number, width: number): Float32Array {
  const c = new Float32Array(24);
  for (let i = 0; i < 24; i++) {
    const dist = Math.abs(i / 24 - centre);
    c[i] = Math.max(0, 1 - dist / width);
  }
  return c;
}

function makePeakedCurve(peaks: number[]): Float32Array {
  const c = new Float32Array(24).fill(0.1);
  for (const p of peaks) {
    const bin = Math.floor(p * 24);
    for (let i = 0; i < 24; i++) {
      const dist = Math.abs(i - bin);
      c[i] = Math.max(c[i], Math.exp(-dist * 0.5));
    }
  }
  return c;
}

// ── Archetype scoring ─────────────────────────────────────────────────────────

function scoreTonal(p: ImageProfile): number {
  // Prefers: low contrast, high brightness, low spatial high-freq
  return (1 - p.contrast) * 0.4 + (p.brightness / 255) * 0.3 + (1 - p.spatialHigh) * 0.3;
}

function scoreRhythmic(p: ImageProfile): number {
  // Prefers: high contrast, high spatial mid/high freq (edges)
  return p.contrast * 0.5 + p.spatialMid * 0.3 + p.rhythmicDensity * 0.2;
}

function scoreTextural(p: ImageProfile): number {
  // Prefers: high spatial high-freq, medium contrast
  return p.spatialHigh * 0.5 + p.contrast * 0.3 + (1 - Math.abs(p.saturation - 0.4)) * 0.2;
}

function scoreSub(p: ImageProfile): number {
  // Prefers: dark, low saturation, low warmth
  return (1 - p.brightness / 255) * 0.5 + (1 - p.warmth) * 0.3 + p.spatialLow * 0.2;
}

function scoreSpectral(p: ImageProfile): number {
  // Prefers: high saturation, varied spatial content
  const spatialVariety = 1 - Math.max(p.spatialLow, p.spatialMid, p.spatialHigh)
    + Math.min(p.spatialLow, p.spatialMid, p.spatialHigh);
  return p.saturation * 0.4 + spatialVariety * 0.4 + (p.brightness / 255) * 0.2;
}

function scoreChromaticNoise(p: ImageProfile): number {
  // Prefers: high contrast, low saturation, high spatial all-freq
  return p.contrast * 0.4 + (1 - p.saturation) * 0.3 + p.spatialHigh * 0.3;
}

// ── Mode name / description generators ───────────────────────────────────────

function nameForArchetype(archetype: ArchetypeId, profile: ImageProfile): [string, string] {
  const warm = profile.warmth > 0.6;
  const dark = profile.brightness < 100;
  const saturated = profile.saturation > 0.5;

  const names: Record<ArchetypeId, [string, string][]> = {
    tonal: [
      ['Sustain',  'Long smooth tones shaped by the image\'s gradients'],
      ['Flow',     'Continuous tones following the image\'s luminance curves'],
      ['Drift',    'Slowly evolving tones, blurred across the spectrum'],
    ],
    rhythmic: [
      ['Pulse',    'Edges trigger percussive hits at the image\'s own rhythm'],
      ['Strike',   'Hard edges become sharp percussive events'],
      ['Pattern',  'The image\'s structure drives rhythmic repetition'],
    ],
    textural: [
      ['Grain',    'Fine texture becomes dense granular clusters'],
      ['Dust',     'High-frequency detail scattered across the spectrum'],
      ['Scatter',  'Image texture randomises grain timing and pitch'],
    ],
    sub: [
      ['Deep',     'Dark regions generate low sub-bass rumble'],
      ['Ground',   'Image darkness anchors a deep sustained bass layer'],
      ['Weight',   'The image\'s mass expressed as sub-bass pressure'],
    ],
    spectral: [
      ['Shimmer',  'All frequency bands active — the full image as sound'],
      ['Chorus',   'Wide spectral spread, image colours in stereo'],
      ['Aura',     'The image\'s complete spectral fingerprint'],
    ],
    chromatic_noise: [
      ['Chaos',    'High contrast becomes atonal noise bursts'],
      ['Static',   'Image edges and transitions become chromatic noise'],
      ['Glitch',   'The image\'s harshest moments expressed as glitch'],
    ],
  };

  const pool = names[archetype];
  // Pick based on image character (warm/dark/saturated)
  const idx = (warm ? 1 : 0) + (dark ? 2 : 0) + (saturated ? 1 : 0);
  return pool[idx % pool.length];
}

// ── Parameter tuning per archetype ───────────────────────────────────────────

function tuneParams(archetype: ArchetypeId, profile: ImageProfile): ModeParams {
  const base: ModeParams = {
    archetype,
    binWeightCurve: makeUniformCurve(),
    spectralSmoothing: 3,
    detuneSpread: profile.detuneSpread * 30,
    oscillatorType: { sine: 1, triangle: 0, sawtooth: 0, square: 0 },
    attackTime: 0.05,
    releaseTime: 0.3,
    triggerThreshold: 0.2,
    grainDensity: 20,
    grainWidth: 3,
    rootHz: profile.rootHz,
    scaleRatios: profile.scaleRatios,
    harmonicRichness: 0.3,
    stereoWidth: 0.4,
    colorChannelBalance: [0.33, 0.34, 0.33],
    outputGain: 0.8,
  };

  switch (archetype) {
    case 'tonal': {
      // Smooth, sustained, biased by warmth
      base.binWeightCurve = profile.warmth > 0.5
        ? makeLowCurve(1.5 + (profile.warmth - 0.5) * 3)   // warm → low-biased
        : makeHighCurve(1.5 + (0.5 - profile.warmth) * 3); // cool → high-biased
      base.spectralSmoothing = 1.5 + (1 - profile.contrast) * 3; // smooth images = very slow
      base.detuneSpread = profile.detuneSpread * 20;
      base.attackTime = 0.1 + (1 - profile.contrast) * 0.3;
      base.releaseTime = 0.5 + (1 - profile.contrast) * 1.5;
      base.oscillatorType = { sine: 0.7, triangle: 0.3, sawtooth: 0, square: 0 };
      base.harmonicRichness = 0.2 + profile.saturation * 0.4;
      base.stereoWidth = 0.3 + profile.detuneSpread * 0.4;
      break;
    }
    case 'rhythmic': {
      // Sharp, edge-driven, contrast-shaped
      base.binWeightCurve = makeBandCurve(0.3 + profile.warmth * 0.3, 0.35);
      base.spectralSmoothing = 6 + profile.contrast * 4;
      base.attackTime = 0.001 + (1 - profile.contrast) * 0.02;
      base.releaseTime = 0.03 + (1 - profile.contrast) * 0.25;
      base.triggerThreshold = Math.max(0.1, 0.3 - profile.rhythmicDensity * 0.2);
      base.oscillatorType = {
        sine: 0.2,
        triangle: 0.2,
        sawtooth: 0.3 + profile.contrast * 0.3,
        square: 0.2 + profile.contrast * 0.1,
      };
      base.stereoWidth = 0.2 + profile.saturation * 0.5;
      base.outputGain = 0.7 + profile.contrast * 0.3;
      break;
    }
    case 'textural': {
      // Grain-based, texture-driven
      base.binWeightCurve = makeHighCurve(0.8);
      base.spectralSmoothing = 4 + profile.spatialHigh * 4;
      base.grainDensity = 10 + profile.spatialHigh * 60 + profile.contrast * 20;
      base.grainWidth = Math.max(1, Math.floor(2 + (1 - profile.spatialHigh) * 8));
      base.detuneSpread = 20 + profile.detuneSpread * 60;
      base.attackTime = 0.001;
      base.releaseTime = 0.02 + (1 - profile.spatialHigh) * 0.15;
      base.oscillatorType = {
        sine: 0.5 - profile.spatialHigh * 0.3,
        triangle: 0.2,
        sawtooth: 0.2 + profile.spatialHigh * 0.2,
        square: 0.1 + profile.spatialHigh * 0.1,
      };
      base.stereoWidth = 0.5 + profile.spatialHigh * 0.4;
      base.colorChannelBalance = [
        0.2 + profile.warmth * 0.4,
        0.33,
        0.2 + (1 - profile.warmth) * 0.4,
      ];
      break;
    }
    case 'sub': {
      // Deep, slow, low-biased
      const depth = (1 - profile.brightness / 255) * 0.5 + (1 - profile.warmth) * 0.3;
      const activeBins = Math.max(2, Math.floor(3 + depth * 8));
      base.binWeightCurve = makeLowCurve(3 + depth * 3);
      // Only activate lowest N bins
      for (let i = activeBins; i < 24; i++) base.binWeightCurve[i] = 0;
      base.spectralSmoothing = 0.8 + (1 - profile.contrast) * 2;
      base.detuneSpread = (profile.warmth - 0.5) * 20 + 5;
      base.attackTime = 0.2;
      base.releaseTime = 1.5;
      base.oscillatorType = { sine: 0.8, triangle: 0.2, sawtooth: 0, square: 0 };
      base.harmonicRichness = 0.1;
      base.stereoWidth = 0.1;
      base.outputGain = 0.9;
      break;
    }
    case 'spectral': {
      // Full spectrum read, all bins, color channels in stereo
      base.binWeightCurve = makeUniformCurve();
      base.spectralSmoothing = 2 + (1 - profile.saturation) * 3;
      base.detuneSpread = profile.detuneSpread * 25;
      base.attackTime = 0.04;
      base.releaseTime = 0.2;
      base.oscillatorType = {
        sine: 0.5,
        triangle: 0.2 + profile.warmth * 0.2,
        sawtooth: 0.1 + profile.saturation * 0.2,
        square: 0,
      };
      base.stereoWidth = 0.5 + profile.saturation * 0.4;
      base.colorChannelBalance = [
        0.2 + profile.warmth * 0.4,
        0.33,
        0.2 + (1 - profile.warmth) * 0.4,
      ];
      base.harmonicRichness = 0.3 + profile.saturation * 0.4;
      base.outputGain = 0.75;
      break;
    }
    case 'chromatic_noise': {
      // Atonal, chaotic, contrast-driven
      base.binWeightCurve = makePeakedCurve([0.1, 0.3, 0.5, 0.7, 0.9]);
      base.spectralSmoothing = 7 + profile.contrast * 5;
      base.detuneSpread = 40 + profile.contrast * 80;
      base.attackTime = 0.001;
      base.releaseTime = 0.02 + (1 - profile.contrast) * 0.1;
      base.triggerThreshold = Math.max(0.05, 0.25 - profile.contrast * 0.2);
      base.oscillatorType = {
        sine: 0.1,
        triangle: 0.1,
        sawtooth: 0.4 + profile.contrast * 0.3,
        square: 0.3 + profile.contrast * 0.1,
      };
      base.stereoWidth = 0.8;
      base.colorChannelBalance = [0.4, 0.3, 0.3];
      base.outputGain = 0.5 + profile.contrast * 0.3;
      break;
    }
  }
  return base;
}

// ── Spatial frequency estimation ─────────────────────────────────────────────
// Samples rows of the image to estimate low/mid/high spatial frequency energy
// by looking at differences between adjacent pixels at different spacings.
function estimateSpatialFreqs(
  pixelData: Uint8ClampedArray,
  width: number,
  height: number
): { low: number; mid: number; high: number } {
  const step = Math.max(1, Math.floor((width * height) / 2048));
  let diffClose = 0, diffMid = 0, diffFar = 0, n = 0;

  for (let i = 0; i < pixelData.length - 8 * 4; i += step * 4) {
    const luma = (px: number) =>
      0.299 * pixelData[px] + 0.587 * pixelData[px + 1] + 0.114 * pixelData[px + 2];
    const l0 = luma(i);
    const l1 = luma(i + 4);          // 1 pixel apart (high spatial freq)
    const l4 = luma(i + 4 * 4);      // 4 pixels apart (mid)
    const l8 = luma(Math.min(i + 8 * 4, pixelData.length - 4)); // 8 apart (low)
    diffClose += Math.abs(l0 - l1);
    diffMid   += Math.abs(l0 - l4);
    diffFar   += Math.abs(l0 - l8);
    n++;
  }

  const maxD = 255;
  return {
    high: Math.min(diffClose / n / maxD * 4, 1),
    mid:  Math.min(diffMid   / n / maxD * 3, 1),
    low:  Math.min(diffFar   / n / maxD * 2, 1),
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function analyzeImage(
  pixelData: Uint8ClampedArray,
  width: number,
  height: number
): ImageProfile {
  const step = Math.max(1, Math.floor((width * height) / 4096));
  let totalR = 0, totalG = 0, totalB = 0, count = 0;
  const brightnessValues: number[] = [];

  for (let i = 0; i < pixelData.length; i += step * 4) {
    const r = pixelData[i], g = pixelData[i + 1], b = pixelData[i + 2];
    totalR += r; totalG += g; totalB += b;
    brightnessValues.push(0.299 * r + 0.587 * g + 0.114 * b);
    count++;
  }

  const avgR = totalR / count;
  const avgG = totalG / count;
  const avgB = totalB / count;
  const avgBrightness = brightnessValues.reduce((a, b) => a + b, 0) / brightnessValues.length;
  const variance = brightnessValues.reduce((acc, v) => acc + (v - avgBrightness) ** 2, 0) / brightnessValues.length;
  const contrast = Math.min(Math.sqrt(variance) / 80, 1);
  const warmth = Math.max(0, Math.min(1, (avgR - avgB) / 128 * 0.5 + 0.5));
  const maxC = Math.max(avgR, avgG, avgB);
  const minC = Math.min(avgR, avgG, avgB);
  const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;

  let hue = 0;
  if (maxC - minC > 1) {
    if (maxC === avgR)      hue = ((avgG - avgB) / (maxC - minC) + 6) % 6;
    else if (maxC === avgG) hue = (avgB - avgR) / (maxC - minC) + 2;
    else                    hue = (avgR - avgG) / (maxC - minC) + 4;
    hue = hue / 6;
  }
  const rootIdx = Math.floor(hue * 12) % 12;
  const rootHz = ROOT_NOTES[rootIdx];

  let scale: ScaleType;
  if (saturation < 0.15) {
    scale = contrast > 0.6 ? 'chromatic' : 'wholetone';
  } else if (warmth > 0.6) {
    scale = contrast > 0.5 ? 'major' : 'pentatonic';
  } else if (warmth < 0.4) {
    scale = 'minor';
  } else {
    scale = 'pentatonic';
  }

  const spatial = estimateSpatialFreqs(pixelData, width, height);
  const detuneSpread = Math.min(saturation * 1.5, 1);
  const rhythmicDensity = contrast;

  const profile: ImageProfile = {
    rootHz,
    scale,
    scaleRatios: SCALES[scale],
    warmth,
    saturation,
    brightness: avgBrightness,
    contrast,
    detuneSpread,
    rhythmicDensity,
    spatialLow: spatial.low,
    spatialMid: spatial.mid,
    spatialHigh: spatial.high,
    generatedModes: [], // filled below
  };

  // ── Score all archetypes ──
  const scores: { archetype: ArchetypeId; score: number }[] = [
    { archetype: 'tonal',           score: scoreTonal(profile) },
    { archetype: 'rhythmic',        score: scoreRhythmic(profile) },
    { archetype: 'textural',        score: scoreTextural(profile) },
    { archetype: 'sub',             score: scoreSub(profile) },
    { archetype: 'spectral',        score: scoreSpectral(profile) },
    { archetype: 'chromatic_noise', score: scoreChromaticNoise(profile) },
  ];

  // Sort by score, take top 3–5 (min 3, max 5, threshold > 0.25)
  scores.sort((a, b) => b.score - a.score);
  const MIN_MODES = 3;
  const MAX_MODES = 5;
  const THRESHOLD = 0.25;

  const selected = scores.filter((s, i) => i < MIN_MODES || (i < MAX_MODES && s.score >= THRESHOLD));

  profile.generatedModes = selected.map(({ archetype, score }, idx) => {
    const [name, description] = nameForArchetype(archetype, profile);
    return {
      id: `${archetype}-${idx}`,
      name,
      description,
      archetype,
      params: tuneParams(archetype, profile),
      score,
    };
  });

  return profile;
}

export function snapToScale(hz: number, profile: ImageProfile): number {
  let note = hz;
  while (note < profile.rootHz) note *= 2;
  while (note > profile.rootHz * 4) note /= 2;
  const ratio = note / profile.rootHz;
  const octaveMult = Math.pow(2, Math.floor(Math.log2(ratio)));
  const inOctave = ratio / octaveMult;
  let best = profile.scaleRatios[0];
  let bestDist = Infinity;
  for (const r of profile.scaleRatios) {
    const dist = Math.abs(inOctave - r);
    if (dist < bestDist) { bestDist = dist; best = r; }
  }
  return profile.rootHz * octaveMult * best;
}
