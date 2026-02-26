import type { LayerEffects, OscillatorType, PixelSample } from '../types';
import { GranularEngine } from './GranularEngine';
import type { GranularParams } from './GranularEngine';
import type { ImageProfile, ModeParams, ArchetypeId } from './imageAnalyzer';
import { binToFrequency } from '../utils/frequencyUtils';
import { EffectsChain } from './EffectsChain';

const NUM_BINS = 24;
const BIN_CEIL = 1.0 / NUM_BINS;

function slew(current: number, target: number, maxRate: number, dt: number): number {
  const delta = target - current;
  const maxDelta = maxRate * dt;
  return Math.abs(delta) < maxDelta ? target : current + Math.sign(delta) * maxDelta;
}

function slewBins(current: Float32Array, target: Float32Array, rate: number, dt: number): void {
  const maxDelta = rate * dt;
  for (let i = 0; i < current.length; i++) {
    const delta = target[i] - current[i];
    current[i] += Math.sign(delta) * Math.min(Math.abs(delta), maxDelta);
  }
}

function dominantOscType(w: ModeParams['oscillatorType']): OscillatorType {
  const entries = Object.entries(w) as [OscillatorType, number][];
  return entries.reduce((a, b) => b[1] > a[1] ? b : a)[0];
}

export class AudioLayerNode {
  private context: AudioContext;
  private masterGain: GainNode;
  private limiter: DynamicsCompressorNode;
  private effects: EffectsChain;
  private _connected = true;
  private lastDt = 0.016;
  private currentParams: ModeParams | null = null;

  private specOscs: OscillatorNode[] = [];
  private specGains: GainNode[] = [];
  private specMix: GainNode;
  private smoothedBins = new Float32Array(NUM_BINS);
  private lastBinFreqs = new Float32Array(NUM_BINS);

  // Sample playback
  private sampleSource: AudioBufferSourceNode | null = null;
  private sampleGain: GainNode;        // master sample level (set by volume)
  private sampleModeGain: GainNode;    // modulated by the active archetype
  private sampleFilter: BiquadFilterNode; // for sub/spectral tilt
  private sampleModeLevel = 0;         // smoothed amplitude for sample mode drive
  private granular: GranularEngine | null = null;  // active when textural/chromatic_noise + sample loaded
  private sampleBuffer: AudioBuffer | null = null; // stored for granular re-init on mode switch
  private granularScanPos = 0;           // 0-1 position through buffer driven by scan
  private pitchSemitones = 0;             // per-layer semitone offset for granular path

  // Per-mode state
  private lastTriggerTime = 0;
  private grainTimer = 0;
  private strikeEnvelope = new Float32Array(NUM_BINS);

  // Mangle/ring-mod path (for chromatic_noise)
  private specMixGate: GainNode;
  private mangleSend: GainNode;
  private sampleMangleSend: GainNode;  // sample tap into mangle path
  private mangleRingGain: GainNode;
  private mangleShaper: WaveShaperNode;
  private mangleReturn: GainNode;
  private mangleRingOsc: OscillatorNode;
  private mangleRingFreq = 30;

  private weavePanners: StereoPannerNode[] = [];

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context;
    const now = context.currentTime;

    // Limiter → effects → destination
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.setValueAtTime(-3, now);
    this.limiter.knee.setValueAtTime(3, now);
    this.limiter.ratio.setValueAtTime(20, now);
    this.limiter.attack.setValueAtTime(0.001, now);
    this.limiter.release.setValueAtTime(0.1, now);
    this.effects = new EffectsChain(context);
    this.limiter.connect(this.effects.input);
    this.effects.output.connect(destination);

    // masterGain → limiter
    this.masterGain = context.createGain();
    this.masterGain.gain.setValueAtTime(0, now);
    this.masterGain.connect(this.limiter);

    // specMix collects all bin oscillators
    this.specMix = context.createGain();
    this.specMix.gain.setValueAtTime(1, now);

    // specMixGate gates the direct path specMix → masterGain
    this.specMixGate = context.createGain();
    this.specMixGate.gain.setValueAtTime(1, now);
    this.specMix.connect(this.specMixGate);
    this.specMixGate.connect(this.masterGain);

    // Mangle send: specMix → mangleSend → ring-mod → shaper → mangleReturn → masterGain
    this.mangleSend = context.createGain();
    this.mangleSend.gain.setValueAtTime(0, now);
    this.specMix.connect(this.mangleSend);

    this.mangleRingGain = context.createGain();
    this.mangleRingGain.gain.setValueAtTime(0.5, now);

    this.mangleRingOsc = context.createOscillator();
    this.mangleRingOsc.type = 'sine';
    this.mangleRingOsc.frequency.setValueAtTime(30, now);
    this.mangleRingOsc.start();

    this.mangleShaper = context.createWaveShaper();
    this.mangleShaper.curve = this.makeMangleCurve(0.3);
    this.mangleShaper.oversample = '2x';

    this.mangleReturn = context.createGain();
    this.mangleReturn.gain.setValueAtTime(0, now);

    this.mangleSend.connect(this.mangleRingGain);
    this.mangleRingOsc.connect(this.mangleRingGain.gain);
    this.mangleRingGain.connect(this.mangleShaper);
    this.mangleShaper.connect(this.mangleReturn);
    this.mangleReturn.connect(this.masterGain);

    // Spectral oscillator bank
    for (let i = 0; i < NUM_BINS; i++) {
      const osc = context.createOscillator();
      osc.type = 'sine';
      const freq = binToFrequency(i, NUM_BINS);
      osc.frequency.setValueAtTime(freq, now);
      this.lastBinFreqs[i] = freq;

      const g = context.createGain();
      g.gain.setValueAtTime(0, now);

      const pan = context.createStereoPanner();
      pan.pan.setValueAtTime(0, now);

      osc.connect(g); g.connect(pan); pan.connect(this.specMix);
      osc.start();
      this.specOscs.push(osc);
      this.specGains.push(g);
      this.weavePanners.push(pan);
    }

    // Granular engine output → masterGain (used for textural/chromatic_noise when sample loaded)
    // Created lazily in setSampleBuffer when needed.

    // Sample chain: sampleSource → sampleFilter → sampleGain → sampleModeGain → masterGain
    // sampleModeGain is driven per-archetype (volume envelope, gate, grain chop, etc.)
    // sampleGain holds the base level (set from `volume`)
    this.sampleFilter = context.createBiquadFilter();
    this.sampleFilter.type = 'allpass'; // neutral by default

    this.sampleGain = context.createGain();
    this.sampleGain.gain.setValueAtTime(0, now);

    this.sampleModeGain = context.createGain();
    this.sampleModeGain.gain.setValueAtTime(0, now);

    this.sampleFilter.connect(this.sampleGain);
    this.sampleGain.connect(this.sampleModeGain);
    this.sampleModeGain.connect(this.masterGain);

    // Sample mangle send: sampleModeGain → sampleMangleSend → ring/shaper → mangleReturn
    this.sampleMangleSend = context.createGain();
    this.sampleMangleSend.gain.setValueAtTime(0, now);
    this.sampleModeGain.connect(this.sampleMangleSend);
    this.sampleMangleSend.connect(this.mangleRingGain);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private makeMangleCurve(amount: number): Float32Array<ArrayBuffer> {
    const n = 512;
    const buf = new ArrayBuffer(n * 4);
    const curve = new Float32Array(buf);
    const crush = Math.max(1, Math.floor(amount * 16));
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      const q = Math.round(x * crush) / crush;
      curve[i] = Math.tanh(q * (1 + amount * 3));
    }
    return curve;
  }

  private silenceAllBins(now: number): void {
    for (let i = 0; i < NUM_BINS; i++) {
      this.specGains[i].gain.cancelScheduledValues(now);
      this.specGains[i].gain.setValueAtTime(0, now);
    }
  }

  private centerAllPanners(now: number): void {
    for (let i = 0; i < NUM_BINS; i++) {
      this.weavePanners[i].pan.cancelScheduledValues(now);
      this.weavePanners[i].pan.setTargetAtTime(0, now, 0.05);
    }
  }

  private writeBins(
    bins: Float32Array,
    params: ModeParams,
    volume: number,
    now: number,
    timeConstant: number,
    rowVariance?: Float32Array
  ): void {
    for (let i = 0; i < NUM_BINS; i++) {
      const curveW = params.binWeightCurve[i] ?? 1;
      const varW = rowVariance ? 0.15 + rowVariance[i] * 0.85 : 1;
      const target = Math.min(bins[i] * curveW * varW * volume * params.outputGain, BIN_CEIL);
      this.specGains[i].gain.cancelScheduledValues(now);
      this.specGains[i].gain.setTargetAtTime(target, now, timeConstant);
    }
  }

  private updateBinFrequencies(profile: ImageProfile): void {
    const now = this.context.currentTime;
    for (let i = 0; i < NUM_BINS; i++) {
      const freq = binToFrequency(i, NUM_BINS, profile);
      if (Math.abs(this.lastBinFreqs[i] - freq) > 0.5) {
        this.specOscs[i].frequency.linearRampToValueAtTime(freq, now + 0.1);
        this.lastBinFreqs[i] = freq;
      }
    }
  }

  private applystereoWidth(width: number, now: number): void {
    for (let i = 0; i < NUM_BINS; i++) {
      const t = i / (NUM_BINS - 1);
      const pan = (t - 0.5) * 2 * width;
      this.weavePanners[i].pan.cancelScheduledValues(now);
      this.weavePanners[i].pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), now, 0.05);
    }
  }

  // Compute mean spectral amplitude across smoothed bins (0–1 range estimate)
  private meanBinAmplitude(): number {
    let sum = 0;
    for (let i = 0; i < NUM_BINS; i++) sum += this.smoothedBins[i];
    return sum / NUM_BINS;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setImageProfile(profile: ImageProfile): void {
    this.updateBinFrequencies(profile);
  }

  setPitchSemitones(semitones: number): void {
    this.pitchSemitones = semitones;
  }

  setModeParams(params: ModeParams): void {
    const now = this.context.currentTime;
    this.silenceAllBins(now);
    this.mangleReturn.gain.cancelScheduledValues(now);
    this.mangleReturn.gain.setValueAtTime(0, now);
    this.mangleSend.gain.cancelScheduledValues(now);
    this.mangleSend.gain.setValueAtTime(0, now);
    this.sampleMangleSend.gain.cancelScheduledValues(now);
    this.sampleMangleSend.gain.setValueAtTime(0, now);
    this.specMixGate.gain.cancelScheduledValues(now);
    this.specMixGate.gain.setValueAtTime(1, now);
    // Reset filter to neutral
    this.sampleFilter.type = 'allpass';

    this.currentParams = params;
    // Retune oscillators to reflect params' rootHz (may differ from image profile when pitch is overridden)
    this.updateBinFrequencies({ rootHz: params.rootHz, scaleRatios: params.scaleRatios } as ImageProfile);
    const oscType = dominantOscType(params.oscillatorType);
    for (const osc of this.specOscs) osc.type = oscType;
    for (let i = 0; i < NUM_BINS; i++) {
      this.specOscs[i].detune.cancelScheduledValues(now);
      this.specOscs[i].detune.setTargetAtTime(0, now, 0.05);
    }
    this.smoothedBins.fill(0);
    this.sampleModeLevel = 0;
    this.grainTimer = 0;
    this.lastTriggerTime = 0;
    // Re-route sample if one is loaded — mode change may switch looping↔granular
    if (this.sampleBuffer) this._initSampleRouting();
  }

  applyEffects(fx: LayerEffects): void {
    this.effects.applyEffects(fx);
  }

  updateFromPixel(
    sample: PixelSample,
    volume: number,
    muted: boolean,
    dt?: number
  ): void {
    if (!this._connected) return;
    const now = this.context.currentTime;
    const frameDt = dt ?? this.lastDt;
    this.lastDt = frameDt;

    if (muted || !this.currentParams) {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(0, now);
      this.silenceAllBins(now);
      this.sampleGain.gain.cancelScheduledValues(now);
      this.sampleGain.gain.setValueAtTime(0, now);
      this.sampleModeGain.gain.cancelScheduledValues(now);
      this.sampleModeGain.gain.setValueAtTime(0, now);
      return;
    }

    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(1, now);

    const p = this.currentParams;
    const archetype: ArchetypeId = p.archetype;
    const hasSample = this.sampleSource !== null || (this.granular !== null && this.sampleBuffer !== null);

    // Always update smoothed bins — both synth and sample modes read them
    slewBins(this.smoothedBins, sample.spectrumBins, p.spectralSmoothing, frameDt);

    if (hasSample) {
      // ── Sample mode: drive sampleGain (base level) + sampleModeGain (archetype modulation) ──
      // Silence spec oscillators — they're not used when a sample is loaded
      this.silenceAllBins(now);
      this.sampleGain.gain.cancelScheduledValues(now);
      this.sampleGain.gain.setValueAtTime(volume * p.outputGain, now);

      // With sample loaded, spec oscillators are always silent.
      // Mangle path is not used for sample modes (granular goes direct to masterGain).
      this.specMixGate.gain.cancelScheduledValues(now);
      this.specMixGate.gain.setValueAtTime(0, now);
      this.mangleSend.gain.cancelScheduledValues(now);
      this.mangleSend.gain.setValueAtTime(0, now);
      this.sampleMangleSend.gain.cancelScheduledValues(now);
      this.sampleMangleSend.gain.setValueAtTime(0, now);
      this.mangleReturn.gain.cancelScheduledValues(now);
      this.mangleReturn.gain.setValueAtTime(0, now);

      switch (archetype) {
        case 'tonal': {
          // Volume swells with overall spectral brightness
          const meanAmp = this.meanBinAmplitude();
          this.sampleModeLevel = slew(this.sampleModeLevel, meanAmp, 4, frameDt);
          const targetGain = Math.min(0.2 + this.sampleModeLevel * 0.8, 1);
          this.sampleModeGain.gain.cancelScheduledValues(now);
          this.sampleModeGain.gain.setTargetAtTime(targetGain, now, p.attackTime);
          // Subtle filter tilt based on image warmth
          this.sampleFilter.type = 'peaking';
          this.sampleFilter.frequency.setValueAtTime(400, now);
          this.sampleFilter.gain.setValueAtTime((sample.hue < 60 || sample.hue > 300 ? 1 : -1) * 3, now);
          this.sampleFilter.Q.setValueAtTime(0.7, now);
          break;
        }

        case 'rhythmic': {
          // Gate: sample plays only during triggered beat windows
          const meanAmp = this.meanBinAmplitude();
          const hasEdge = sample.edgeDensity > p.triggerThreshold;
          const hasBeat = meanAmp > 0.05 && sample.contrast > 0.15;
          const cooldownDone = now - this.lastTriggerTime > p.releaseTime * 0.6;

          if ((hasEdge || hasBeat) && cooldownDone) {
            this.lastTriggerTime = now;
            // Open gate: fast attack, then release
            this.sampleModeGain.gain.cancelScheduledValues(now);
            this.sampleModeGain.gain.setValueAtTime(0.0001, now);
            this.sampleModeGain.gain.linearRampToValueAtTime(1, now + p.attackTime);
            this.sampleModeGain.gain.setTargetAtTime(0.0001, now + p.attackTime, p.releaseTime * 0.4);
          }
          break;
        }

        case 'textural': {
          // Real granular synthesis — GranularEngine fires individual grains
          if (this.granular) {
            // Scan position through buffer driven by image scan (brightness maps to buffer position)
            this.granularScanPos = sample.brightness / 255;
            const grainDur = Math.max(0.02, Math.min(0.35, 1 / Math.max(4, p.grainDensity) * 2));
            const meanVar = sample.rowVariance
              ? Array.from(sample.rowVariance).reduce((a, b) => a + b, 0) / NUM_BINS
              : 0.3;
            const gParams: GranularParams = {
              grainDensity: p.grainDensity,
              grainDuration: grainDur,
              position: this.granularScanPos,
              positionScatter: 0.05 + meanVar * 0.25,  // more scatter in textured regions
              pitchShift: this.pitchSemitones,
              pitchScatter: p.detuneSpread / 100 * 6,  // detuneSpread cents → semitones scatter
              stereoWidth: p.stereoWidth,
              amplitude: Math.min(this.meanBinAmplitude() * p.outputGain * 2.5, 0.9),
              attackRatio: p.attackTime < 0.05 ? 0.15 : 0.3,
            };
            this.granular.tick(gParams, frameDt);
          }
          break;
        }

        case 'sub': {
          // Volume follows only the low-end bins; apply low-pass filter
          let lowSum = 0;
          for (let i = 0; i < 6; i++) lowSum += this.smoothedBins[i];
          const lowAmp = Math.min(lowSum / 6 * 4, 1); // ×4 boost same as synth sub
          this.sampleModeLevel = slew(this.sampleModeLevel, lowAmp, 2, frameDt);
          this.sampleModeGain.gain.cancelScheduledValues(now);
          this.sampleModeGain.gain.setTargetAtTime(this.sampleModeLevel, now, p.attackTime);
          // Low-pass to emphasise the sub frequencies
          this.sampleFilter.type = 'lowpass';
          this.sampleFilter.frequency.setValueAtTime(300 + sample.brightness * 2, now);
          this.sampleFilter.Q.setValueAtTime(0.5, now);
          break;
        }

        case 'spectral': {
          // Overall brightness drives level; R/G/B balance tilts filter
          const [rW, gW, bW] = p.colorChannelBalance;
          const channelAmp = (sample.r / 255 * rW + sample.g / 255 * gW + sample.b / 255 * bW) / 3;
          this.sampleModeLevel = slew(this.sampleModeLevel, channelAmp, p.spectralSmoothing, frameDt);
          this.sampleModeGain.gain.cancelScheduledValues(now);
          this.sampleModeGain.gain.setTargetAtTime(Math.min(this.sampleModeLevel * 3, 1), now, p.attackTime);
          // Spectral tilt: dominant channel shifts filter
          const domCh = rW > gW && rW > bW ? 'r' : gW > bW ? 'g' : 'b';
          const filterFreq = domCh === 'r' ? 800 : domCh === 'g' ? 1600 : 3200;
          this.sampleFilter.type = 'peaking';
          this.sampleFilter.frequency.setValueAtTime(filterFreq, now);
          this.sampleFilter.gain.setValueAtTime(4, now);
          this.sampleFilter.Q.setValueAtTime(1, now);
          break;
        }

        case 'chromatic_noise': {
          // Granular synthesis feeding the mangle path
          if (this.granular) {
            // Quantised, scattered position — chaotic scrubbing
            const quantSteps = Math.max(2, 8 - Math.floor(sample.contrast * 6));
            const rawPos = sample.brightness / 255;
            const qPos = Math.round(rawPos * quantSteps) / quantSteps;
            const gParams: GranularParams = {
              grainDensity: p.grainDensity,
              grainDuration: 0.04 + sample.contrast * 0.12,
              position: qPos,
              positionScatter: 0.15 + sample.contrast * 0.3,
              pitchShift: this.pitchSemitones,
              pitchScatter: p.detuneSpread / 100 * 12, // wider pitch scatter
              stereoWidth: p.stereoWidth,
              amplitude: Math.min(this.meanBinAmplitude() * p.outputGain * 2, 0.85),
              attackRatio: 0.1,
            };
            this.granular.tick(gParams, frameDt);
          }
          // Update ring mod / shaper for mangle colour
          const targetRingFreq = 10 + sample.saturation * 790;
          this.mangleRingFreq = slew(this.mangleRingFreq, targetRingFreq, 300, frameDt);
          this.mangleRingOsc.frequency.cancelScheduledValues(now);
          this.mangleRingOsc.frequency.setTargetAtTime(this.mangleRingFreq, now, 0.03);
          this.mangleRingGain.gain.cancelScheduledValues(now);
          this.mangleRingGain.gain.setValueAtTime(0.5, now);
          this.mangleShaper.curve = this.makeMangleCurve(sample.contrast * 0.7 + 0.2);
          break;
        }
      }

    } else {
      // ── Synth mode: spec oscillators, sampleModeGain stays silent ──
      this.sampleGain.gain.cancelScheduledValues(now);
      this.sampleGain.gain.setValueAtTime(0, now);
      this.sampleModeGain.gain.cancelScheduledValues(now);
      this.sampleModeGain.gain.setValueAtTime(0, now);

      // Route mangle path for chromatic_noise
      if (archetype === 'chromatic_noise') {
        this.specMixGate.gain.cancelScheduledValues(now);
        this.specMixGate.gain.setValueAtTime(0, now);
        this.mangleSend.gain.cancelScheduledValues(now);
        this.mangleSend.gain.setValueAtTime(1, now);
        this.mangleReturn.gain.cancelScheduledValues(now);
        this.mangleReturn.gain.setValueAtTime(0.8, now);
      } else {
        this.specMixGate.gain.cancelScheduledValues(now);
        this.specMixGate.gain.setValueAtTime(1, now);
        this.mangleSend.gain.cancelScheduledValues(now);
        this.mangleSend.gain.setValueAtTime(0, now);
        this.mangleReturn.gain.cancelScheduledValues(now);
        this.mangleReturn.gain.setValueAtTime(0, now);
      }

      switch (archetype) {

        case 'tonal': {
          this.applystereoWidth(p.stereoWidth, now);
          const detuneTarget = p.detuneSpread * (0.5 + sample.saturation * 0.5);
          for (let i = 0; i < NUM_BINS; i++) {
            this.specOscs[i].detune.cancelScheduledValues(now);
            this.specOscs[i].detune.setTargetAtTime(Math.sin(i * 0.7) * detuneTarget, now, 0.2);
          }
          this.writeBins(this.smoothedBins, p, volume, now, p.attackTime, sample.rowVariance);
          break;
        }

        case 'rhythmic': {
          this.centerAllPanners(now);
          let meanAmp = 0;
          for (let i = 0; i < NUM_BINS; i++) meanAmp += this.smoothedBins[i];
          meanAmp /= NUM_BINS;

          const hasEdge = sample.edgeDensity > p.triggerThreshold;
          const hasBeat = meanAmp > 0.05 && sample.contrast > 0.15;
          const cooldownDone = now - this.lastTriggerTime > p.releaseTime * 0.6;

          if ((hasEdge || hasBeat) && cooldownDone) {
            this.lastTriggerTime = now;
            for (let i = 0; i < NUM_BINS; i++) this.strikeEnvelope[i] = this.smoothedBins[i];
            for (let i = 0; i < NUM_BINS; i++) {
              const curveW = p.binWeightCurve[i] ?? 1;
              const varW = sample.rowVariance ? 0.15 + sample.rowVariance[i] * 0.85 : 1;
              const peak = Math.min(this.strikeEnvelope[i] * curveW * varW * volume * p.outputGain, BIN_CEIL);
              const g = this.specGains[i].gain;
              g.cancelScheduledValues(now);
              g.setValueAtTime(peak, now);
              g.exponentialRampToValueAtTime(0.0001, now + p.releaseTime);
            }
          }
          break;
        }

        case 'textural': {
          this.grainTimer += frameDt;
          const grainInterval = 1 / Math.max(1, p.grainDensity);

          while (this.grainTimer >= grainInterval) {
            this.grainTimer -= grainInterval;
            const centerBin = Math.floor((sample.brightness / 255) * (NUM_BINS - 1));
            const grainBins = new Float32Array(NUM_BINS);

            for (let i = 0; i < NUM_BINS; i++) {
              const dist = Math.abs(i - centerBin);
              if (dist <= p.grainWidth) {
                const falloff = 1 - dist / (p.grainWidth + 1);
                grainBins[i] = sample.spectrumBins[i] * falloff * (0.4 + Math.random() * 0.6);
              }
            }

            const scatter = p.detuneSpread * 4;
            for (let i = 0; i < NUM_BINS; i++) {
              this.specOscs[i].detune.cancelScheduledValues(now);
              this.specOscs[i].detune.setValueAtTime((Math.random() - 0.5) * scatter, now);
            }
            this.applystereoWidth(p.stereoWidth, now);
            this.writeBins(grainBins, p, volume, now, Math.max(grainInterval * 0.5, 0.005), sample.rowVariance);
          }
          break;
        }

        case 'sub': {
          this.centerAllPanners(now);
          for (let i = 0; i < NUM_BINS; i++) {
            const curveW = p.binWeightCurve[i] ?? 0;
            const g = this.specGains[i].gain;
            g.cancelScheduledValues(now);
            if (curveW < 0.01) {
              g.setTargetAtTime(0, now, 0.05);
            } else {
              const target = Math.min(this.smoothedBins[i] * curveW * volume * p.outputGain * 4, BIN_CEIL);
              g.setTargetAtTime(target, now, p.attackTime);
            }
          }
          for (let i = 0; i < NUM_BINS; i++) {
            this.specOscs[i].detune.cancelScheduledValues(now);
            this.specOscs[i].detune.setTargetAtTime(Math.sin(i) * p.detuneSpread, now, 0.3);
          }
          break;
        }

        case 'spectral': {
          this.applystereoWidth(p.stereoWidth, now);
          const [rW, gW, bW] = p.colorChannelBalance;
          for (let i = 0; i < NUM_BINS; i++) {
            const group = i % 3;
            const channelAmp = [sample.r / 255 * rW, sample.g / 255 * gW, sample.b / 255 * bW][group];
            const curveW = p.binWeightCurve[i] ?? 1;
            const varW = sample.rowVariance ? 0.15 + sample.rowVariance[i] * 0.85 : 1;
            const target = Math.min(
              this.smoothedBins[i] * channelAmp * curveW * varW * volume * p.outputGain * 3,
              BIN_CEIL
            );
            this.specGains[i].gain.cancelScheduledValues(now);
            this.specGains[i].gain.setTargetAtTime(target, now, p.attackTime);
          }
          for (let i = 0; i < NUM_BINS; i++) {
            this.specOscs[i].detune.cancelScheduledValues(now);
            this.specOscs[i].detune.setTargetAtTime(Math.sin(i * 0.7) * p.detuneSpread, now, 0.15);
          }
          break;
        }

        case 'chromatic_noise': {
          const steps = Math.max(2, 8 - Math.floor(sample.contrast * 6));
          for (let i = 0; i < NUM_BINS; i++) {
            const q = Math.round(this.smoothedBins[i] * steps) / steps;
            const curveW = p.binWeightCurve[i] ?? 1;
            const varW = sample.rowVariance ? 0.15 + sample.rowVariance[i] * 0.85 : 1;
            const target = Math.min(q * curveW * varW * volume * p.outputGain, BIN_CEIL);
            this.specGains[i].gain.cancelScheduledValues(now);
            this.specGains[i].gain.setTargetAtTime(target, now, 0.015);
          }
          const targetRingFreq = 10 + sample.saturation * 790;
          this.mangleRingFreq = slew(this.mangleRingFreq, targetRingFreq, 300, frameDt);
          this.mangleRingOsc.frequency.cancelScheduledValues(now);
          this.mangleRingOsc.frequency.setTargetAtTime(this.mangleRingFreq, now, 0.03);
          this.mangleRingGain.gain.cancelScheduledValues(now);
          this.mangleRingGain.gain.setValueAtTime(0.5, now);
          this.mangleShaper.curve = this.makeMangleCurve(sample.contrast * 0.7 + 0.2);
          break;
        }
      }
    }
  }

  setSampleBuffer(buffer: AudioBuffer): void {
    this.sampleBuffer = buffer;
    this._initSampleRouting();
  }

  // Called by setSampleBuffer and setModeParams (when mode changes while sample is loaded).
  // Decides whether to use looping source or granular engine based on current archetype.
  private _initSampleRouting(): void {
    const buffer = this.sampleBuffer;
    if (!buffer) return;
    const now = this.context.currentTime;
    const archetype = this.currentParams?.archetype ?? 'tonal';
    const useGranular = archetype === 'textural' || archetype === 'chromatic_noise';

    // Stop any existing looping source
    if (this.sampleSource) {
      try { this.sampleSource.stop(); } catch(_) {}
      this.sampleSource.disconnect();
      this.sampleSource = null;
    }

    if (useGranular) {
      // Build or reuse granular engine
      if (!this.granular) {
        this.granular = new GranularEngine(this.context, this.masterGain);
      }
      this.granular.setBuffer(buffer);
      this.granular.reset();
      this.granularScanPos = 0;
      // Silence the looping sample path
      this.sampleGain.gain.cancelScheduledValues(now);
      this.sampleGain.gain.setValueAtTime(0, now);
      this.sampleModeGain.gain.cancelScheduledValues(now);
      this.sampleModeGain.gain.setValueAtTime(0, now);
    } else {
      // Looping source path
      if (this.granular) {
        this.granular.reset(); // silence grains but keep engine alive
      }
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.sampleFilter);
      source.start();
      this.sampleSource = source;
      this.sampleGain.gain.cancelScheduledValues(now);
      this.sampleGain.gain.setValueAtTime(0.8, now);
      this.sampleModeGain.gain.cancelScheduledValues(now);
      this.sampleModeGain.gain.setValueAtTime(1, now);
    }
  }

  clearSample(): void {
    if (this.sampleSource) {
      try { this.sampleSource.stop(); } catch(_) {}
      this.sampleSource.disconnect();
      this.sampleSource = null;
    }
    this.sampleBuffer = null;
    if (this.granular) {
      this.granular.reset();
    }
    const now = this.context.currentTime;
    this.sampleGain.gain.cancelScheduledValues(now);
    this.sampleGain.gain.setValueAtTime(0, now);
    this.sampleModeGain.gain.cancelScheduledValues(now);
    this.sampleModeGain.gain.setValueAtTime(0, now);
    this.sampleFilter.type = 'allpass';
  }

  setOscillatorType(type: OscillatorType): void {
    for (const osc of this.specOscs) osc.type = type;
  }

  disconnect(): void {
    this._connected = false;
    try {
      this.masterGain.gain.setValueAtTime(0, this.context.currentTime);
      this.specOscs.forEach(o => { try { o.stop(); o.disconnect(); } catch(_) {} });
      this.mangleRingOsc.stop(); this.mangleRingOsc.disconnect();
      if (this.sampleSource) { try { this.sampleSource.stop(); } catch(_) {} this.sampleSource.disconnect(); }
      this.granular?.disconnect();
      [this.specMix, this.specMixGate, this.sampleFilter, this.sampleGain,
       this.sampleModeGain, this.sampleMangleSend, this.mangleSend,
       this.mangleRingGain, this.mangleShaper, this.mangleReturn,
       this.masterGain, this.limiter
      ].forEach(n => { try { n.disconnect(); } catch(_) {} });
      this.effects.disconnect();
    } catch (_) {}
  }
}
