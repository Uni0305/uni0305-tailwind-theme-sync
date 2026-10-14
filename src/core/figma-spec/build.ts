import { toFigmaColor } from "../convert/color"
import type { ColorProfile, FigmaColor } from "../convert/color"
import { parseShadows } from "../convert/shadow"
import type { ShadowSpec } from "../convert/shadow"
import { evaluate, round } from "../convert/units"
import type { ThemeTokens } from "../css/parse"
import { DEFAULT_FONT_FAMILIES } from "../theme/model"

export type VariableValue =
  | {
      type: "COLOR"
      value: FigmaColor
      /** Key of the color variable this one points at. */
      aliasOf?: string
      /** Value in the Dark mode, when it differs from the light one. */
      dark?: FigmaColor
    }
  | { type: "FLOAT"; value: number }
  | { type: "STRING"; value: string }

export type VariableSpec = VariableValue & {
  /** Identifies the source token, used to find the variable on re-runs. */
  key: string
  name: string
  codeSyntax: string
}

export type CollectionName = "Color" | "Typography" | "Size"

export type CollectionSpec = {
  name: CollectionName
  variables: VariableSpec[]
}

export type TextStyleSpec = {
  key: string
  name: string
  family: string
  weight: number
  fontSize: number
  /** Pixels; omitted when the size has no line height token. */
  lineHeight?: number
  /** Variable keys each text property is bound to. */
  bindings: {
    fontFamily: string
    fontWeight: string
    fontSize: string
    lineHeight?: string
  }
}

export type BlurSpec = {
  type: "LAYER_BLUR" | "BACKGROUND_BLUR"
  radius: number
  /** Key of the variable the radius is bound to. */
  radiusKey: string
}

export type EffectStyleSpec = {
  key: string
  name: string
  effects: (ShadowSpec | BlurSpec)[]
}

export type FigmaSpec = {
  collections: CollectionSpec[]
  textStyles: TextStyleSpec[]
  effectStyles: EffectStyleSpec[]
  /** Tokens that could not be converted, keyed by CSS custom property. */
  skipped: string[]
}

export type BuildOptions = {
  colorProfile?: ColorProfile
  /** Figma font family per font slot (`sans`, `serif`, `mono`, custom). */
  fontFamilies?: Record<string, string>
  /** Dark-mode color values, by CSS custom property. */
  dark?: Record<string, string>
  /** Font slots that get a full set of text styles. Defaults to `sans`. */
  textStyleSlots?: string[]
}

/** Tailwind v3's spacing scale, as multiples of `--spacing`. */
export const SPACING_STEPS = [
  "0",
  "px",
  "0.5",
  "1",
  "1.5",
  "2",
  "2.5",
  "3",
  "3.5",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "14",
  "16",
  "20",
  "24",
  "28",
  "32",
  "36",
  "40",
  "44",
  "48",
  "52",
  "56",
  "60",
  "64",
  "72",
  "80",
  "96",
]

const LENGTH_NAMESPACES = ["radius", "breakpoint", "container", "blur"]

type Converted = { collection: CollectionName; variable: VariableSpec }

/**
 * `--color-red-500` becomes `red/500`; names without a trailing numeric step
 * stay whole (`sidebar-primary-foreground`). The collection is already called
 * Color, so the names carry no `color/` prefix.
 */
export function colorVariableName(prop: string) {
  const rest = prop.slice("--color-".length)
  const match = /^(.+)-(\d+)$/.exec(rest)

  return match ? `${match[1]}/${match[2]}` : rest
}

/** Variable names avoid dots, so the `0.5` step is written `0_5`. */
export function spacingVariableName(step: string) {
  return `spacing/${step.replace(".", "_")}`
}

const COLOR_ALIAS = /^var\(\s*(--color-[\w-]+)\s*\)$/

/** Follows `var(--color-*)` references until a literal color is reached. */
function followColorAliases(raw: string, tokens: ThemeTokens) {
  let value = raw
  for (let depth = 0; depth < 16; depth += 1) {
    const target = COLOR_ALIAS.exec(value)?.[1]
    const next = target ? tokens.get(target) : undefined
    if (next === undefined) {
      break
    }
    value = next
  }

  return value
}

function firstFontFamily(stack: string) {
  return stack
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "")
}

function pixels(raw: string) {
  const quantity = evaluate(raw)
  if (!quantity || (quantity.unit !== "px" && quantity.value !== 0)) {
    return null
  }

  return round(quantity.value)
}

function float(
  collection: CollectionName,
  prop: string,
  name: string,
  value: number | null
): Converted | "skipped" {
  if (value === null) {
    return "skipped"
  }

  return {
    collection,
    variable: {
      key: prop,
      name,
      type: "FLOAT",
      value,
      codeSyntax: `var(${prop})`,
    },
  }
}

/**
 * Converts one theme token. Returns "skipped" when the token belongs to a
 * supported namespace but its value cannot be converted, and null when the
 * token has no Figma variable counterpart.
 */
function convertToken(
  prop: string,
  raw: string,
  tokens: ThemeTokens,
  options: BuildOptions
): Converted | "skipped" | null {
  const [, namespace, rest] = /^--([a-z]+)-(.+)$/.exec(prop) ?? []
  if (!namespace) {
    return null
  }

  if (namespace === "color") {
    const aliasOf = COLOR_ALIAS.exec(raw)?.[1]
    const value = toFigmaColor(
      followColorAliases(raw, tokens),
      options.colorProfile
    )
    if (!value) {
      return "skipped"
    }

    const darkRaw = options.dark?.[prop]
    const dark = darkRaw
      ? toFigmaColor(followColorAliases(darkRaw, tokens), options.colorProfile)
      : null

    return {
      collection: "Color",
      variable: {
        key: prop,
        name: colorVariableName(prop),
        type: "COLOR",
        value,
        ...(aliasOf ? { aliasOf } : {}),
        ...(dark ? { dark } : {}),
        codeSyntax: `var(${prop})`,
      },
    }
  }

  if (namespace === "font" && rest.startsWith("weight-")) {
    const weight = evaluate(raw)
    const name = `font-weight/${rest.slice("weight-".length)}`

    return float(
      "Typography",
      prop,
      name,
      weight?.unit === "" ? weight.value : null
    )
  }

  if (namespace === "font" && !rest.includes("--")) {
    const families = { ...DEFAULT_FONT_FAMILIES, ...options.fontFamilies }

    return {
      collection: "Typography",
      variable: {
        key: prop,
        name: `font/${rest}`,
        type: "STRING",
        value: families[rest] ?? firstFontFamily(raw),
        codeSyntax: `var(${prop})`,
      },
    }
  }

  if (namespace === "text" && !rest.startsWith("shadow-")) {
    const [size, property] = rest.split("--")
    if (property === undefined) {
      return float("Typography", prop, `text/${size}/size`, pixels(raw))
    }
    if (property !== "line-height") {
      return null
    }

    // Line heights are ratios of the font size; Figma binds them in pixels.
    const fontSize = pixels(tokens.get(`--text-${size}`) ?? "")
    const lineHeight = evaluate(raw)
    const value =
      !lineHeight || fontSize === null
        ? null
        : lineHeight.unit === ""
          ? round(lineHeight.value * fontSize)
          : lineHeight.unit === "px"
            ? round(lineHeight.value)
            : null

    return float("Typography", prop, `text/${size}/line-height`, value)
  }

  if (namespace === "leading") {
    const leading = evaluate(raw)
    const value =
      leading && (leading.unit === "" || leading.unit === "px")
        ? round(leading.value)
        : null

    return float("Typography", prop, `leading/${rest}`, value)
  }

  if (namespace === "tracking") {
    // Stored as a percentage of the font size, the unit Figma uses.
    const tracking = evaluate(raw)
    const value = tracking?.unit === "em" ? round(tracking.value * 100) : null

    return float("Typography", prop, `tracking/${rest}`, value)
  }

  if (LENGTH_NAMESPACES.includes(namespace)) {
    return float("Size", prop, `${namespace}/${rest}`, pixels(raw))
  }

  return null
}

function spacingVariables(raw: string): VariableSpec[] | null {
  const base = pixels(raw)
  if (base === null) {
    return null
  }

  return SPACING_STEPS.map((step) => ({
    key: `--spacing*${step}`,
    name: spacingVariableName(step),
    type: "FLOAT",
    value: step === "px" ? 1 : round(base * Number(step)),
    codeSyntax: step === "px" ? "1px" : `calc(var(--spacing) * ${step})`,
  }))
}

function textStyles(
  typography: VariableSpec[],
  slots: string[]
): TextStyleSpec[] {
  const byKey = new Map(typography.map((v) => [v.key, v]))
  const number = (key: string) => {
    const variable = byKey.get(key)
    return variable?.type === "FLOAT" ? variable.value : undefined
  }

  const sizes = typography.filter((v) => /^text\/[^/]+\/size$/.test(v.name))
  const weights = typography.filter((v) => v.name.startsWith("font-weight/"))
  const styles: TextStyleSpec[] = []

  for (const slot of slots) {
    const family = byKey.get(`--font-${slot}`)
    if (family?.type !== "STRING") {
      continue
    }

    for (const size of sizes) {
      const sizeName = size.key.slice("--text-".length)
      const lineHeightKey = `${size.key}--line-height`
      const lineHeight = number(lineHeightKey)

      for (const weight of weights) {
        const weightName = weight.key.slice("--font-weight-".length)

        styles.push({
          key: `text:${slot}/${sizeName}/${weightName}`,
          name: `${slot}/${sizeName}/${weightName}`,
          family: family.value,
          weight: weight.value as number,
          fontSize: size.value as number,
          ...(lineHeight === undefined ? {} : { lineHeight }),
          bindings: {
            fontFamily: family.key,
            fontWeight: weight.key,
            fontSize: size.key,
            ...(lineHeight === undefined ? {} : { lineHeight: lineHeightKey }),
          },
        })
      }
    }
  }

  return styles
}

// Longer prefixes come first so `--inset-shadow-*` is not read as `--shadow-*`.
const SHADOW_NAMESPACES = [
  "inset-shadow",
  "drop-shadow",
  "text-shadow",
  "shadow",
]

function effectStyles(
  tokens: ThemeTokens,
  options: BuildOptions,
  skipped: string[]
): EffectStyleSpec[] {
  const styles: EffectStyleSpec[] = []

  for (const [prop, raw] of tokens) {
    const namespace = SHADOW_NAMESPACES.find((ns) =>
      prop.startsWith(`--${ns}-`)
    )
    if (namespace) {
      const effects = parseShadows(raw, {
        inner: namespace === "inset-shadow",
        colorProfile: options.colorProfile,
      })
      if (!effects) {
        skipped.push(prop)
        continue
      }

      const name = `${namespace}/${prop.slice(namespace.length + 3)}`
      styles.push({ key: prop, name, effects })
      continue
    }

    if (prop.startsWith("--blur-")) {
      const radius = pixels(raw)
      if (radius === null) {
        continue
      }

      const size = prop.slice("--blur-".length)
      styles.push(
        {
          key: `${prop}@layer`,
          name: `blur/${size}`,
          effects: [{ type: "LAYER_BLUR", radius, radiusKey: prop }],
        },
        {
          key: `${prop}@backdrop`,
          name: `backdrop-blur/${size}`,
          effects: [{ type: "BACKGROUND_BLUR", radius, radiusKey: prop }],
        }
      )
    }
  }

  return styles
}

export function buildFigmaSpec(
  tokens: ThemeTokens,
  options: BuildOptions = {}
): FigmaSpec {
  const variables: Record<CollectionName, VariableSpec[]> = {
    Color: [],
    Typography: [],
    Size: [],
  }
  const skipped: string[] = []

  for (const [prop, raw] of tokens) {
    if (prop === "--spacing") {
      const spacing = spacingVariables(raw)
      if (spacing) {
        variables.Size.push(...spacing)
      } else {
        skipped.push(prop)
      }
      continue
    }

    const converted = convertToken(prop, raw, tokens, options)
    if (converted === "skipped") {
      skipped.push(prop)
    } else if (converted) {
      variables[converted.collection].push(converted.variable)
    }
  }

  return {
    collections: (["Color", "Typography", "Size"] as const).map((name) => ({
      name,
      variables: variables[name],
    })),
    textStyles: textStyles(
      variables.Typography,
      options.textStyleSlots ?? ["sans"]
    ),
    effectStyles: effectStyles(tokens, options, skipped),
    skipped,
  }
}
