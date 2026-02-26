import { useSonimageStore } from '../../store/useSonimageStore';
import type { ScaleType } from '../../engine/imageAnalyzer';

// Chromatic note names (A2 root = index 0, matching ROOT_NOTES array)
const NOTE_NAMES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
const SCALE_OPTIONS: { value: ScaleType; label: string }[] = [
  { value: 'pentatonic', label: 'Penta' },
  { value: 'major',      label: 'Major' },
  { value: 'minor',      label: 'Minor' },
  { value: 'wholetone',  label: 'Whole' },
  { value: 'chromatic',  label: 'Chrom' },
];

export function KeyControl() {
  const { imageProfile, rootOverride, scaleOverride, setRootOverride, setScaleOverride } = useSonimageStore();

  if (!imageProfile) return null;

  // The effective root index = image root index + semitone offset
  const imageRootIdx = Math.round(Math.log2(imageProfile.rootHz / 110) * 12) % 12;
  const effectiveIdx = rootOverride !== null
    ? ((imageRootIdx + rootOverride) % 12 + 12) % 12
    : imageRootIdx;
  const effectiveScale = scaleOverride ?? imageProfile.scale;

  const handleNoteClick = (idx: number) => {
    if (idx === imageRootIdx && rootOverride === null) return; // already at image default
    const semitones = ((idx - imageRootIdx) % 12 + 12) % 12;
    // Use +/- 6 range for cleaner transposition
    const offset = semitones > 6 ? semitones - 12 : semitones;
    if (offset === 0) {
      setRootOverride(null); // reset to image default
    } else {
      setRootOverride(offset);
    }
  };

  const handleScaleChange = (scale: ScaleType) => {
    if (scale === imageProfile.scale && rootOverride === null) {
      setScaleOverride(null);
    } else {
      setScaleOverride(scale);
    }
  };

  const isOverridden = rootOverride !== null || scaleOverride !== null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* Key label */}
      <span style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.05em', flexShrink: 0 }}>
        KEY
      </span>

      {/* 12 note buttons */}
      <div style={{ display: 'flex', gap: 2 }}>
        {NOTE_NAMES.map((name, idx) => {
          const isActive = idx === effectiveIdx;
          const isImageRoot = idx === imageRootIdx;
          const isBlack = name.includes('#');
          return (
            <button
              key={idx}
              onClick={() => handleNoteClick(idx)}
              title={isImageRoot ? `${name} (image root)` : name}
              style={{
                width: isBlack ? 18 : 22,
                height: 22,
                padding: 0,
                fontSize: 9,
                fontWeight: isActive ? 700 : 400,
                background: isActive
                  ? 'var(--accent)'
                  : isImageRoot
                    ? 'var(--bg-3)'
                    : isBlack
                      ? 'var(--bg-1)'
                      : 'var(--bg-2)',
                color: isActive ? '#fff' : isBlack ? 'var(--text-2)' : 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 3,
                cursor: 'pointer',
                flexShrink: 0,
                lineHeight: '22px',
                textAlign: 'center',
              }}
            >
              {name}
            </button>
          );
        })}
      </div>

      {/* Scale selector */}
      <div style={{ display: 'flex', gap: 2 }}>
        {SCALE_OPTIONS.map(({ value, label }) => {
          const isActive = value === effectiveScale;
          return (
            <button
              key={value}
              onClick={() => handleScaleChange(value)}
              style={{
                height: 22,
                padding: '0 6px',
                fontSize: 9,
                fontWeight: isActive ? 700 : 400,
                background: isActive ? 'var(--accent)' : 'var(--bg-2)',
                color: isActive ? '#fff' : 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 3,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Reset button — only show when overridden */}
      {isOverridden && (
        <button
          onClick={() => { setRootOverride(null); setScaleOverride(null); }}
          title="Reset to image defaults"
          style={{
            height: 22,
            padding: '0 6px',
            fontSize: 9,
            background: 'transparent',
            color: 'var(--text-3)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          ↺
        </button>
      )}
    </div>
  );
}
