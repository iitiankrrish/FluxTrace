export function valueHue(v: number): number {
  const n = Number.isFinite(v) ? Math.round(v) : 0;
  return ((((n % 12) + 12) % 12) * 30 + 200) % 360;
}

export interface BoxColors {
  fill: string;
  border: string;
  text: string;
}

export function boxColors(v: number | boolean): BoxColors {
  if (typeof v === 'boolean') {
    return v
      ? { fill: '#dcebdf', border: '#9cc0a5', text: '#335a3f' }
      : { fill: '#f3dde0', border: '#d5a4ab', text: '#7a3a45' };
  }
  const h = valueHue(v);
  return { fill: `hsl(${h} 42% 92%)`, border: `hsl(${h} 22% 72%)`, text: `hsl(${h} 30% 28%)` };
}

export function pixelShade(v: number, min: number, max: number): { fill: string; text: string } {
  const t = max === min ? 0.5 : Math.max(0, Math.min(1, (v - min) / (max - min)));
  const light = 94 - t * 50;
  return { fill: `hsl(${(250 - t * 40).toFixed(0)} 28% ${light.toFixed(0)}%)`, text: light < 62 ? '#f7f5f0' : '#3a3f4a' };
}
