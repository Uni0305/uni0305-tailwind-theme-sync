import { converter, inGamut, parse, toGamut } from "culori"
import type { Color } from "culori"

export type ColorProfile = "SRGB" | "DISPLAY_P3"

export type FigmaColor = { r: number; g: number; b: number; a: number }

type Rgb = { r: number; g: number; b: number; alpha?: number }

type Space = {
  convert: (color: Color) => Rgb
  inGamut: (color: Color) => boolean
  map: (color: Color) => Rgb
}

const SPACES: Record<ColorProfile, Space> = {
  SRGB: {
    convert: converter("rgb"),
    inGamut: inGamut("rgb"),
    map: toGamut("rgb", "oklch"),
  },
  DISPLAY_P3: {
    convert: converter("p3"),
    inGamut: inGamut("p3"),
    map: toGamut("p3", "oklch"),
  },
}

function channel(value: number) {
  return Math.min(1, Math.max(0, Math.round(value * 1e4) / 1e4))
}

/**
 * Converts any CSS color to RGBA channels in the document's color profile.
 * Out-of-gamut colors are mapped by reducing chroma, which keeps the hue.
 */
export function toFigmaColor(
  css: string,
  profile: ColorProfile = "SRGB"
): FigmaColor | null {
  const parsed = parse(css)
  if (!parsed) {
    return null
  }

  // Gamut mapping nudges colors that already fit, so only map the ones that
  // fall outside the target space.
  const space = SPACES[profile]
  const mapped = space.inGamut(parsed)
    ? space.convert(parsed)
    : space.map(parsed)

  return {
    r: channel(mapped.r),
    g: channel(mapped.g),
    b: channel(mapped.b),
    a: channel(mapped.alpha ?? 1),
  }
}
