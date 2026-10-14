import { fontSlot, namespaceOf } from "../theme/model"
import type { Overrides } from "../theme/model"
import type { ThemeTokens } from "./parse"

function firstFontFamily(stack: string) {
  return stack
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "")
}

/** Variable font packages name the family "X Variable"; Figma calls it "X". */
function sameFamily(css: string, figma: string) {
  return css === figma || css.replace(/\s+Variable$/i, "") === figma
}

function block(selector: string, declarations: [string, string][]) {
  if (declarations.length === 0) {
    return null
  }

  const body = declarations.map(([prop, value]) => `  ${prop}: ${value};`)

  return `${selector} {\n${body.join("\n")}\n}`
}

/**
 * Writes the overrides as CSS to paste after `@import "tailwindcss"`. Only
 * what differs from the default theme is emitted. Colors with a dark value
 * become semantic tokens: the values live in `:root` and `.dark`, and an
 * inline theme entry points the Tailwind color at them.
 */
export function exportCss(defaults: ThemeTokens, overrides: Overrides) {
  const removed = new Set(overrides.removed)
  const theme: [string, string][] = []
  const inline: [string, string][] = []
  const light: [string, string][] = []
  const dark: [string, string][] = []

  // A namespace whose defaults are all removed is reset with one wildcard.
  const remaining = new Map<string, number>()
  for (const prop of defaults.keys()) {
    if (!removed.has(prop)) {
      const namespace = namespaceOf(prop)
      remaining.set(namespace, (remaining.get(namespace) ?? 0) + 1)
    }
  }
  const cleared = new Set<string>()

  const props = [
    ...defaults.keys(),
    ...Object.keys(overrides.values).filter((prop) => !defaults.has(prop)),
  ]

  for (const prop of props) {
    if (removed.has(prop)) {
      const namespace = namespaceOf(prop)
      if (remaining.has(namespace) || namespace === prop) {
        theme.push([prop, "initial"])
      } else if (!cleared.has(namespace)) {
        cleared.add(namespace)
        theme.push([`${namespace}*`, "initial"])
      }
      continue
    }

    const defaultValue = defaults.get(prop)
    const value = overrides.values[prop] ?? defaultValue
    if (value === undefined) {
      continue
    }

    const darkValue = overrides.darkEnabled ? overrides.dark[prop] : undefined
    if (darkValue && prop.startsWith("--color-")) {
      const variable = `--${prop.slice("--color-".length)}`
      inline.push([prop, `var(${variable})`])
      light.push([variable, value])
      dark.push([variable, darkValue])
      continue
    }

    const slot = fontSlot(prop)
    const family = slot ? overrides.fontFamilies[slot] : undefined
    const next =
      family && !sameFamily(firstFontFamily(value), family)
        ? `"${family}", ${value}`
        : value

    if (next !== defaultValue) {
      theme.push([prop, next])
    }
  }

  return [
    block("@theme", theme),
    block("@theme inline", inline),
    block(":root", light),
    block(".dark", dark),
  ]
    .filter(Boolean)
    .join("\n\n")
}
