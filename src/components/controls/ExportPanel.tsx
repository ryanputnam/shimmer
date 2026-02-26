import { useState } from 'react';
import { useSonimageStore } from '../../store/useSonimageStore';
import type { AudioEngine } from '../../engine/AudioEngine';
import { ProgressBar } from '../ui/ProgressBar';

interface ExportPanelProps {
  audioEngine: AudioEngine | null;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function ExportPanel({ audioEngine, overlayCanvasRef }: ExportPanelProps) {
  const [format, setFormat] = useState<'mp3' | 'ogg' | 'mp4'>('mp3');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { isRecording, setRecording, setPlaying } = useSonimageStore();

  const handleExport = async () => {
    if (!audioEngine) return;
    setExporting(true); setProgress(0); setError(null);
    try {
      if (format === 'mp4') {
        const { exportVideo } = await import('../../engine/exportEngine');
        if (!overlayCanvasRef.current) throw new Error('Canvas not ready');
        await exportVideo(overlayCanvasRef.current, audioEngine, setProgress);
      } else {
        if (isRecording) { setRecording(false); setPlaying(false); }
        const { exportAudio } = await import('../../engine/exportEngine');
        await exportAudio(audioEngine, format, setProgress);
      }
    } catch (e: any) { setError(e.message ?? 'Export failed'); }
    finally { setExporting(false); setProgress(0); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <select value={format} onChange={(e) => setFormat(e.target.value as any)} disabled={exporting}>
        <option value="mp3">MP3</option>
        <option value="ogg">OGG</option>
        <option value="mp4">MP4</option>
      </select>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="btn"
        style={{ color: 'var(--text)', borderColor: 'var(--border-2)' }}
      >
        {exporting ? `${Math.round(progress * 100)}%` : 'Export'}
      </button>
      {exporting && <div style={{ width: 56 }}><ProgressBar value={progress} /></div>}
      {error && <span style={{ color: 'var(--red)', fontSize: 10 }}>{error}</span>}
    </div>
  );
}
