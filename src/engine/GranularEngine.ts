// GranularEngine — real granular synthesis using AudioBufferSourceNodes.
// Each grain is a short playback of a slice of the sample buffer with:
//   - a Hann-windowed gain envelope
//   - randomised playback position (scrubbed by image scan position)
//   - pitch scatter via playbackRate
//   - per-grain stereo pan
//
// The engine owns a pool of pre-allocated grain slots (GainNode + panner).
// On each trigger it picks a free slot, starts a new source, and schedules
// the envelope — the source auto-disconnects when done via onended.

const MAX_GRAINS = 32; // max simultaneous grains

function makeHannCurve(ctx: AudioContext, durationSamples: number): AudioBuffer {
  const buf = ctx.createBuffer(1, durationSamples, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < durationSamples; i++) {
    // Hann window: 0.5*(1 - cos(2π·i/N))
    data[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (durationSamples - 1)));
  }
  return buf;
}

interface GrainSlot {
  gain: GainNode;
  panner: StereoPannerNode;
  busy: boolean;
  source: AudioBufferSourceNode | null;
  envelope: AudioBufferSourceNode | null;
}

export interface GranularParams {
  // Timing
  grainDensity: number;      // grains/sec (1–80)
  grainDuration: number;     // seconds per grain (0.02–0.4)
  // Position
  position: number;          // 0–1 playhead position within buffer
  positionScatter: number;   // 0–1 random scatter around position
  // Pitch
  pitchShift: number;        // semitones base shift (−12 to +12)
  pitchScatter: number;      // semitones random scatter (0–12)
  // Space
  stereoWidth: number;       // 0–1
  // Level
  amplitude: number;         // 0–1 per-grain amplitude
  // Envelope shape
  attackRatio: number;       // fraction of grain that is attack (0.1–0.5)
}

export class GranularEngine {
  private context: AudioContext;
  private output: GainNode;          // → caller connects this to their graph
  private buffer: AudioBuffer | null = null;
  private slots: GrainSlot[] = [];
  private grainTimer = 0;
  private _active = true;

  // Cached Hann curves keyed by duration in samples (approximate bucket)
  private hannCache = new Map<number, AudioBuffer>();

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context;

    this.output = context.createGain();
    this.output.gain.setValueAtTime(1, context.currentTime);
    this.output.connect(destination);

    // Pre-allocate grain slots
    for (let i = 0; i < MAX_GRAINS; i++) {
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, context.currentTime);

      const panner = context.createStereoPanner();
      panner.pan.setValueAtTime(0, context.currentTime);

      gain.connect(panner);
      panner.connect(this.output);

      this.slots.push({ gain, panner, busy: false, source: null, envelope: null });
    }
  }

  setBuffer(buffer: AudioBuffer): void {
    this.buffer = buffer;
    this.hannCache.clear();
  }

  clearBuffer(): void {
    this.buffer = null;
    this.stopAllGrains();
  }

  // Called every animation frame. dt = frame delta in seconds.
  tick(params: GranularParams, dt: number): void {
    if (!this._active || !this.buffer) return;

    this.grainTimer += dt;
    const interval = 1 / Math.max(1, params.grainDensity);

    while (this.grainTimer >= interval) {
      this.grainTimer -= interval;
      this.fireGrain(params);
    }
  }

  private fireGrain(params: GranularParams): void {
    if (!this.buffer) return;

    const slot = this.getFreeSlot();
    if (!slot) return; // all slots busy — drop grain

    const ctx = this.context;
    const now = ctx.currentTime;
    const sr = ctx.sampleRate;
    const bufDur = this.buffer.duration;

    // ── Position ──────────────────────────────────────────────────────────
    const scatter = params.positionScatter * (Math.random() - 0.5) * 2;
    const pos = Math.max(0, Math.min(1, params.position + scatter));
    const offsetSec = pos * bufDur;

    // ── Duration ──────────────────────────────────────────────────────────
    const grainDur = Math.max(0.015, params.grainDuration);
    const grainSamples = Math.round(grainDur * sr);

    // ── Pitch ─────────────────────────────────────────────────────────────
    const pitchScatterSemitones = (Math.random() - 0.5) * 2 * params.pitchScatter;
    const totalSemitones = params.pitchShift + pitchScatterSemitones;
    const playbackRate = Math.pow(2, totalSemitones / 12);

    // ── Pan ───────────────────────────────────────────────────────────────
    const pan = (Math.random() - 0.5) * 2 * params.stereoWidth;

    // ── Hann envelope source ──────────────────────────────────────────────
    const hannBuf = this.getHann(grainSamples);
    const envelope = ctx.createBufferSource();
    envelope.buffer = hannBuf;
    // Connect envelope to slot gain via AudioParam modulation
    // (Hann 0→1→0 × base amplitude)
    slot.gain.gain.setValueAtTime(params.amplitude, now);
    envelope.connect(slot.gain.gain); // AudioParam connection: modulates the gain

    // ── Audio source ───────────────────────────────────────────────────────
    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.loop = false;
    source.playbackRate.setValueAtTime(playbackRate, now);
    source.connect(slot.gain);

    slot.panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), now);
    slot.busy = true;
    slot.source = source;
    slot.envelope = envelope;

    // Start both — envelope drives the gain shape
    source.start(now, offsetSec, grainDur / playbackRate);
    envelope.start(now);

    // Release slot when grain ends
    const releaseSec = grainDur + 0.005;
    source.stop(now + releaseSec);
    envelope.stop(now + releaseSec);
    source.onended = () => {
      try { source.disconnect(); } catch (_) {}
      try { envelope.disconnect(); } catch (_) {}
      slot.gain.gain.setValueAtTime(0, ctx.currentTime);
      slot.busy = false;
      slot.source = null;
      slot.envelope = null;
    };
  }

  private getFreeSlot(): GrainSlot | null {
    for (const slot of this.slots) {
      if (!slot.busy) return slot;
    }
    return null;
  }

  private getHann(samples: number): AudioBuffer {
    // Round to nearest 64 samples to reuse cached buffers
    const bucket = Math.round(samples / 64) * 64;
    if (!this.hannCache.has(bucket)) {
      this.hannCache.set(bucket, makeHannCurve(this.context, Math.max(64, bucket)));
    }
    return this.hannCache.get(bucket)!;
  }

  private stopAllGrains(): void {
    const now = this.context.currentTime;
    for (const slot of this.slots) {
      if (slot.source) {
        try { slot.source.stop(now); } catch (_) {}
        try { slot.source.disconnect(); } catch (_) {}
      }
      if (slot.envelope) {
        try { slot.envelope.stop(now); } catch (_) {}
        try { slot.envelope.disconnect(); } catch (_) {}
      }
      slot.gain.gain.setValueAtTime(0, now);
      slot.busy = false;
      slot.source = null;
      slot.envelope = null;
    }
    this.grainTimer = 0;
  }

  reset(): void {
    this.stopAllGrains();
    this.grainTimer = 0;
  }

  disconnect(): void {
    this._active = false;
    this.stopAllGrains();
    try { this.output.disconnect(); } catch (_) {}
    for (const slot of this.slots) {
      try { slot.gain.disconnect(); } catch (_) {}
      try { slot.panner.disconnect(); } catch (_) {}
    }
  }
}
