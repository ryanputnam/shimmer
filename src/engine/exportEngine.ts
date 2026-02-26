import type { AudioEngine } from './AudioEngine';

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function exportAudio(
  audioEngine: AudioEngine,
  format: 'mp3' | 'ogg',
  onProgress?: (pct: number) => void,
): Promise<void> {
  onProgress?.(10);
  const blob = await audioEngine.stopRecording();
  onProgress?.(30);

  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
  const ffmpeg = new FFmpeg();

  ffmpeg.on('progress', ({ progress }) => {
    onProgress?.(30 + progress * 60);
  });

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  onProgress?.(40);
  await ffmpeg.writeFile('input.webm', await fetchFile(blob));
  const mimeType = format === 'mp3' ? 'audio/mpeg' : 'audio/ogg';
  await ffmpeg.exec(['-i', 'input.webm', `output.${format}`]);
  const data = await ffmpeg.readFile(`output.${format}`);
  onProgress?.(95);

  // Cast via unknown to avoid SharedArrayBuffer type issue
  const outBlob = new Blob([data as unknown as ArrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(outBlob);
  triggerDownload(url, `sonimage-export.${format}`);
  onProgress?.(100);
}

export async function exportVideo(
  canvasElement: HTMLCanvasElement,
  audioEngine: AudioEngine,
  onProgress?: (pct: number) => void,
): Promise<void> {
  onProgress?.(5);
  const videoStream = canvasElement.captureStream(30);
  const audioStream = audioEngine.getAudioStream();
  const combined = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioStream.getAudioTracks(),
  ]);

  const recorder = new MediaRecorder(combined, { mimeType: 'video/webm; codecs=vp8,opus' });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
    recorder.start(100);
    (window as any).__videoRecorder = recorder;
    (window as any).__videoRecorderStop = () => recorder.stop();
  });

  onProgress?.(30);
  const blob = new Blob(chunks, { type: 'video/webm' });

  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
  const ffmpeg = new FFmpeg();

  ffmpeg.on('progress', ({ progress }) => {
    onProgress?.(30 + progress * 60);
  });

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  await ffmpeg.writeFile('input.webm', await fetchFile(blob));
  await ffmpeg.exec(['-i', 'input.webm', '-c:v', 'libx264', '-c:a', 'aac', 'output.mp4']);
  const data = await ffmpeg.readFile('output.mp4');
  onProgress?.(95);

  const outBlob = new Blob([data as unknown as ArrayBuffer], { type: 'video/mp4' });
  const url = URL.createObjectURL(outBlob);
  triggerDownload(url, 'sonimage-export.mp4');
  onProgress?.(100);
}
