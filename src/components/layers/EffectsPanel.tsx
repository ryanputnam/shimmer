import { useState } from 'react';
import type { LayerEffects } from '../../types';
import { Slider } from '../ui/Slider';

interface EffectSectionProps {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function EffectSection({ label, enabled, onToggle, children, defaultOpen = false }: EffectSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      background: 'var(--bg-2)',
      border: `1px solid ${enabled ? 'var(--accent-dim, var(--border))' : 'var(--border)'}`,
      borderRadius: 'var(--radius-sm)',
      overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
        {/* Toggle pill */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`toggle ${enabled ? 'on' : 'off'}`}
          title={enabled ? 'Disable' : 'Enable'}
        >
          <span className="toggle-thumb" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
          style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', gap: 4 }}
        >
          <span className="label" style={{ color: enabled ? 'var(--text)' : 'var(--text-3)', transition: 'color 0.15s' }}>{label}</span>
          <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-3)' }}>{open ? '▲' : '▼'}</span>
        </button>
      </div>
      {open && (
        <div style={{ padding: '4px 10px 10px', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-3)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

interface EffectsPanelProps {
  layerId: string;
  effects: LayerEffects;
  onEffectsChange: (id: string, patch: Partial<LayerEffects>) => void;
}

export function EffectsPanel({ layerId, effects: fx, onEffectsChange }: EffectsPanelProps) {
  // Auto-enable an effect when a slider is moved while it's disabled
  const patch = (p: Partial<LayerEffects>, autoEnableKey?: keyof LayerEffects) => {
    const extra: Partial<LayerEffects> = {};
    if (autoEnableKey && !fx[autoEnableKey]) {
      (extra as any)[autoEnableKey] = true;
    }
    onEffectsChange(layerId, { ...extra, ...p });
  };

  const anyActive = fx.reverbEnabled || fx.delayEnabled || fx.distortionEnabled ||
    fx.flangerEnabled || fx.chorusEnabled || fx.eqEnabled;

  return (
    <div style={{ padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 5 }} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
        <span className="label" style={{ flex: 1 }}>Effects</span>
        {anyActive && (
          <button
            className="btn"
            style={{ fontSize: 9, padding: '2px 6px', color: 'var(--text-3)' }}
            onClick={() => onEffectsChange(layerId, {
              reverbEnabled: false, delayEnabled: false, distortionEnabled: false,
              flangerEnabled: false, chorusEnabled: false, eqEnabled: false,
            })}
          >
            All off
          </button>
        )}
      </div>

      <EffectSection label="Reverb" enabled={fx.reverbEnabled} onToggle={() => patch({ reverbEnabled: !fx.reverbEnabled })} defaultOpen={fx.reverbEnabled}>
        <Slider label="Mix" value={fx.reverbMix} min={0} max={1} step={0.01}
          onChange={v => patch({ reverbMix: v }, 'reverbEnabled')} />
        <Slider label="Decay" value={fx.reverbDecay} min={0.1} max={10} step={0.1}
          onChange={v => patch({ reverbDecay: v }, 'reverbEnabled')} unit="s" />
      </EffectSection>

      <EffectSection label="Delay" enabled={fx.delayEnabled} onToggle={() => patch({ delayEnabled: !fx.delayEnabled })} defaultOpen={fx.delayEnabled}>
        <Slider label="Time" value={fx.delayTime} min={0.01} max={1} step={0.01}
          onChange={v => patch({ delayTime: v }, 'delayEnabled')} unit="s" />
        <Slider label="Feedback" value={fx.delayFeedback} min={0} max={0.95} step={0.01}
          onChange={v => patch({ delayFeedback: v }, 'delayEnabled')} />
        <Slider label="Mix" value={fx.delayMix} min={0} max={1} step={0.01}
          onChange={v => patch({ delayMix: v }, 'delayEnabled')} />
      </EffectSection>

      <EffectSection label="Distortion" enabled={fx.distortionEnabled} onToggle={() => patch({ distortionEnabled: !fx.distortionEnabled })}>
        <Slider label="Amount" value={fx.distortionAmount} min={0} max={400} step={1}
          onChange={v => patch({ distortionAmount: v }, 'distortionEnabled')} />
      </EffectSection>

      <EffectSection label="Flanger" enabled={fx.flangerEnabled} onToggle={() => patch({ flangerEnabled: !fx.flangerEnabled })}>
        <Slider label="Rate" value={fx.flangerRate} min={0.1} max={5} step={0.1}
          onChange={v => patch({ flangerRate: v }, 'flangerEnabled')} unit=" Hz" />
        <Slider label="Depth" value={fx.flangerDepth} min={0.001} max={0.01} step={0.0005}
          onChange={v => patch({ flangerDepth: v }, 'flangerEnabled')} />
        <Slider label="Mix" value={fx.flangerMix} min={0} max={1} step={0.01}
          onChange={v => patch({ flangerMix: v }, 'flangerEnabled')} />
      </EffectSection>

      <EffectSection label="Chorus" enabled={fx.chorusEnabled} onToggle={() => patch({ chorusEnabled: !fx.chorusEnabled })}>
        <Slider label="Rate" value={fx.chorusRate} min={0.1} max={4} step={0.1}
          onChange={v => patch({ chorusRate: v }, 'chorusEnabled')} unit=" Hz" />
        <Slider label="Depth" value={fx.chorusDepth} min={0.001} max={0.02} step={0.001}
          onChange={v => patch({ chorusDepth: v }, 'chorusEnabled')} />
        <Slider label="Mix" value={fx.chorusMix} min={0} max={1} step={0.01}
          onChange={v => patch({ chorusMix: v }, 'chorusEnabled')} />
      </EffectSection>

      <EffectSection label="EQ" enabled={fx.eqEnabled} onToggle={() => patch({ eqEnabled: !fx.eqEnabled })}>
        <Slider label="Low" value={fx.eqLowGain} min={-12} max={12} step={0.5}
          onChange={v => patch({ eqLowGain: v }, 'eqEnabled')} unit=" dB" />
        <Slider label="Mid Freq" value={fx.eqMidFreq} min={200} max={5000} step={50}
          onChange={v => patch({ eqMidFreq: v }, 'eqEnabled')} unit=" Hz" />
        <Slider label="Mid" value={fx.eqMidGain} min={-12} max={12} step={0.5}
          onChange={v => patch({ eqMidGain: v }, 'eqEnabled')} unit=" dB" />
        <Slider label="High" value={fx.eqHighGain} min={-12} max={12} step={0.5}
          onChange={v => patch({ eqHighGain: v }, 'eqEnabled')} unit=" dB" />
      </EffectSection>
    </div>
  );
}
