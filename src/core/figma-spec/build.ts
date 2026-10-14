import { toFigmaColor } from "../convert/color"
import type { FigmaColor } from "../convert/color"
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

/** The subset of Figma's `VariableScope` that this plugin assigns. */
export type VariableScope =
  | "WIDTH_HEIGHT"
  | "GAP"
  | "CORNER_RADIUS"
  | "EFFECT_FLOAT"
  | "FONT_FAMILY"
  | "FONT_WEIGHT"
  | "FONT_SIZE"
  | "LINE_HEIGHT"
  | "LETTER_SPACING"

export type VariableSpec = VariableValue & {
  /** Identifies the source token, used to find the variable on re-runs. */
  key: string
  name: string
  codeSyntax: string
  /** Fields the variable is offered in; omitted to leave Figma's default. */
  scopes?: VariableScope[]
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
  /**
   * Keys the spec would have had if every token converted. Whatever the
   * file already holds under one of them is left alone, not deleted.
   */
  unconvertedKeys: string[]
  /**
   * Keys that renamed tokens' items had before, mapped to the keys they have
   * now, so the sync can find what the file still holds under an old key.
   */
  renamed: Record<string, string>
}

export type BuildOptions = {
  /** Figma font family per font slot (`sans`, `serif`, `mono`, custom). */
  fontFamilies?: Record<string, string>
  /** Dark-mode color values, by CSS custom property. */
  dark?: Record<string, string>
  /** Font slots that get a full set of text styles. Defaults to `sans`. */
  textStyleSlots?: string[]
  /** Earlier names of renamed tokens, by CSS custom property. */
  renames?: Record<string, string[]>
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

/** Length namespaces that become Size variables, and where each is offered. */
const LENGTH_SCOPES = new Map<string, VariableScope[]>([
  ["radius", ["CORNER_RADIUS"]],
  ["breakpoint", ["WIDTH_HEIGHT"]],
  ["container", ["WIDTH_HEIGHT"]],
  ["blur", ["EFFECT_FLOAT"]],
])

const SPACING_SCOPES: VariableScope[] = ["GAP", "WIDTH_HEIGHT"]

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

/** Spec key of one step of the spacing scale. */
function spacingKey(step: string) {
  return `--spacing*${step}`
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
  value: number | null,
  scopes: VariableScope[]
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
      scopes,
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
    const value = toFigmaColor(followColorAliases(raw, tokens))
    if (!value) {
      return "skipped"
    }

    const darkRaw = options.dark?.[prop]
    const dark = darkRaw
      ? toFigmaColor(followColorAliases(darkRaw, tokens))
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
      weight?.unit === "" ? weight.value : null,
      ["FONT_WEIGHT"]
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
        scopes: ["FONT_FAMILY"],
      },
    }
  }

  if (namespace === "text" && !rest.startsWith("shadow-")) {
    const [size, property] = rest.split("--")
    if (property === undefined) {
      return float("Typography", prop, `text/${size}/size`, pixels(raw), [
        "FONT_SIZE",
      ])
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

    return float("Typography", prop, `text/${size}/line-height`, value, [
      "LINE_HEIGHT",
    ])
  }

  if (namespace === "leading") {
    const leading = evaluate(raw)
    const value =
      leading && (leading.unit === "" || leading.unit === "px")
        ? round(leading.value)
        : null

    return float("Typography", prop, `leading/${rest}`, value, ["LINE_HEIGHT"])
  }

  if (namespace === "tracking") {
    // Stored as a percentage of the font size, the unit Figma uses.
    const tracking = evaluate(raw)
    const value = tracking?.unit === "em" ? round(tracking.value * 100) : null

    return float("Typography", prop, `tracking/${rest}`, value, [
      "LETTER_SPACING",
    ])
  }

  const lengthScopes = LENGTH_SCOPES.get(namespace)
  if (lengthScopes) {
    return float(
      "Size",
      prop,
      `${namespace}/${rest}`,
      pixels(raw),
      lengthScopes
    )
  }

  return null
}

function spacingVariables(raw: string): VariableSpec[] | null {
  const base = pixels(raw)
  if (base === null) {
    return null
  }

  return SPACING_STEPS.map((step) => ({
    key: spacingKey(step),
    name: spacingVariableName(step),
    type: "FLOAT",
    value: step === "px" ? 1 : round(base * Number(step)),
    codeSyntax: step === "px" ? "1px" : `calc(var(--spacing) * ${step})`,
    scopes: SPACING_SCOPES,
  }))
}

function textStyles(
  typography: VariableSpec[],
  slots: string[],
  skipped: string[],
  unconvertedKeys: string[]
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

  // A size or weight that failed leaves holes in the grid of styles; the
  // styles that would have filled them are not deleted if they exist.
  const failed = (prefix: string, accept: (rest: string) => boolean) =>
    skipped.flatMap((prop) =>
      prop.startsWith(prefix) && accept(prop.slice(prefix.length))
        ? [prop.slice(prefix.length)]
        : []
    )
  const failedSizes = failed(
    "--text-",
    (rest) => !rest.includes("--") && !rest.startsWith("shadow-")
  )
  const failedWeights = failed("--font-weight-", () => true)
  if (failedSizes.length > 0 || failedWeights.length > 0) {
    const made = new Set(styles.map((style) => style.key))
    const sizeNames = [
      ...sizes.map((size) => size.key.slice("--text-".length)),
      ...failedSizes,
    ]
    const weightNames = [
      ...weights.map((weight) => weight.key.slice("--font-weight-".length)),
      ...failedWeights,
    ]

    for (const slot of slots) {
      if (byKey.get(`--font-${slot}`)?.type !== "STRING") {
        continue
      }
      for (const size of sizeNames) {
        for (const weight of weightNames) {
          const key = `text:${slot}/${size}/${weight}`
          if (!made.has(key)) {
            unconvertedKeys.push(key)
          }
        }
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
  skipped: string[],
  unconvertedKeys: string[]
): EffectStyleSpec[] {
  const styles: EffectStyleSpec[] = []

  for (const [prop, raw] of tokens) {
    const namespace = SHADOW_NAMESPACES.find((ns) =>
      prop.startsWith(`--${ns}-`)
    )
    if (namespace) {
      const effects = parseShadows(raw, {
        inner: namespace === "inset-shadow",
      })
      if (!effects) {
        skipped.push(prop)
        unconvertedKeys.push(prop)
        continue
      }

      const name = `${namespace}/${prop.slice(namespace.length + 3)}`
      styles.push({ key: prop, name, effects })
      continue
    }

    if (prop.startsWith("--blur-")) {
      const radius = pixels(raw)
      if (radius === null) {
        // The `--blur-*` variable already reported it as skipped.
        unconvertedKeys.push(`${prop}@layer`, `${prop}@backdrop`)
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

/** The keys an item had under the earlier names of the tokens it comes from. */
function previousKeys(key: string, renames: Record<string, string[]>) {
  const names = (prefix: string, name: string) => [
    name,
    ...(renames[prefix + name] ?? []).map((prop) => prop.slice(prefix.length)),
  ]

  // A text style is named after its font slot, size and weight, any of
  // which may have been renamed.
  const text = /^text:([^/]+)\/([^/]+)\/([^/]+)$/.exec(key)
  if (text) {
    const keys: string[] = []
    for (const slot of names("--font-", text[1])) {
      for (const size of names("--text-", text[2])) {
        for (const weight of names("--font-weight-", text[3])) {
          keys.push(`text:${slot}/${size}/${weight}`)
        }
      }
    }

    return keys.slice(1)
  }

  const [prop, suffix] = key.split("@")
  const previous = renames[prop] ?? []

  return suffix === undefined
    ? previous
    : previous.map((old) => `${old}@${suffix}`)
}

/**
 * Maps earlier keys to current ones. A key some item still uses, or one that
 * two items could have had, is left out, so it cannot take the wrong item.
 */
function renamedKeys(keys: string[], renames: Record<string, string[]>) {
  const current = new Set(keys)
  const found = new Map<string, string | null>()

  for (const key of keys) {
    for (const previous of previousKeys(key, renames)) {
      if (!current.has(previous)) {
        const other = found.get(previous)
        found.set(previous, other === undefined || other === key ? key : null)
      }
    }
  }

  const renamed: Record<string, string> = {}
  for (const [previous, key] of found) {
    if (key !== null) {
      renamed[previous] = key
    }
  }

  return renamed
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
  const unconvertedKeys: string[] = []

  for (const [prop, raw] of tokens) {
    if (prop === "--spacing") {
      const spacing = spacingVariables(raw)
      if (spacing) {
        variables.Size.push(...spacing)
      } else {
        skipped.push(prop)
        unconvertedKeys.push(...SPACING_STEPS.map(spacingKey))
      }
      continue
    }

    const converted = convertToken(prop, raw, tokens, options)
    if (converted === "skipped") {
      skipped.push(prop)
      unconvertedKeys.push(prop)
    } else if (converted) {
      variables[converted.collection].push(converted.variable)
    }
  }

  const typography = textStyles(
    variables.Typography,
    options.textStyleSlots ?? ["sans"],
    skipped,
    unconvertedKeys
  )
  const effects = effectStyles(tokens, skipped, unconvertedKeys)
  const keys = [
    ...variables.Color,
    ...variables.Typography,
    ...variables.Size,
    ...typography,
    ...effects,
  ].map((item) => item.key)

  return {
    collections: (["Color", "Typography", "Size"] as const).map((name) => ({
      name,
      variables: variables[name],
    })),
    textStyles: typography,
    effectStyles: effects,
    skipped,
    unconvertedKeys,
    renamed: renamedKeys([...keys, ...unconvertedKeys], options.renames ?? {}),
  }
}
