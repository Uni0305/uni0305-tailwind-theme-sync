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
  /**
   * Earlier names of renamed tokens, oldest first, by the current CSS custom
   * property. The sync uses them to find what the file holds under an old
   * name. Not part of the theme.
   */
  renames: Record<string, string[]>
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
  renames: {},
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
    renames: without(overrides.renames, prop),
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
    renames: without(overrides.renames, `--font-${slot}`),
  }
}

const TOKEN_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Whether `name` can follow a namespace prefix in a custom property. */
export function isValidTokenName(name: string) {
  return TOKEN_NAME.test(name)
}

/** `brand-500` for `--color-brand-500`: the part after the namespace. */
export function tokenName(prop: string) {
  return prop.slice(namespaceOf(prop).length)
}

/** Why a rename cannot go ahead: a malformed name, or one already in use. */
export type RenameIssue = "invalid" | "taken"

/** Whether a token was added by the user, the only kind that can be renamed. */
function isCustom(overrides: Overrides, defaults: ThemeTokens, prop: string) {
  return prop in overrides.values && !defaults.has(prop)
}

/**
 * The props a rename moves, each with its new name: the token and the
 * sub-properties that hang off it, such as `--text-brand--line-height`.
 */
function renamePairs(
  overrides: Overrides,
  from: string,
  to: string
): [string, string][] {
  return Object.keys(overrides.values)
    .filter((prop) => prop === from || prop.startsWith(`${from}--`))
    .map((prop) => [prop, to + prop.slice(from.length)])
}

function pairsIssue(
  overrides: Overrides,
  defaults: ThemeTokens,
  pairs: [string, string][]
): RenameIssue | null {
  return pairs.some(([, to]) => defaults.has(to) || to in overrides.values)
    ? "taken"
    : null
}

/**
 * Moves tokens to new names: their light and dark values, every `var()` that
 * points at them, and the record of the names they had before.
 */
function moveTokens(
  overrides: Overrides,
  pairs: [string, string][]
): Overrides {
  const moved = new Map(pairs)
  const rename = (prop: string) => moved.get(prop) ?? prop
  const relink = (value: string) =>
    value.replace(
      /(var\(\s*)(--[\w-]+)/g,
      (_, head: string, prop: string) => head + rename(prop)
    )
  const rekey = (record: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(record).map(([prop, value]) => [
        rename(prop),
        relink(value),
      ])
    )

  const renames = Object.fromEntries(
    Object.entries(overrides.renames).filter(([prop]) => !moved.has(prop))
  )
  for (const [from, to] of pairs) {
    // Renaming back to an earlier name takes that name out of the record.
    const history = [
      ...new Set([...(overrides.renames[from] ?? []), from]),
    ].filter((prop) => prop !== to)
    if (history.length > 0) {
      renames[to] = history
    }
  }

  return {
    ...overrides,
    values: rekey(overrides.values),
    dark: rekey(overrides.dark),
    renames,
  }
}

/** Checks renaming an added token, e.g. `--color-brand` to `--color-accent`. */
export function tokenRenameIssue(
  overrides: Overrides,
  defaults: ThemeTokens,
  from: string,
  to: string
): RenameIssue | null {
  const namespace = namespaceOf(from)
  if (
    !isCustom(overrides, defaults, from) ||
    !isValidTokenName(tokenName(from)) ||
    namespaceOf(to) !== namespace ||
    !isValidTokenName(to.slice(namespace.length))
  ) {
    return "invalid"
  }

  return to === from
    ? null
    : pairsIssue(overrides, defaults, renamePairs(overrides, from, to))
}

/** Renames an added token; anything `tokenRenameIssue` rejects is ignored. */
export function renameToken(
  overrides: Overrides,
  defaults: ThemeTokens,
  from: string,
  to: string
): Overrides {
  if (to === from || tokenRenameIssue(overrides, defaults, from, to)) {
    return overrides
  }

  return moveTokens(overrides, renamePairs(overrides, from, to))
}

function paletteProps(tokens: Iterable<string>, palette: string) {
  const step = new RegExp(`^--color-${palette}-\\d+$`)

  return [...tokens].filter((prop) => step.test(prop))
}

/**
 * Checks renaming a whole color palette. Only a palette the user added
 * entirely can be renamed, and only to a palette name nothing uses yet.
 */
export function paletteRenameIssue(
  overrides: Overrides,
  defaults: ThemeTokens,
  from: string,
  to: string
): RenameIssue | null {
  const tokens = [...applyOverrides(defaults, overrides).keys()]
  const props = paletteProps(tokens, from)
  if (
    props.length === 0 ||
    props.some((prop) => !isCustom(overrides, defaults, prop)) ||
    !isValidTokenName(to)
  ) {
    return "invalid"
  }
  if (to === from) {
    return null
  }

  return paletteProps([...tokens, ...defaults.keys()], to).length > 0
    ? "taken"
    : pairsIssue(
        overrides,
        defaults,
        props.flatMap((prop) =>
          renamePairs(
            overrides,
            prop,
            `--color-${to}${prop.slice(`--color-${from}`.length)}`
          )
        )
      )
}

function moveGroup(overrides: Overrides, from: string, to: string) {
  return overrides.excludedGroups.map((id) => (id === from ? to : id))
}

/**
 * Renames every step of an added palette, e.g. `--color-brand-*` to
 * `--color-accent-*`. An unchecked palette stays unchecked.
 */
export function renamePalette(
  overrides: Overrides,
  defaults: ThemeTokens,
  from: string,
  to: string
): Overrides {
  if (to === from || paletteRenameIssue(overrides, defaults, from, to)) {
    return overrides
  }

  const props = paletteProps(Object.keys(overrides.values), from)
  const moved = moveTokens(
    overrides,
    props.flatMap((prop) =>
      renamePairs(
        overrides,
        prop,
        `--color-${to}${prop.slice(`--color-${from}`.length)}`
      )
    )
  )

  return {
    ...moved,
    excludedGroups: moveGroup(overrides, `Color/${from}`, `Color/${to}`),
  }
}

/** Checks renaming an added font slot, e.g. `brand` to `display`. */
export function fontSlotRenameIssue(
  overrides: Overrides,
  defaults: ThemeTokens,
  from: string,
  to: string
): RenameIssue | null {
  // `weight-*` would read as a font weight token, not a slot.
  if (to === "weight" || to.startsWith("weight-")) {
    return "invalid"
  }

  return tokenRenameIssue(overrides, defaults, `--font-${from}`, `--font-${to}`)
}

/**
 * Renames an added font slot, carrying its Figma family, its text styles and
 * whether their group is checked over to the new name.
 */
export function renameFontSlot(
  overrides: Overrides,
  defaults: ThemeTokens,
  from: string,
  to: string
): Overrides {
  if (to === from || fontSlotRenameIssue(overrides, defaults, from, to)) {
    return overrides
  }

  const prop = `--font-${from}`
  const moved = moveTokens(
    overrides,
    renamePairs(overrides, prop, `--font-${to}`)
  )

  return {
    ...moved,
    fontFamilies: Object.fromEntries(
      Object.entries(overrides.fontFamilies).map(([slot, family]) => [
        slot === from ? to : slot,
        family,
      ])
    ),
    textStyleSlots: overrides.textStyleSlots.map((slot) =>
      slot === from ? to : slot
    ),
    excludedGroups: moveGroup(
      overrides,
      `Text styles/${from}`,
      `Text styles/${to}`
    ),
  }
}

/** Drops the rename records of tokens that are no longer added ones. */
export function pruneRenames(overrides: Overrides): Overrides {
  return {
    ...overrides,
    renames: Object.fromEntries(
      Object.entries(overrides.renames).filter(
        ([prop]) => prop in overrides.values
      )
    ),
  }
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
 * (unchecked groups, text style slots) are not part of the theme, and dark
 * values count only while dark mode is on, since neither the export nor an
 * apply uses them otherwise.
 */
export function countThemeChanges(overrides: Overrides) {
  return (
    Object.keys(overrides.values).length +
    overrides.removed.length +
    (overrides.darkEnabled ? Object.keys(overrides.dark).length : 0) +
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
