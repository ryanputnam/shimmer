import type { LayerEffects } from '../types';

/**
 * A chain of audio effects nodes inserted between the synth output and the layer gain.
 * Signal flow: input → [distortion] → [eq] → [flanger] → [chorus] → [delay wet] → [reverb wet] → output
 * Dry signal is mixed in parallel for delay and reverb.
 */
export class EffectsChain {
  private context: AudioContext;

  // Public I/O nodes
  readonly input: GainNode;
  readonly output: GainNode;

  // Distortion
  private distortionNode: WaveShaperNode;
  private distortionBypass: GainNode;
  private distortionWet: GainNode;

  // EQ (3-band) — runs in series through filters; bypass goes around the whole chain
  private eqLow: BiquadFilterNode;
  private eqMid: BiquadFilterNode;
  private eqHigh: BiquadFilterNode;
  private eqWet: GainNode;   // post-filter blend
  private eqBypass: GainNode; // parallel dry path around filters

  // Flanger
  private flangerDelay: DelayNode;
  private flangerLFO: OscillatorNode;
  private flangerLFOGain: GainNode;
  private flangerWet: GainNode;
  private flangerBypass: GainNode;

  // Chorus
  private chorusDelay: DelayNode;
  private chorusLFO: OscillatorNode;
  private chorusLFOGain: GainNode;
  private chorusWet: GainNode;
  private chorusBypass: GainNode;

  // Delay/Echo
  private delayNode: DelayNode;
  private delayFeedbackGain: GainNode;
  private delayWet: GainNode;
  private delayDry: GainNode;

  // Reverb
  private reverbNode: ConvolverNode;
  private reverbWet: GainNode;
  private reverbDry: GainNode;
  private lastReverbDecay = -1; // cache so we only rebuild IR when decay changes

  constructor(context: AudioContext) {
    this.context = context;

    this.input = context.createGain();
    this.output = context.createGain();
    this.output.gain.setValueAtTime(1, context.currentTime);

    // ── Distortion ───────────────────────────────────────────
    this.distortionNode = context.createWaveShaper();
    this.distortionNode.oversample = '4x';
    this.distortionBypass = context.createGain();
    this.distortionWet = context.createGain();
    this.distortionWet.gain.setValueAtTime(0, context.currentTime);
    this.distortionBypass.gain.setValueAtTime(1, context.currentTime);

    const distMerge = context.createGain();
    this.input.connect(this.distortionNode);
    this.distortionNode.connect(this.distortionWet);
    this.distortionWet.connect(distMerge);
    this.input.connect(this.distortionBypass);
    this.distortionBypass.connect(distMerge);

    // ── EQ (true bypass: wet path = filter chain, dry path = straight through) ──
    this.eqLow = context.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.setValueAtTime(300, context.currentTime);

    this.eqMid = context.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.setValueAtTime(1000, context.currentTime);
    this.eqMid.Q.setValueAtTime(1, context.currentTime);

    this.eqHigh = context.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.setValueAtTime(3000, context.currentTime);

    this.eqWet = context.createGain();   // gates the filter chain output
    this.eqWet.gain.setValueAtTime(0, context.currentTime);
    this.eqBypass = context.createGain(); // parallel dry path
    this.eqBypass.gain.setValueAtTime(1, context.currentTime);

    const eqMerge = context.createGain();
    distMerge.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.eqWet);
    this.eqWet.connect(eqMerge);
    distMerge.connect(this.eqBypass);
    this.eqBypass.connect(eqMerge);

    // ── Flanger ──────────────────────────────────────────────
    this.flangerDelay = context.createDelay(0.02);
    this.flangerDelay.delayTime.setValueAtTime(0.004, context.currentTime);
    this.flangerLFO = context.createOscillator();
    this.flangerLFO.type = 'sine';
    this.flangerLFO.frequency.setValueAtTime(0.5, context.currentTime);
    this.flangerLFOGain = context.createGain();
    this.flangerLFOGain.gain.setValueAtTime(0.003, context.currentTime);
    this.flangerLFO.connect(this.flangerLFOGain);
    this.flangerLFOGain.connect(this.flangerDelay.delayTime);
    this.flangerLFO.start();
    this.flangerWet = context.createGain();
    this.flangerWet.gain.setValueAtTime(0, context.currentTime);
    this.flangerBypass = context.createGain();
    this.flangerBypass.gain.setValueAtTime(1, context.currentTime);

    const flangerMerge = context.createGain();
    eqMerge.connect(this.flangerDelay);
    this.flangerDelay.connect(this.flangerWet);
    this.flangerWet.connect(flangerMerge);
    eqMerge.connect(this.flangerBypass);
    this.flangerBypass.connect(flangerMerge);

    // ── Chorus ───────────────────────────────────────────────
    this.chorusDelay = context.createDelay(0.04);
    this.chorusDelay.delayTime.setValueAtTime(0.01, context.currentTime);
    this.chorusLFO = context.createOscillator();
    this.chorusLFO.type = 'sine';
    this.chorusLFO.frequency.setValueAtTime(1.5, context.currentTime);
    this.chorusLFOGain = context.createGain();
    this.chorusLFOGain.gain.setValueAtTime(0.006, context.currentTime);
    this.chorusLFO.connect(this.chorusLFOGain);
    this.chorusLFOGain.connect(this.chorusDelay.delayTime);
    this.chorusLFO.start();
    this.chorusWet = context.createGain();
    this.chorusWet.gain.setValueAtTime(0, context.currentTime);
    this.chorusBypass = context.createGain();
    this.chorusBypass.gain.setValueAtTime(1, context.currentTime);

    const chorusMerge = context.createGain();
    flangerMerge.connect(this.chorusDelay);
    this.chorusDelay.connect(this.chorusWet);
    this.chorusWet.connect(chorusMerge);
    flangerMerge.connect(this.chorusBypass);
    this.chorusBypass.connect(chorusMerge);

    // ── Delay/Echo ───────────────────────────────────────────
    this.delayNode = context.createDelay(1.0);
    this.delayNode.delayTime.setValueAtTime(0.3, context.currentTime);
    this.delayFeedbackGain = context.createGain();
    this.delayFeedbackGain.gain.setValueAtTime(0.4, context.currentTime);
    this.delayNode.connect(this.delayFeedbackGain);
    this.delayFeedbackGain.connect(this.delayNode);
    this.delayWet = context.createGain();
    this.delayWet.gain.setValueAtTime(0, context.currentTime);
    this.delayDry = context.createGain();
    this.delayDry.gain.setValueAtTime(1, context.currentTime);

    const delayMerge = context.createGain();
    chorusMerge.connect(this.delayNode);
    this.delayNode.connect(this.delayWet);
    this.delayWet.connect(delayMerge);
    chorusMerge.connect(this.delayDry);
    this.delayDry.connect(delayMerge);

    // ── Reverb ───────────────────────────────────────────────
    this.reverbNode = context.createConvolver();
    this.reverbWet = context.createGain();
    this.reverbWet.gain.setValueAtTime(0, context.currentTime);
    this.reverbDry = context.createGain();
    this.reverbDry.gain.setValueAtTime(1, context.currentTime);

    delayMerge.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbWet);
    this.reverbWet.connect(this.output);
    delayMerge.connect(this.reverbDry);
    this.reverbDry.connect(this.output);
  }

  /** Synthesize an impulse response for reverb */
  private makeImpulseResponse(decay: number): AudioBuffer {
    const sampleRate = this.context.sampleRate;
    const length = Math.floor(sampleRate * Math.max(0.1, decay));
    const buf = this.context.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
      }
    }
    return buf;
  }

  /** Make a distortion curve */
  private makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const n = 256;
    const buf = new ArrayBuffer(n * 4);
    const curve = new Float32Array(buf);
    const k = amount;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  applyEffects(fx: LayerEffects): void {
    const now = this.context.currentTime;
    const ramp = 0.05;

    // Distortion
    if (fx.distortionEnabled) {
      this.distortionNode.curve = this.makeDistortionCurve(fx.distortionAmount);
      this.distortionWet.gain.linearRampToValueAtTime(1, now + ramp);
      this.distortionBypass.gain.linearRampToValueAtTime(0, now + ramp);
    } else {
      this.distortionWet.gain.linearRampToValueAtTime(0, now + ramp);
      this.distortionBypass.gain.linearRampToValueAtTime(1, now + ramp);
    }

    // EQ — true bypass: wet path carries filter chain, bypass is straight-through
    if (fx.eqEnabled) {
      this.eqLow.gain.linearRampToValueAtTime(fx.eqLowGain, now + ramp);
      this.eqMid.gain.linearRampToValueAtTime(fx.eqMidGain, now + ramp);
      this.eqMid.frequency.linearRampToValueAtTime(fx.eqMidFreq, now + ramp);
      this.eqHigh.gain.linearRampToValueAtTime(fx.eqHighGain, now + ramp);
      this.eqWet.gain.linearRampToValueAtTime(1, now + ramp);
      this.eqBypass.gain.linearRampToValueAtTime(0, now + ramp);
    } else {
      this.eqWet.gain.linearRampToValueAtTime(0, now + ramp);
      this.eqBypass.gain.linearRampToValueAtTime(1, now + ramp);
    }

    // Flanger
    this.flangerLFO.frequency.linearRampToValueAtTime(fx.flangerRate, now + ramp);
    this.flangerLFOGain.gain.linearRampToValueAtTime(fx.flangerDepth, now + ramp);
    if (fx.flangerEnabled) {
      this.flangerWet.gain.linearRampToValueAtTime(fx.flangerMix, now + ramp);
      this.flangerBypass.gain.linearRampToValueAtTime(1 - fx.flangerMix, now + ramp);
    } else {
      this.flangerWet.gain.linearRampToValueAtTime(0, now + ramp);
      this.flangerBypass.gain.linearRampToValueAtTime(1, now + ramp);
    }

    // Chorus
    this.chorusLFO.frequency.linearRampToValueAtTime(fx.chorusRate, now + ramp);
    this.chorusLFOGain.gain.linearRampToValueAtTime(fx.chorusDepth, now + ramp);
    if (fx.chorusEnabled) {
      this.chorusWet.gain.linearRampToValueAtTime(fx.chorusMix, now + ramp);
      this.chorusBypass.gain.linearRampToValueAtTime(1 - fx.chorusMix, now + ramp);
    } else {
      this.chorusWet.gain.linearRampToValueAtTime(0, now + ramp);
      this.chorusBypass.gain.linearRampToValueAtTime(1, now + ramp);
    }

    // Delay
    this.delayNode.delayTime.linearRampToValueAtTime(fx.delayTime, now + ramp);
    this.delayFeedbackGain.gain.linearRampToValueAtTime(fx.delayFeedback, now + ramp);
    if (fx.delayEnabled) {
      this.delayWet.gain.linearRampToValueAtTime(fx.delayMix, now + ramp);
      this.delayDry.gain.linearRampToValueAtTime(1, now + ramp);
    } else {
      this.delayWet.gain.linearRampToValueAtTime(0, now + ramp);
      this.delayDry.gain.linearRampToValueAtTime(1, now + ramp);
    }

    // Reverb — only rebuild impulse response when decay value changes
    if (fx.reverbEnabled) {
      if (Math.abs(fx.reverbDecay - this.lastReverbDecay) > 0.05) {
        this.reverbNode.buffer = this.makeImpulseResponse(fx.reverbDecay);
        this.lastReverbDecay = fx.reverbDecay;
      }
      this.reverbWet.gain.linearRampToValueAtTime(fx.reverbMix, now + ramp);
      this.reverbDry.gain.linearRampToValueAtTime(1 - fx.reverbMix * 0.5, now + ramp);
    } else {
      this.reverbWet.gain.linearRampToValueAtTime(0, now + ramp);
      this.reverbDry.gain.linearRampToValueAtTime(1, now + ramp);
      this.lastReverbDecay = -1; // reset so next enable rebuilds IR
    }
  }

  disconnect(): void {
    try {
      this.flangerLFO.stop();
      this.chorusLFO.stop();
      this.input.disconnect();
      this.output.disconnect();
    } catch (_) {}
  }
}
