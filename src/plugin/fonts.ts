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

export type Fonts = {
  /**
   * Resolves a family and numeric weight to an installed font. Returns null
   * when the family lacks that weight, so callers can skip it instead of
   * substituting a neighbor.
   */
  resolve: (family: string, weight: number) => FontName | null
  load: (font: FontName) => Promise<void>
  /** Loads every style of a family. */
  loadFamily: (family: string) => Promise<void>
}

export async function createFonts(): Promise<Fonts> {
  const families = new Map<string, Map<string, FontName>>()
  const loading = new Map<string, Promise<void>>()

  for (const { fontName } of await figma.listAvailableFontsAsync()) {
    const styles = families.get(fontName.family) ?? new Map<string, FontName>()
    styles.set(normalize(fontName.style), fontName)
    families.set(fontName.family, styles)
  }

  const load = (font: FontName) => {
    const id = `${font.family}/${font.style}`
    const pending = loading.get(id) ?? figma.loadFontAsync(font)
    loading.set(id, pending)

    return pending
  }

  return {
    resolve(family, weight) {
      const styles = families.get(family)
      for (const name of WEIGHT_STYLES[weight] ?? []) {
        const match = styles?.get(name)
        if (match) {
          return match
        }
      }

      return null
    },
    load,
    async loadFamily(family) {
      await Promise.all([...(families.get(family)?.values() ?? [])].map(load))
    },
  }
}
