import type { ThemeTokens } from "../css/parse"
import type { CollectionName, FigmaSpec } from "./build"

export type SpecSection =
  "Color" | "Typography" | "Size" | "Text styles" | "Effects"

export type SpecGroup = {
  /** Stable identifier, e.g. `Color/red` or `Effects/shadow`. */
  id: string
  section: SpecSection
  label: string
  count: number
}

export type Selection = {
  /** Every group the spec can be narrowed by, in spec order. */
  groups: SpecGroup[]
  /** The spec without the excluded groups. The same object if none is. */
  spec: FigmaSpec
  /**
   * Keys the sync must leave alone: the items of excluded groups, which are
   * still part of the theme, and whatever failed to convert, which is not
   * gone but cannot be written right now.
   */
  retained: string[]
  /** Items in the groups that stay checked. */
  selectedCount: number
}

/** Colors without a numeric step (`black`, `white`, semantic names). */
const UNGROUPED = "other"

function variableGroup(collection: CollectionName, name: string) {
  const segments = name.split("/")
  const label =
    collection === "Color"
      ? segments.length > 1
        ? segments[0]
        : UNGROUPED
      : segments[0]

  return { id: `${collection}/${label}`, label }
}

function styleGroup(section: "Text styles" | "Effects", name: string) {
  const label = name.split("/")[0]

  return { id: `${section}/${label}`, label }
}

/**
 * Narrows a spec to the checked groups and works out what the sync has to
 * leave alone. The two always come from the same exclusion, so they cannot
 * disagree: every item is either in `spec` or in `retained`.
 */
export function selectGroups(
  spec: FigmaSpec,
  excluded: ReadonlySet<string>
): Selection {
  const groups = new Map<string, SpecGroup>()
  const retained: string[] = []
  let selectedCount = 0

  /** Counts the item in its group and tells whether its group stays. */
  const place = (
    { id, label }: { id: string; label: string },
    section: SpecSection,
    key: string
  ) => {
    const group = groups.get(id) ?? { id, section, label, count: 0 }
    group.count += 1
    groups.set(id, group)

    if (excluded.has(id)) {
      retained.push(key)

      return false
    }
    selectedCount += 1

    return true
  }

  const narrowed: FigmaSpec = {
    ...spec,
    collections: spec.collections.map((collection) => ({
      ...collection,
      variables: collection.variables.filter((variable) =>
        place(
          variableGroup(collection.name, variable.name),
          collection.name,
          variable.key
        )
      ),
    })),
    textStyles: spec.textStyles.filter((style) =>
      place(styleGroup("Text styles", style.name), "Text styles", style.key)
    ),
    effectStyles: spec.effectStyles.filter((style) =>
      place(styleGroup("Effects", style.name), "Effects", style.key)
    ),
  }

  return {
    groups: [...groups.values()],
    spec: excluded.size === 0 ? spec : narrowed,
    retained: [...retained, ...spec.unconvertedKeys],
    selectedCount,
  }
}

/** CSS colors of each color group, to preview next to its checkbox. */
export function groupSwatches(spec: FigmaSpec, tokens: ThemeTokens) {
  const colors = new Map<string, string[]>()
  const palette = spec.collections.find((c) => c.name === "Color")

  for (const variable of palette?.variables ?? []) {
    const css = tokens.get(variable.key)
    if (css) {
      const { id } = variableGroup("Color", variable.name)
      colors.set(id, [...(colors.get(id) ?? []), css])
    }
  }

  return colors
}
