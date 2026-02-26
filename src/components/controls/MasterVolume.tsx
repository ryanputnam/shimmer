import { useSonimageStore } from '../../store/useSonimageStore';
import type { AudioEngine } from '../../engine/AudioEngine';

interface MasterVolumeProps { audioEngine: AudioEngine | null; }

export function MasterVolume({ audioEngine }: MasterVolumeProps) {
  const { masterVolume, setMasterVolume } = useSonimageStore();
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setMasterVolume(vol);
    audioEngine?.setMasterVolume(vol);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <span className="label">Vol</span>
      <input type="range" min={0} max={1} step={0.01} value={masterVolume} onChange={handleChange} style={{ flex: 1 }} />
      <span className="val" style={{ width: 26, textAlign: 'right' }}>{Math.round(masterVolume * 100)}</span>
    </div>
  );
}
