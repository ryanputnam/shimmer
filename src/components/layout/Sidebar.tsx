import { useSonimageStore } from '../../store/useSonimageStore';
import { LayerList } from '../layers/LayerList';
import type { AudioLayerNode } from '../../engine/AudioLayerNode';
import type { AudioEngine } from '../../engine/AudioEngine';
import type { OscillatorType, LayerEffects } from '../../types';

interface SidebarProps {
  audioNodeMap: Map<string, AudioLayerNode>;
  audioEngine: AudioEngine | null;
  onSampleLoad: (id: string, buffer: AudioBuffer) => void;
  onSampleClear: (id: string) => void;
  onOscillatorChange: (id: string, type: OscillatorType) => void;
  onEffectsChange: (id: string, patch: Partial<LayerEffects>) => void;
}

export function Sidebar({ audioEngine, onSampleLoad, onSampleClear, onOscillatorChange, onEffectsChange }: SidebarProps) {
  const layerCount = useSonimageStore((s) => s.layers.length);
  return (
    <aside style={{
      width: 232,
      flexShrink: 0,
      alignSelf: 'stretch',
      background: 'var(--bg-2)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        height: 36,
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span className="label">Layers</span>
        {layerCount > 0 && (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-3)',
            background: 'var(--bg-4)',
            borderRadius: 99,
            padding: '1px 7px',
          }}>{layerCount}</span>
        )}
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <LayerList
          audioEngine={audioEngine}
          onSampleLoad={onSampleLoad}
          onSampleClear={onSampleClear}
          onOscillatorChange={onOscillatorChange}
          onEffectsChange={onEffectsChange}
        />
      </div>
    </aside>
  );
}
