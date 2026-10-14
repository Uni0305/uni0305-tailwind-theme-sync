import type { Language } from "../core/messages"
import type { Overrides } from "../core/theme/model"

const OVERRIDES_KEY = "overrides"
const LANGUAGE_KEY = "language"

/** Overrides live on the document so everyone editing the file shares them. */
export function loadOverrides() {
  return figma.root.getPluginData(OVERRIDES_KEY) || null
}

export function saveOverrides(overrides: Overrides) {
  figma.root.setPluginData(OVERRIDES_KEY, JSON.stringify(overrides))
}

/** The UI language is a personal preference, so it is stored per user. */
export async function loadLanguage(): Promise<Language | null> {
  const stored = await figma.clientStorage.getAsync(LANGUAGE_KEY)

  return stored === "en" || stored === "ko" ? stored : null
}

export async function saveLanguage(language: Language) {
  await figma.clientStorage.setAsync(LANGUAGE_KEY, language)
}
