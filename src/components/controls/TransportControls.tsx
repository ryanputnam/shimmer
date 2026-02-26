import { useSonimageStore } from '../../store/useSonimageStore';
import type { AudioEngine } from '../../engine/AudioEngine';

interface TransportControlsProps {
  audioEngine: AudioEngine | null;
}

export function TransportControls({ audioEngine }: TransportControlsProps) {
  const { isPlaying, isRecording, setPlaying, setRecording, masterVolume } = useSonimageStore();

  const handlePlay = async () => {
    if (!audioEngine) return;
    await audioEngine.resume();
    audioEngine.restoreVolume(masterVolume);
    setPlaying(true);
  };

  const handlePause = () => { setPlaying(false); audioEngine?.silenceAll(); };

  const handleStop = () => {
    setPlaying(false);
    audioEngine?.silenceAll();
    useSonimageStore.setState((s) => ({ layers: s.layers.map((l) => ({ ...l, scanX: 0 })) }));
  };

  const handleRecord = async () => {
    if (!audioEngine) return;
    if (isRecording) { setRecording(false); setPlaying(false); audioEngine.silenceAll(); return; }
    await audioEngine.resume();
    audioEngine.restoreVolume(masterVolume);
    audioEngine.startRecording();
    setRecording(true);
    setPlaying(true);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button
        className={`btn ${isPlaying ? 'active' : ''}`}
        onClick={isPlaying ? handlePause : handlePlay}
        style={{ padding: '5px 12px', fontSize: 13 }}
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button className="btn" onClick={handleStop} style={{ padding: '5px 10px', fontSize: 13 }} title="Stop">■</button>
      <button
        className="btn"
        onClick={handleRecord}
        style={isRecording
          ? { padding: '5px 10px', fontSize: 13, background: 'var(--red)', borderColor: 'transparent', color: '#fff', boxShadow: '0 2px 8px rgba(224,85,85,0.45)' }
          : { padding: '5px 10px', fontSize: 13 }
        }
        title="Record"
      >
        ●
      </button>
    </div>
  );
}
