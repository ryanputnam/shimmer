import { useSonimageStore } from '../../store/useSonimageStore';
import { LayerItem } from './LayerItem';
import type { AudioEngine } from '../../engine/AudioEngine';
import type { OscillatorType, LayerEffects } from '../../types';

interface LayerListProps {
  audioEngine: AudioEngine | null;
  onSampleLoad: (id: string, buffer: AudioBuffer) => void;
  onSampleClear: (id: string) => void;
  onOscillatorChange: (id: string, type: OscillatorType) => void;
  onEffectsChange: (id: string, patch: Partial<LayerEffects>) => void;
}

export function LayerList({ audioEngine, onSampleLoad, onSampleClear, onOscillatorChange, onEffectsChange }: LayerListProps) {
  const layers = useSonimageStore((s) => s.layers);
  if (layers.length === 0) {
    return (
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}>
        <p className="label" style={{ lineHeight: 1.8, color: 'var(--text-3)' }}>
          Draw rectangles on the image<br/>to create sound layers
        </p>
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflowY: 'auto', overflowX: 'hidden', padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {layers.map((layer) => (
        <LayerItem
          key={layer.id}
          layer={layer}
          audioContext={audioEngine?.getContext() ?? null}
          onSampleLoad={onSampleLoad}
          onSampleClear={onSampleClear}
          onOscillatorChange={onOscillatorChange}
          onEffectsChange={onEffectsChange}
        />
      ))}
    </div>
  );
}
