import type { Overrides } from "@/core/theme/model"

/**
 * How many theme entries differ from Tailwind's defaults. Apply settings
 * (unchecked groups, text style slots) are not part of the theme.
 */
export function countThemeChanges(overrides: Overrides) {
  return (
    Object.keys(overrides.values).length +
    overrides.removed.length +
    Object.keys(overrides.dark).length +
    Object.keys(overrides.fontFamilies).length
  )
}
