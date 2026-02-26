import type { SaveFile, SerializedLayer, RectLayer } from '../types';

export function serializeComposition(imageDataUrl: string, layers: RectLayer[]): SaveFile {
  const serializedLayers: SerializedLayer[] = layers.map(l => ({
    id: l.id,
    x: l.x,
    y: l.y,
    width: l.width,
    height: l.height,
    scanX: l.scanX,
    scanPos: l.scanPos ?? 0,
    scanSpeed: l.scanSpeed,
    scanDirection: l.scanDirection ?? 'horizontal',
    volume: l.volume,
    muted: l.muted,
    generatedModeId: l.generatedModeId,
    pixelMode: l.pixelMode,
    soundSource: l.soundSource,
    oscillatorType: l.oscillatorType,
    color: l.color,
    label: l.label,
    effects: { ...l.effects },
    paramOverrides: l.paramOverrides ?? {},
    pitchSemitones: l.pitchSemitones ?? 0,
  }));
  return { version: 1, imageDataUrl, layers: serializedLayers };
}

export function saveToFile(save: SaveFile): void {
  const json = JSON.stringify(save);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sonimage-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function loadFromFile(): Promise<SaveFile> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error('No file selected')); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const save = JSON.parse(e.target?.result as string) as SaveFile;
          if (save.version !== 1) throw new Error('Unknown save format');
          resolve(save);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}
