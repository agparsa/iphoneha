/**
 * Colour helpers for brand colours we don't control (each credit service's
 * own colour). Several are too light for white text or for small coloured
 * text on the warm page background, so text-bearing uses get a darkened
 * shade that still reads as the same colour.
 */

function channels(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1]!, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an rgb triple. */
function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two luminances. */
function ratio(a: number, b: number): number {
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

const toHex = (rgb: [number, number, number]) =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/**
 * The colour, darkened only as much as needed so that white text on it — and
 * the colour as small text on the store's light surfaces — reaches `target`
 * (default 5.2:1 against white, which keeps ≥ 4.5:1 on the warm #f6f3ee
 * surface too). Colours that already pass come back unchanged.
 */
export function readableShade(hex: string, target = 5.2): string {
  const rgb = channels(hex);
  if (!rgb) return hex;
  for (let keep = 1; keep > 0.2; keep -= 0.02) {
    const shade: [number, number, number] = [rgb[0] * keep, rgb[1] * keep, rgb[2] * keep];
    if (ratio(1, luminance(shade)) >= target) return toHex(shade);
  }
  return '#000000';
}
