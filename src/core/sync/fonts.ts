export type FontRef = { family: string; style: string }

const WEIGHT_STYLES: Record<number, string[]> = {
  100: ["thin", "hairline"],
  200: ["extralight", "ultralight"],
  300: ["light"],
  400: ["regular", "normal"],
  500: ["medium"],
  600: ["semibold", "demibold"],
  700: ["bold"],
  800: ["extrabold", "ultrabold"],
  900: ["black", "heavy"],
}

function normalize(style: string) {
  return style.toLowerCase().replace(/[\s_-]/g, "")
}

/**
 * Resolves a family and numeric weight to an installed font. Returns null
 * when the family lacks that weight, so callers can skip it instead of
 * substituting a neighbor.
 */
export function createFontResolver(fonts: readonly FontRef[]) {
  const families = new Map<string, Map<string, FontRef>>()
  for (const font of fonts) {
    const styles = families.get(font.family) ?? new Map<string, FontRef>()
    styles.set(normalize(font.style), font)
    families.set(font.family, styles)
  }

  return (family: string, weight: number): FontRef | null => {
    const styles = families.get(family)
    for (const name of WEIGHT_STYLES[weight] ?? []) {
      const match = styles?.get(name)
      if (match) {
        return match
      }
    }

    return null
  }
}
