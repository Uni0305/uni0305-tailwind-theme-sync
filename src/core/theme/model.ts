import type { ThemeTokens } from "../css/parse"

/** Everything the user changed relative to Tailwind's default theme. */
export type Overrides = {
  version: 1
  /** Changed or added token values, by CSS custom property. */
  values: Record<string, string>
  /** Default tokens taken out of the theme. */
  removed: string[]
  /** Dark-mode values for color tokens, by CSS custom property. */
  dark: Record<string, string>
  darkEnabled: boolean
  /** Figma font family per font slot (`sans`, `serif`, `mono`, custom). */
  fontFamilies: Record<string, string>
  /** Font slots that get a full set of text styles. */
  textStyleSlots: string[]
  /** Spec groups left out when applying to Figma. Not part of the theme. */
  excludedGroups: string[]
}

export const EMPTY_OVERRIDES: Overrides = {
  version: 1,
  values: {},
  removed: [],
  dark: {},
  darkEnabled: false,
  fontFamilies: {},
  textStyleSlots: ["sans"],
  excludedGroups: [],
}

/** Reads stored overrides, falling back to defaults for anything unusable. */
export function parseOverrides(json: string | null | undefined): Overrides {
  if (!json) {
    return EMPTY_OVERRIDES
  }

  try {
    const stored = JSON.parse(json) as Partial<Overrides> | null
    if (!stored || typeof stored !== "object" || stored.version !== 1) {
      return EMPTY_OVERRIDES
    }

    return { ...EMPTY_OVERRIDES, ...stored }
  } catch {
    return EMPTY_OVERRIDES
  }
}

/** Default tokens minus removals, with overrides in place and additions last. */
export function applyOverrides(
  defaults: ThemeTokens,
  overrides: Overrides
): ThemeTokens {
  const removed = new Set(overrides.removed)
  const tokens: ThemeTokens = new Map()

  for (const [prop, value] of defaults) {
    if (!removed.has(prop)) {
      tokens.set(prop, overrides.values[prop] ?? value)
    }
  }
  for (const [prop, value] of Object.entries(overrides.values)) {
    if (!removed.has(prop)) {
      tokens.set(prop, value)
    }
  }

  return tokens
}

export type TokenTab = "Color" | "Typography" | "Size" | "Effects"

const TAB_PREFIXES: [string, TokenTab][] = [
  ["--color-", "Color"],
  ["--inset-shadow-", "Effects"],
  ["--drop-shadow-", "Effects"],
  ["--text-shadow-", "Effects"],
  ["--shadow-", "Effects"],
  ["--font-", "Typography"],
  ["--text-", "Typography"],
  ["--leading-", "Typography"],
  ["--tracking-", "Typography"],
  ["--radius-", "Size"],
  ["--breakpoint-", "Size"],
  ["--container-", "Size"],
  ["--blur-", "Size"],
]

// Longest prefixes first, so `--font-weight-*` is not taken for `--font-*`.
const NAMESPACES = [
  "--inset-shadow-",
  "--drop-shadow-",
  "--text-shadow-",
  "--font-weight-",
  "--breakpoint-",
  "--container-",
  "--tracking-",
  "--leading-",
  "--radius-",
  "--shadow-",
  "--color-",
  "--font-",
  "--text-",
  "--blur-",
]

/** The theme namespace a token belongs to, e.g. `--color-`. */
export function namespaceOf(prop: string) {
  return (
    NAMESPACES.find((namespace) => prop.startsWith(namespace)) ??
    /^--[a-z0-9]+-/.exec(prop)?.[0] ??
    prop
  )
}

/** Namespaces a new token can be added to, per tab. */
export const TAB_NAMESPACES: Record<TokenTab, string[]> = {
  Color: ["color"],
  Typography: ["text", "font-weight", "leading", "tracking"],
  Size: ["radius", "breakpoint", "container", "blur"],
  Effects: ["shadow", "inset-shadow", "drop-shadow", "text-shadow"],
}

/** The editor tab a token belongs to, or null when Figma has no use for it. */
export function tokenTab(prop: string): TokenTab | null {
  if (prop === "--spacing") {
    return "Size"
  }

  return TAB_PREFIXES.find(([prefix]) => prop.startsWith(prefix))?.[1] ?? null
}

/** `sans` for `--font-sans`; null for anything that is not a font family. */
export function fontSlot(prop: string) {
  const match = /^--font-(?!weight-)([a-z0-9-]+)$/.exec(prop)

  return match && !match[1].includes("--") ? match[1] : null
}

export type TokenRow = {
  prop: string
  value: string
  defaultValue?: string
  state: "default" | "modified" | "custom"
}

/**
 * Rows for one editor tab: defaults in theme order, then added tokens.
 * Removed tokens are not listed.
 */
export function listTokens(
  defaults: ThemeTokens,
  overrides: Overrides,
  tab: TokenTab
): TokenRow[] {
  const removed = new Set(overrides.removed)
  const rows: TokenRow[] = []

  for (const [prop, defaultValue] of defaults) {
    if (tokenTab(prop) !== tab || fontSlot(prop) || removed.has(prop)) {
      continue
    }

    const value = overrides.values[prop]
    rows.push({
      prop,
      value: value ?? defaultValue,
      defaultValue,
      state: value === undefined ? "default" : "modified",
    })
  }
  for (const [prop, value] of Object.entries(overrides.values)) {
    if (!defaults.has(prop) && tokenTab(prop) === tab && !fontSlot(prop)) {
      rows.push({ prop, value, state: "custom" })
    }
  }

  return rows
}

function without<T>(record: Record<string, T>, key: string) {
  return Object.fromEntries(
    Object.entries(record).filter(([entry]) => entry !== key)
  )
}

/** Sets a token value; a value equal to the default clears the override. */
export function setToken(
  overrides: Overrides,
  defaults: ThemeTokens,
  prop: string,
  value: string
): Overrides {
  const next = value.trim()

  return {
    ...overrides,
    removed: overrides.removed.filter((p) => p !== prop),
    values:
      next === defaults.get(prop)
        ? without(overrides.values, prop)
        : { ...overrides.values, [prop]: next },
  }
}

/** Removes a token: added tokens disappear, defaults are marked removed. */
export function removeToken(
  overrides: Overrides,
  defaults: ThemeTokens,
  prop: string
): Overrides {
  return {
    ...overrides,
    values: without(overrides.values, prop),
    dark: without(overrides.dark, prop),
    removed:
      defaults.has(prop) && !overrides.removed.includes(prop)
        ? [...overrides.removed, prop]
        : overrides.removed,
  }
}

/** Puts a default token back to its original value. */
export function resetToken(overrides: Overrides, prop: string): Overrides {
  return {
    ...overrides,
    values: without(overrides.values, prop),
    removed: overrides.removed.filter((p) => p !== prop),
  }
}

/** Sets a dark-mode value; an empty value clears it. */
export function setDarkValue(
  overrides: Overrides,
  prop: string,
  value: string
): Overrides {
  const next = value.trim()

  return {
    ...overrides,
    dark: next
      ? { ...overrides.dark, [prop]: next }
      : without(overrides.dark, prop),
  }
}

export type FontSlotRow = {
  slot: string
  family: string
  custom: boolean
}

/**
 * Figma families used when a slot has no explicit choice. Tailwind's default
 * stacks are system fonts, which Figma cannot express.
 */
export const DEFAULT_FONT_FAMILIES: Record<string, string> = {
  sans: "Inter",
  serif: "Noto Serif",
  mono: "Roboto Mono",
}

export function listFontSlots(
  defaults: ThemeTokens,
  overrides: Overrides
): FontSlotRow[] {
  const rows: FontSlotRow[] = []

  for (const prop of applyOverrides(defaults, overrides).keys()) {
    const slot = fontSlot(prop)
    if (slot) {
      rows.push({
        slot,
        family:
          overrides.fontFamilies[slot] ?? DEFAULT_FONT_FAMILIES[slot] ?? "",
        custom: !defaults.has(prop),
      })
    }
  }

  return rows
}

/** Chooses the Figma family for a slot, creating the slot when it is new. */
export function setFontFamily(
  overrides: Overrides,
  defaults: ThemeTokens,
  slot: string,
  family: string
): Overrides {
  const prop = `--font-${slot}`

  return {
    ...overrides,
    fontFamilies: { ...overrides.fontFamilies, [slot]: family },
    // A custom slot has no stack of its own, so its value follows the family.
    values: defaults.has(prop)
      ? overrides.values
      : { ...overrides.values, [prop]: `"${family}", sans-serif` },
  }
}

/** Removes a custom font slot together with its text styles. */
export function removeFontSlot(overrides: Overrides, slot: string): Overrides {
  return {
    ...overrides,
    values: without(overrides.values, `--font-${slot}`),
    fontFamilies: without(overrides.fontFamilies, slot),
    textStyleSlots: overrides.textStyleSlots.filter((s) => s !== slot),
  }
}

const TOKEN_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Whether `name` can follow a namespace prefix in a custom property. */
export function isValidTokenName(name: string) {
  return TOKEN_NAME.test(name)
}

/** Checks or unchecks spec groups for the next apply. */
export function setGroupsIncluded(
  overrides: Overrides,
  ids: string[],
  included: boolean
): Overrides {
  const excluded = new Set(overrides.excludedGroups)
  for (const id of ids) {
    if (included) {
      excluded.delete(id)
    } else {
      excluded.add(id)
    }
  }

  return { ...overrides, excludedGroups: [...excluded] }
}

/** Gives a font slot a full set of text styles, or takes them away. */
export function setTextStyleSlot(
  overrides: Overrides,
  slot: string,
  enabled: boolean
): Overrides {
  if (overrides.textStyleSlots.includes(slot) === enabled) {
    return overrides
  }

  return {
    ...overrides,
    textStyleSlots: enabled
      ? [...overrides.textStyleSlots, slot]
      : overrides.textStyleSlots.filter((s) => s !== slot),
  }
}

/** Switches dark mode; the dark values stay for when it is switched back. */
export function setDarkEnabled(
  overrides: Overrides,
  enabled: boolean
): Overrides {
  return { ...overrides, darkEnabled: enabled }
}

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

/**
 * Whether anything differs from a fresh start, theme or apply settings
 * alike, since a reset clears both.
 */
export function hasAnyChanges(overrides: Overrides) {
  return JSON.stringify(overrides) !== JSON.stringify(EMPTY_OVERRIDES)
}

export type TokenGroup = {
  /** Palette name, or null for colors that have no numeric step. */
  name: string | null
  rows: TokenRow[]
}

/** Groups color rows by palette; stepless colors share a final group. */
export function groupColorRows(rows: TokenRow[]): TokenGroup[] {
  const palettes = new Map<string, TokenRow[]>()
  const ungrouped: TokenRow[] = []

  for (const row of rows) {
    const palette = /^--color-(.+)-\d+$/.exec(row.prop)?.[1]
    if (palette === undefined) {
      ungrouped.push(row)
    } else {
      palettes.set(palette, [...(palettes.get(palette) ?? []), row])
    }
  }

  const groups: TokenGroup[] = [...palettes].map(([name, items]) => ({
    name,
    rows: items,
  }))

  return ungrouped.length > 0
    ? [...groups, { name: null, rows: ungrouped }]
    : groups
}

/** Removes several tokens at once, e.g. a whole color palette. */
export function removeTokens(
  overrides: Overrides,
  defaults: ThemeTokens,
  props: string[]
): Overrides {
  return props.reduce(
    (next, prop) => removeToken(next, defaults, prop),
    overrides
  )
}
