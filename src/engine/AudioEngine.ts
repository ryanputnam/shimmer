import { AudioLayerNode } from './AudioLayerNode';
import type { RectLayer } from '../types';

export class AudioEngine {
  private context: AudioContext;
  private masterGain: GainNode;
  private recordingDest: MediaStreamAudioDestinationNode;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  constructor() {
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.setValueAtTime(0.8, this.context.currentTime);
    this.recordingDest = this.context.createMediaStreamDestination();
    this.masterGain.connect(this.context.destination);
    this.masterGain.connect(this.recordingDest);
  }

  async resume(): Promise<void> {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  createLayerNode(layer: RectLayer): AudioLayerNode {
    const node = new AudioLayerNode(this.context, this.masterGain);
    node.setOscillatorType(layer.oscillatorType);
    if (layer.sampleBuffer) {
      node.setSampleBuffer(layer.sampleBuffer);
    }
    return node;
  }

  setMasterVolume(vol: number): void {
    this.masterGain.gain.linearRampToValueAtTime(vol, this.context.currentTime + 0.05);
  }

  /** Immediately silence all audio output (used on Stop) */
  silenceAll(): void {
    this.masterGain.gain.cancelScheduledValues(this.context.currentTime);
    this.masterGain.gain.setValueAtTime(0, this.context.currentTime);
  }

  /** Restore master gain to the given volume (used on Play after Stop) */
  restoreVolume(vol: number): void {
    this.masterGain.gain.cancelScheduledValues(this.context.currentTime);
    this.masterGain.gain.setValueAtTime(vol, this.context.currentTime);
  }

  startRecording(): void {
    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(this.recordingDest.stream, {
      mimeType: 'audio/webm; codecs=opus',
    });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.start(100);
  }

  stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(new Blob());
        return;
      }
      this.mediaRecorder.onstop = () => {
        resolve(new Blob(this.recordedChunks, { type: 'audio/webm' }));
      };
      this.mediaRecorder.stop();
    });
  }

  getAudioStream(): MediaStream {
    return this.recordingDest.stream;
  }

  getContext(): AudioContext {
    return this.context;
  }
}
