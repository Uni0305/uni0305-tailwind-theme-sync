import postcss from "postcss"

import { fontSlot, namespaceOf } from "../theme/model"
import { pruneRenames } from "../theme/model"
import type { Overrides } from "../theme/model"
import type { ThemeTokens } from "./parse"

export type ImportResult = {
  /** Token values that differ from the default theme. */
  values: Record<string, string>
  /** Default tokens the CSS resets with `initial`. */
  removed: string[]
  /** Dark-mode values of the colors that change under `.dark`. */
  dark: Record<string, string>
  /** First family of each font slot's stack, as written in the CSS. */
  fonts: Record<string, string>
  /** Theme tokens whose `var()` references could not be followed. */
  unresolved: string[]
}

type Lookup = (name: string) => string | undefined

const VAR = /var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/
const ALIAS = /^var\(\s*(--color-[\w-]+)\s*\)$/
const MAX_DEPTH = 16

/** Replaces every `var()` with its value; null when one cannot be followed. */
function resolve(value: string, lookup: Lookup, depth = 0): string | null {
  let result = value

  for (let match = VAR.exec(result); match; match = VAR.exec(result)) {
    const [reference, name, fallback] = match
    const target = depth < MAX_DEPTH ? lookup(name) : undefined
    const replacement =
      target !== undefined
        ? resolve(target, lookup, depth + 1)
        : fallback !== undefined
          ? resolve(fallback.trim(), lookup, depth + 1)
          : null
    if (replacement === null) {
      return null
    }

    result = result.replace(reference, replacement)
  }

  return result
}

function firstFontFamily(stack: string) {
  return stack
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "")
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

/**
 * Reads a Tailwind v4 stylesheet into overrides. Understands `@theme` blocks
 * (including `inline`), custom properties on `:root` and `.dark`, `var()`
 * references between them, and `initial` resets of tokens and namespaces.
 * Throws when the CSS cannot be parsed.
 */
export function importCss(css: string, defaults: ThemeTokens): ImportResult {
  const theme: [string, string][] = []
  const light = new Map<string, string>()
  const dark = new Map<string, string>()

  const root = postcss.parse(css)

  root.walkAtRules("theme", (rule) => {
    rule.each((node) => {
      if (node.type === "decl" && node.prop.startsWith("--")) {
        theme.push([node.prop, clean(node.value)])
      }
    })
  })

  root.walkRules((rule) => {
    const parent = rule.parent
    const darkMedia =
      parent?.type === "atrule" &&
      "params" in parent &&
      /prefers-color-scheme:\s*dark/.test(String(parent.params))
    const isDark = rule.selectors.some((s) => /(^|[\s,(])\.dark\b/.test(s))
    const isRoot = rule.selectors.some((s) => /^:(root|host)\b/.test(s.trim()))
    if (!isDark && !isRoot) {
      return
    }

    const target = isDark || darkMedia ? dark : light
    rule.each((node) => {
      if (node.type === "decl" && node.prop.startsWith("--")) {
        target.set(node.prop, clean(node.value))
      }
    })
  })

  const themeValues = new Map(theme)
  const lightLookup: Lookup = (name) =>
    light.get(name) ?? themeValues.get(name) ?? defaults.get(name)
  const darkLookup: Lookup = (name) => dark.get(name) ?? lightLookup(name)

  const result: ImportResult = {
    values: {},
    removed: [],
    dark: {},
    fonts: {},
    unresolved: [],
  }
  const removed = new Set<string>()

  for (const [prop, raw] of theme) {
    if (raw === "initial") {
      if (prop.endsWith("*")) {
        const namespace = prop.slice(0, -1)
        for (const name of defaults.keys()) {
          if (namespace === "--" || namespaceOf(name) === namespace) {
            removed.add(name)
            delete result.values[name]
          }
        }
      } else if (defaults.has(prop)) {
        removed.add(prop)
      }
      delete result.values[prop]
      continue
    }

    // A color pointing straight at another theme color stays a reference, so
    // it can become a variable alias in Figma.
    const alias = ALIAS.exec(raw)
    const keepAlias =
      alias &&
      prop.startsWith("--color-") &&
      (themeValues.has(alias[1]) || defaults.has(alias[1]))
    const lightValue = resolve(raw, lightLookup)
    if (lightValue === null) {
      result.unresolved.push(prop)
      continue
    }

    removed.delete(prop)
    const value = keepAlias ? `var(${alias[1]})` : lightValue
    if (value === defaults.get(prop)) {
      delete result.values[prop]
    } else {
      result.values[prop] = value
    }

    const darkValue = resolve(raw, darkLookup)
    if (
      prop.startsWith("--color-") &&
      darkValue !== null &&
      darkValue !== lightValue
    ) {
      result.dark[prop] = darkValue
    }

    const slot = fontSlot(prop)
    if (slot) {
      result.fonts[slot] = firstFontFamily(lightValue)
    }
  }

  result.removed = [...removed]

  return result
}

/**
 * Finds the Figma family for a CSS font name. Variable font packages often
 * append "Variable" to the family, which Figma leaves out.
 */
export function matchFontFamily(name: string, families: ReadonlySet<string>) {
  if (families.has(name)) {
    return name
  }

  const base = name.replace(/\s+Variable$/i, "")

  return families.has(base) ? base : null
}

/**
 * Folds an import into the current overrides. "replace" starts over from the
 * imported theme; "merge" keeps existing changes the import does not touch.
 * Settings that are not part of the theme (apply selection, text style
 * slots) are kept either way, and so are the rename records of the added
 * tokens that remain.
 */
export function applyImport(
  current: Overrides,
  result: ImportResult,
  families: ReadonlySet<string>,
  mode: "replace" | "merge"
): Overrides {
  const fontFamilies = Object.fromEntries(
    Object.entries(result.fonts).map(([slot, name]) => [
      slot,
      matchFontFamily(name, families) ?? name,
    ])
  )

  if (mode === "replace") {
    return pruneRenames({
      ...current,
      values: result.values,
      removed: result.removed,
      dark: result.dark,
      darkEnabled: Object.keys(result.dark).length > 0,
      fontFamilies,
    })
  }

  const values = { ...current.values, ...result.values }

  return pruneRenames({
    ...current,
    values,
    removed: [...new Set([...current.removed, ...result.removed])].filter(
      (prop) => !(prop in result.values)
    ),
    dark: { ...current.dark, ...result.dark },
    darkEnabled: current.darkEnabled || Object.keys(result.dark).length > 0,
    fontFamilies: { ...current.fontFamilies, ...fontFamilies },
  })
}
