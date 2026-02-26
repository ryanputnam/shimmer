export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

const LAYER_COLORS = [
  '#00d4ff', '#ff6b6b', '#51cf66', '#fcc419', '#cc5de8',
  '#ff8cc8', '#74c0fc', '#a9e34b', '#ff922b', '#63e6be',
];

let colorIndex = 0;
export function nextLayerColor(): string {
  return LAYER_COLORS[colorIndex++ % LAYER_COLORS.length];
}

export function resetColorIndex() { colorIndex = 0; }
