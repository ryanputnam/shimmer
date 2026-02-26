import { useState, useRef } from 'react';
import { SpectrumCanvas } from './SpectrumCanvas';
import { useSonimageStore } from '../../store/useSonimageStore';
import type { RectLayer, OscillatorType, LayerEffects, ScanDirection } from '../../types';
import { Slider } from '../ui/Slider';
import { EffectsPanel } from './EffectsPanel';

const ARCHETYPE_ICONS: Record<string, string> = {
  tonal:           '〜',
  rhythmic:        '◈',
  textural:        '░',
  sub:             '▽',
  spectral:        '◉',
  chromatic_noise: '✕',
};

// ── Tweak param definitions per archetype ────────────────────────────────────
// Each entry: { key, label, min, max, step, format? }
type TweakDef = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
};

const SHARED_TWEAKS: TweakDef[] = [
  { key: 'spectralSmoothing', label: 'Texture',  min: 0.2, max: 12,  step: 0.1,  format: (v) => v.toFixed(1) },
  { key: 'detuneSpread',      label: 'Detune',   min: 0,   max: 80,  step: 1,    format: (v) => `${v}¢` },
  { key: 'stereoWidth',       label: 'Width',    min: 0,   max: 1,   step: 0.01, format: (v) => `${Math.round(v*100)}%` },
  { key: 'outputGain',        label: 'Level',    min: 0.1, max: 1.5, step: 0.01, format: (v) => `${Math.round(v*100)}%` },
];

const ARCHETYPE_TWEAKS: Record<string, TweakDef[]> = {
  tonal: [
    { key: 'harmonicRichness', label: 'Harmonics', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v*100)}%` },
    { key: 'attackTime',       label: 'Attack',    min: 0.001, max: 0.5, step: 0.001, format: (v) => v < 0.1 ? `${Math.round(v*1000)}ms` : `${v.toFixed(2)}s` },
    { key: 'releaseTime',      label: 'Release',   min: 0.01,  max: 2.0, step: 0.01,  format: (v) => v < 1 ? `${Math.round(v*1000)}ms` : `${v.toFixed(1)}s` },
  ],
  rhythmic: [
    { key: 'triggerThreshold', label: 'Sensitivity', min: 0.01, max: 0.9, step: 0.01, format: (v) => `${Math.round(v*100)}%` },
    { key: 'attackTime',       label: 'Attack',      min: 0.001, max: 0.3, step: 0.001, format: (v) => `${Math.round(v*1000)}ms` },
    { key: 'releaseTime',      label: 'Release',     min: 0.01, max: 1.5, step: 0.01,  format: (v) => v < 1 ? `${Math.round(v*1000)}ms` : `${v.toFixed(1)}s` },
  ],
  textural: [
    { key: 'grainDensity', label: 'Grain Rate',  min: 1,  max: 80, step: 1, format: (v) => `${v}/s` },
    { key: 'grainWidth',   label: 'Grain Width', min: 1,  max: 12, step: 1, format: (v) => `${v}` },
    { key: 'harmonicRichness', label: 'Roughness', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v*100)}%` },
  ],
  sub: [
    { key: 'harmonicRichness', label: 'Harmonics', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v*100)}%` },
    { key: 'attackTime',       label: 'Attack',    min: 0.001, max: 0.5, step: 0.005, format: (v) => v < 0.1 ? `${Math.round(v*1000)}ms` : `${v.toFixed(2)}s` },
    { key: 'releaseTime',      label: 'Release',   min: 0.1,  max: 3.0, step: 0.05,  format: (v) => `${v.toFixed(1)}s` },
  ],
  spectral: [
    { key: 'harmonicRichness', label: 'Harmonics', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v*100)}%` },
    { key: 'attackTime',       label: 'Attack',    min: 0.001, max: 0.5, step: 0.001, format: (v) => v < 0.1 ? `${Math.round(v*1000)}ms` : `${v.toFixed(2)}s` },
    { key: 'releaseTime',      label: 'Release',   min: 0.01,  max: 2.0, step: 0.01,  format: (v) => v < 1 ? `${Math.round(v*1000)}ms` : `${v.toFixed(1)}s` },
  ],
  chromatic_noise: [
    { key: 'grainDensity', label: 'Density',  min: 1,  max: 80, step: 1, format: (v) => `${v}/s` },
    { key: 'grainWidth',   label: 'Spread',   min: 1,  max: 12, step: 1, format: (v) => `${v}` },
  ],
};

// ── Component ─────────────────────────────────────────────────────────────────
interface LayerItemProps {
  layer: RectLayer;
  audioContext: AudioContext | null;
  onSampleLoad?: (id: string, buffer: AudioBuffer) => void;
  onSampleClear?: (id: string) => void;
  onOscillatorChange?: (id: string, type: OscillatorType) => void;
  onEffectsChange?: (id: string, patch: Partial<LayerEffects>) => void;
}

export function LayerItem({
  layer, audioContext, onSampleLoad, onSampleClear, onEffectsChange
}: LayerItemProps) {
  const { updateLayer, toggleMute, removeLayer, selectLayer, selectedLayerId,
          setGeneratedMode, setParamOverride, imageProfile } = useSonimageStore();
  const isSelected = selectedLayerId === layer.id;
  const [showEffects, setShowEffects] = useState(false);
  const [showTweak, setShowTweak] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);

  const activeEffectCount = [
    layer.effects.reverbEnabled, layer.effects.delayEnabled, layer.effects.distortionEnabled,
    layer.effects.flangerEnabled, layer.effects.chorusEnabled, layer.effects.eqEnabled,
  ].filter(Boolean).length;

  const generatedModes = imageProfile?.generatedModes ?? [];
  const currentMode = generatedModes.find(m => m.id === layer.generatedModeId)
    ?? generatedModes[0] ?? null;

  const archetype = currentMode?.archetype ?? 'tonal';
  const archetypeTweaks = ARCHETYPE_TWEAKS[archetype] ?? [];
  const overrides: Record<string, number> = layer.paramOverrides ?? {};

  // Get the effective value: override first, then base mode param, then fallback
  const effectiveValue = (def: TweakDef): number => {
    if (overrides[def.key] !== undefined) return overrides[def.key] as number;
    if (currentMode?.params) {
      const v = (currentMode.params as unknown as Record<string, unknown>)[def.key];
      if (typeof v === 'number') return v;
    }
    return (def.min + def.max) / 2;
  };

  const hasOverrides = Object.keys(overrides).length > 0;

  const handleSampleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !audioContext) return;
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    onSampleLoad?.(layer.id, audioBuffer);
    e.target.value = '';
  };

  return (
    <div
      onClick={() => selectLayer(layer.id)}
      style={{
        background: isSelected ? 'var(--bg-3)' : 'var(--bg-2)',
        border: `1px solid ${isSelected ? 'var(--border-2)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        borderLeft: `3px solid ${layer.color}`,
        cursor: 'pointer',
        boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'background 0.15s, box-shadow 0.15s',
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '7px 8px 5px 10px', gap: 4 }}>
        {editingLabel ? (
          <input
            ref={labelInputRef}
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={() => {
              const trimmed = labelDraft.trim();
              if (trimmed) updateLayer(layer.id, { label: trimmed });
              setEditingLabel(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.currentTarget.blur(); }
              if (e.key === 'Escape') { setEditingLabel(false); }
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1, fontSize: 12, fontWeight: 600,
              background: 'var(--bg-4)', color: 'var(--text)',
              border: '1px solid var(--accent)', borderRadius: 4,
              padding: '1px 5px', outline: 'none', minWidth: 0,
            }}
          />
        ) : (
          <span
            title="Double-click to rename"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setLabelDraft(layer.label);
              setEditingLabel(true);
              setTimeout(() => { labelInputRef.current?.select(); }, 0);
            }}
            style={{
              flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              cursor: 'text',
            }}
          >
            {layer.label}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setShowEffects(s => !s); if (showTweak && !showEffects) setShowTweak(false); }}
          className="btn"
          style={{
            padding: '3px 7px', fontSize: 10,
            background: showEffects ? 'var(--accent)' : activeEffectCount > 0 ? 'var(--accent-dim)' : 'transparent',
            color: showEffects ? '#fff' : activeEffectCount > 0 ? 'var(--accent)' : 'var(--text-3)',
            borderColor: showEffects ? 'transparent' : activeEffectCount > 0 ? 'var(--accent)' : 'var(--border)',
            boxShadow: showEffects ? '0 2px 8px rgba(110,156,245,0.4)' : 'none',
          }}
        >
          FX{activeEffectCount > 0 ? ` ·${activeEffectCount}` : ''}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); toggleMute(layer.id); }}
          className="btn"
          style={{
            padding: '3px 7px', fontSize: 10,
            background: layer.muted ? 'var(--bg-5)' : 'transparent',
            color: layer.muted ? 'var(--text-2)' : 'var(--text-3)',
            borderColor: layer.muted ? 'var(--border-2)' : 'var(--border)',
          }}
        >
          {layer.muted ? 'Muted' : 'M'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }}
          className="btn danger"
          style={{ padding: '3px 7px', fontSize: 10 }}
        >✕</button>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '2px 10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Slider label="Volume" value={layer.volume} min={0} max={1} step={0.01}
          onChange={(v) => updateLayer(layer.id, { volume: v })} />
        <Slider label="Speed" value={layer.scanSpeed} min={5} max={500} step={5}
          onChange={(v) => updateLayer(layer.id, { scanSpeed: v })} unit=" px/s" />

        {/* ── Scan direction ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="label" style={{ flex: 1 }}>Direction</span>
          {([
            { dir: 'horizontal',    icon: '→',  title: 'Horizontal (left → right)' },
            { dir: 'vertical',      icon: '↓',  title: 'Vertical (top → bottom)' },
            { dir: 'diagonal-down', icon: '↘',  title: 'Diagonal down' },
            { dir: 'diagonal-up',   icon: '↗',  title: 'Diagonal up' },
          ] as { dir: ScanDirection; icon: string; title: string }[]).map(({ dir, icon, title }) => {
            const active = (layer.scanDirection ?? 'horizontal') === dir;
            return (
              <button
                key={dir}
                title={title}
                onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { scanDirection: dir, scanPos: 0, scanX: 0 }); }}
                className="btn"
                style={{
                  padding: '3px 8px', fontSize: 13, lineHeight: 1,
                  background: active ? 'var(--accent-dim)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-3)',
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {icon}
              </button>
            );
          })}
        </div>

        {/* ── Mode selector ── */}
        {generatedModes.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="label">Sound</span>
            {/* Mode pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {generatedModes.map((mode) => {
                const active = mode.id === (layer.generatedModeId ?? generatedModes[0]?.id);
                return (
                  <button
                    key={mode.id}
                    onClick={(e) => { e.stopPropagation(); setGeneratedMode(layer.id, mode.id); }}
                    title={mode.description}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 9px',
                      borderRadius: 99,
                      fontSize: 11,
                      fontWeight: active ? 600 : 400,
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      background: active ? 'var(--accent-dim)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-2)',
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                    }}
                  >
                    <span style={{ fontSize: 10, opacity: 0.8 }}>
                      {ARCHETYPE_ICONS[mode.archetype] ?? '·'}
                    </span>
                    {mode.name}
                  </button>
                );
              })}
            </div>
            {/* Current mode description + Tweak toggle */}
            {currentMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ flex: 1, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.4 }}>
                  {currentMode.description}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowTweak(s => !s); if (showEffects && !showTweak) setShowEffects(false); }}
                  className="btn"
                  style={{
                    padding: '3px 8px', fontSize: 10, flexShrink: 0,
                    background: showTweak ? 'var(--accent)' : hasOverrides ? 'var(--accent-dim)' : 'transparent',
                    color: showTweak ? '#fff' : hasOverrides ? 'var(--accent)' : 'var(--text-3)',
                    borderColor: showTweak ? 'transparent' : hasOverrides ? 'var(--accent)' : 'var(--border)',
                    boxShadow: showTweak ? '0 2px 8px rgba(110,156,245,0.3)' : 'none',
                  }}
                >
                  Tweak{hasOverrides ? ' ·' : ''}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
            Load an image to generate sounds
          </div>
        )}

        {/* ── Live spectrum visualizer ── */}
        {generatedModes.length > 0 && (
          <SpectrumCanvas
            layerId={layer.id}
            archetype={archetype}
            color={layer.color}
            height={44}
          />
        )}

        {/* ── Sample ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ flex: 1, fontSize: 10, color: 'var(--text-3)' }}>
            {layer.soundSource === 'sample' ? '🎵 Sample loaded' : 'Synth'}
          </span>
          <label
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 10, color: 'var(--accent)', cursor: 'pointer', fontWeight: 500 }}
          >
            {layer.soundSource === 'sample' ? 'Change' : 'Load sample'}
            <input type="file" accept="audio/*" style={{ display: 'none' }}
              onChange={handleSampleUpload} />
          </label>
          {layer.soundSource === 'sample' && (
            <button
              className="btn danger"
              style={{ padding: '2px 6px', fontSize: 10 }}
              onClick={(e) => { e.stopPropagation(); onSampleClear?.(layer.id); }}
            >✕</button>
          )}
        </div>
      </div>

      {/* ── Tweak panel ── */}
      {showTweak && currentMode && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            borderTop: '1px solid var(--border)',
            padding: '10px 12px 12px',
            display: 'flex', flexDirection: 'column', gap: 2,
            background: 'var(--bg-1)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          }}
        >
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {ARCHETYPE_ICONS[archetype]} {currentMode.name}
            </span>
            {hasOverrides && (
              <button
                className="btn"
                onClick={(e) => { e.stopPropagation(); setParamOverride(layer.id, {}); }}
                style={{ padding: '2px 8px', fontSize: 10, color: 'var(--text-3)', borderColor: 'var(--border)' }}
              >
                Reset
              </button>
            )}
          </div>

          {/* Pitch control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 22, marginBottom: 6, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <span style={{
              width: 72, fontSize: 10, flexShrink: 0, fontWeight: layer.pitchSemitones !== 0 ? 500 : 400,
              color: layer.pitchSemitones !== 0 ? 'var(--accent)' : 'var(--text-3)',
            }}>
              Pitch
            </span>
            <input
              type="range"
              min={-24}
              max={24}
              step={1}
              value={layer.pitchSemitones ?? 0}
              onChange={(e) => updateLayer(layer.id, { pitchSemitones: parseInt(e.target.value) })}
              style={{ flex: 1, minWidth: 0, accentColor: layer.pitchSemitones !== 0 ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', height: 2 }}
            />
            <span style={{
              width: 36, fontSize: 10, textAlign: 'right', flexShrink: 0,
              color: layer.pitchSemitones !== 0 ? 'var(--accent)' : 'var(--text-3)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {layer.pitchSemitones > 0 ? `+${layer.pitchSemitones}` : `${layer.pitchSemitones ?? 0}`}st
            </span>
            {(layer.pitchSemitones ?? 0) !== 0 && (
              <button
                className="btn"
                onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { pitchSemitones: 0 }); }}
                style={{ padding: '1px 6px', fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}
                title="Reset pitch"
              >↺</button>
            )}
          </div>

          {/* Shared tweaks */}
          <div style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Global</span>
          </div>
          {SHARED_TWEAKS.map((def) => (
            <TweakSlider
              key={def.key}
              def={def}
              value={effectiveValue(def)}
              isOverridden={overrides[def.key] !== undefined}
              onChange={(v) => setParamOverride(layer.id, { [def.key]: v })}
            />
          ))}

          {/* Archetype-specific tweaks */}
          {archetypeTweaks.length > 0 && (
            <>
              <div style={{ marginTop: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {archetype.replace('_', ' ')}
                </span>
              </div>
              {archetypeTweaks.map((def) => (
                <TweakSlider
                  key={def.key}
                  def={def}
                  value={effectiveValue(def)}
                  isOverridden={overrides[def.key] !== undefined}
                  onChange={(v) => setParamOverride(layer.id, { [def.key]: v })}
                />
              ))}
            </>
          )}
        {/* ── Quick FX sends ── */}
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <div style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sends</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 22 }}>
            <span style={{ width: 72, fontSize: 10, color: layer.effects.reverbEnabled ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}>Reverb</span>
            <input
              type="range" min={0} max={1} step={0.01}
              value={layer.effects.reverbMix}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                onEffectsChange?.(layer.id, { reverbMix: v, reverbEnabled: v > 0 });
              }}
              style={{ flex: 1, minWidth: 0, accentColor: layer.effects.reverbEnabled ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', height: 2 }}
            />
            <span style={{ width: 36, fontSize: 10, textAlign: 'right', flexShrink: 0, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
              {layer.effects.reverbMix.toFixed(2)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 22 }}>
            <span style={{ width: 72, fontSize: 10, color: layer.effects.delayEnabled ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}>Delay</span>
            <input
              type="range" min={0} max={1} step={0.01}
              value={layer.effects.delayMix}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                onEffectsChange?.(layer.id, { delayMix: v, delayEnabled: v > 0 });
              }}
              style={{ flex: 1, minWidth: 0, accentColor: layer.effects.delayEnabled ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', height: 2 }}
            />
            <span style={{ width: 36, fontSize: 10, textAlign: 'right', flexShrink: 0, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
              {layer.effects.delayMix.toFixed(2)}
            </span>
          </div>
        </div>
        </div>
      )}

      {/* ── Effects panel ── */}
      {showEffects && onEffectsChange && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <EffectsPanel layerId={layer.id} effects={layer.effects}
            onEffectsChange={onEffectsChange} />
        </div>
      )}
    </div>
  );
}

// ── TweakSlider sub-component ─────────────────────────────────────────────────
function TweakSlider({
  def, value, isOverridden, onChange,
}: {
  def: TweakDef;
  value: number;
  isOverridden: boolean;
  onChange: (v: number) => void;
}) {
  const displayVal = def.format ? def.format(value) : value.toFixed(2);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 22, overflow: 'hidden' }}>
      <span style={{
        width: 72, fontSize: 10, color: isOverridden ? 'var(--accent)' : 'var(--text-3)',
        flexShrink: 0, fontWeight: isOverridden ? 500 : 400,
      }}>
        {def.label}
      </span>
      <input
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, minWidth: 0, accentColor: isOverridden ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', height: 2 }}
      />
      <span style={{
        width: 36, fontSize: 10, textAlign: 'right', flexShrink: 0,
        color: isOverridden ? 'var(--accent)' : 'var(--text-3)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {displayVal}
      </span>
    </div>
  );
}
