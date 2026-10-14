/** Loads fonts once each; Figma needs them loaded before text can change. */
export function createFontLoader(available: readonly FontName[]) {
  const loading = new Map<string, Promise<void>>()

  const load = (font: FontName) => {
    const id = `${font.family}/${font.style}`
    const pending = loading.get(id) ?? figma.loadFontAsync(font)
    loading.set(id, pending)

    return pending
  }

  return {
    load,
    /** Loads every style of a family. */
    async loadFamily(family: string) {
      await Promise.all(
        available.filter((font) => font.family === family).map(load)
      )
    },
  }
}
