import type { FigmaSpec } from "./build"

export type SpecSection =
  "Color" | "Typography" | "Size" | "Text styles" | "Effects"

export type SpecGroup = {
  /** Stable identifier, e.g. `Color/red` or `Effects/shadow`. */
  id: string
  section: SpecSection
  label: string
  count: number
}

/** Colors without a numeric step (`black`, `white`, semantic names). */
const UNGROUPED = "other"

function variableGroup(collection: string, name: string) {
  const segments = name.split("/")
  if (collection === "Color") {
    return segments.length > 1 ? segments[0] : UNGROUPED
  }

  return segments[0]
}

function textStyleGroup(name: string) {
  return name.split("/")[0]
}

function effectStyleGroup(name: string) {
  return name.split("/")[0]
}

/** Lists the groups a spec can be narrowed by, in spec order. */
export function listGroups(spec: FigmaSpec): SpecGroup[] {
  const groups = new Map<string, SpecGroup>()
  const add = (section: SpecSection, label: string) => {
    const id = `${section}/${label}`
    const group = groups.get(id) ?? { id, section, label, count: 0 }
    group.count += 1
    groups.set(id, group)
  }

  for (const collection of spec.collections) {
    for (const variable of collection.variables) {
      add(collection.name, variableGroup(collection.name, variable.name))
    }
  }
  for (const style of spec.textStyles) {
    add("Text styles", textStyleGroup(style.name))
  }
  for (const style of spec.effectStyles) {
    add("Effects", effectStyleGroup(style.name))
  }

  return [...groups.values()]
}

/** Drops every variable and style that belongs to an excluded group. */
export function filterSpec(
  spec: FigmaSpec,
  excluded: ReadonlySet<string>
): FigmaSpec {
  if (excluded.size === 0) {
    return spec
  }

  return {
    ...spec,
    collections: spec.collections.map((collection) => ({
      ...collection,
      variables: collection.variables.filter(
        (v) =>
          !excluded.has(
            `${collection.name}/${variableGroup(collection.name, v.name)}`
          )
      ),
    })),
    textStyles: spec.textStyles.filter(
      (s) => !excluded.has(`Text styles/${textStyleGroup(s.name)}`)
    ),
    effectStyles: spec.effectStyles.filter(
      (s) => !excluded.has(`Effects/${effectStyleGroup(s.name)}`)
    ),
  }
}

/**
 * Keys of the variables and styles in excluded groups. They are still part
 * of the theme, so anything already in the file for them must be left alone.
 */
export function retainedKeys(
  spec: FigmaSpec,
  excluded: ReadonlySet<string>
): string[] {
  if (excluded.size === 0) {
    return []
  }

  return [
    ...spec.collections.flatMap((collection) =>
      collection.variables
        .filter((v) =>
          excluded.has(
            `${collection.name}/${variableGroup(collection.name, v.name)}`
          )
        )
        .map((v) => v.key)
    ),
    ...spec.textStyles
      .filter((s) => excluded.has(`Text styles/${textStyleGroup(s.name)}`))
      .map((s) => s.key),
    ...spec.effectStyles
      .filter((s) => excluded.has(`Effects/${effectStyleGroup(s.name)}`))
      .map((s) => s.key),
  ]
}
