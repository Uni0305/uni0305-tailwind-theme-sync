import { formatHex8, parse } from "culori"

export type FigmaColor = { r: number; g: number; b: number; a: number }

/**
 * Converts any CSS color to sRGB RGBA channels by round-tripping it through
 * an 8-digit hex code. Out-of-range channels are clipped, not gamut-mapped.
 */
export function toFigmaColor(css: string): FigmaColor | null {
  const parsed = parse(css)
  if (!parsed) {
    return null
  }

  const hex = formatHex8(parsed)

  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
    a: parseInt(hex.slice(7, 9), 16) / 255,
  }
}
