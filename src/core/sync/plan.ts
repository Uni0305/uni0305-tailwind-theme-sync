import type { FigmaColor } from "../convert/color"
import { round } from "../convert/units"
import type {
  CollectionName,
  EffectStyleSpec,
  FigmaSpec,
  TextStyleSpec,
  VariableScope,
  VariableSpec,
} from "../figma-spec/build"
import type { SyncSummary } from "../messages"
import { createFontResolver } from "./fonts"
import type { FontRef } from "./fonts"
import type { Snapshot, SnapshotValue, TextField } from "./snapshot"

/** A value to write; `aliasOf` makes it an alias once its target exists. */
export type PlannedValue = { value: VariableSpec["value"]; aliasOf?: string }

export type Op =
  | { kind: "createCollection"; name: CollectionName }
  /** Marks a collection that was already in the file as the plugin's. */
  | { kind: "useCollection"; id: string; name: CollectionName }
  /** Adds the Dark mode; it can fail on plans without multiple modes. */
  | { kind: "addDarkMode"; collection: CollectionName }
  | {
      kind: "createVariable"
      collection: CollectionName
      key: string
      name: string
      type: VariableSpec["type"]
      codeSyntax: string
      scopes?: VariableScope[]
      light: PlannedValue
      dark?: PlannedValue
      applied: string
      /** Stored instead of `applied` if the Dark mode could not be added. */
      appliedWithoutDark: string
    }
  | {
      kind: "updateVariable"
      id: string
      collection: CollectionName
      key: string
      applied: string
      /** Stored instead of `applied` if the Dark mode could not be added. */
      appliedWithoutDark: string
      /** The fields below are present only when they change. */
      name?: string
      light?: PlannedValue
      dark?: PlannedValue
      codeSyntax?: string
      scopes?: VariableScope[]
    }
  | {
      kind: "createTextStyle"
      key: string
      name: string
      font: FontRef
      fontSize: number
      lineHeight?: number
      /** Variable keys to bind, by text field. */
      bind: Partial<Record<TextField, string>>
      applied: string
    }
  | {
      kind: "updateTextStyle"
      id: string
      key: string
      applied: string
      /** The fields below are present only when they change. */
      name?: string
      font?: FontRef
      fontSize?: number
      lineHeight?: number
      bind?: Partial<Record<TextField, string>>
    }
  | {
      kind: "createEffectStyle"
      key: string
      name: string
      effects: EffectStyleSpec["effects"]
      applied: string
    }
  | {
      kind: "updateEffectStyle"
      id: string
      key: string
      applied: string
      /** The fields below are present only when they change. */
      name?: string
      effects?: EffectStyleSpec["effects"]
    }
  | {
      kind: "remove"
      target: "variable" | "textStyle" | "effectStyle"
      id: string
    }

export type SyncPlan = {
  summary: SyncSummary
  ops: Op[]
  /**
   * Variables the plan refers to but does not write, by token key. They
   * belong to unchecked groups and are already in the file; the executor
   * needs them to alias or bind to.
   */
  references: Record<string, string>
}

function colorSignature(color: FigmaColor) {
  return [color.r, color.g, color.b, color.a].map(round).join(",")
}

function valueSignature(
  value: SnapshotValue | undefined,
  keyOfId: Map<string, string>
) {
  if (value === undefined) {
    return "other"
  }
  if (typeof value === "number") {
    return String(round(value))
  }
  if (typeof value === "string") {
    return `"${value}"`
  }
  if ("aliasId" in value) {
    return `alias:${keyOfId.get(value.aliasId) ?? value.aliasId}`
  }

  return colorSignature(value)
}

/** The value a spec variable should hold in a mode. */
function plannedSignature(target: PlannedValue, keyOfId: Map<string, string>) {
  return target.aliasOf
    ? `alias:${target.aliasOf}`
    : valueSignature(target.value, keyOfId)
}

/** What every planner reads and writes while one plan is built. */
type PlanContext = {
  snapshot: Snapshot
  retained: ReadonlySet<string>
  /** Spec key to the id of the variable already in the file, or null. */
  resolved: Map<string, string | null>
  /** Retained keys to the id of the variable in the file, outside the spec. */
  held: Map<string, string>
  /** The `held` entries something in the plan actually points at. */
  references: Record<string, string>
  keyOfId: Map<string, string>
  summary: SyncSummary
  ops: Op[]
}

/**
 * Points the plan at the variable a token key stands for and returns its id:
 * the one in the spec (null while it is still to be created), or one that an
 * unchecked group keeps in the file, which is then listed in `references`.
 * Undefined when there is none, so nothing can point at it.
 */
function pointAt(ctx: PlanContext, key: string) {
  if (ctx.resolved.has(key)) {
    return ctx.resolved.get(key)
  }

  const held = ctx.held.get(key)
  if (held !== undefined) {
    ctx.references[key] = held
  }

  return held
}

/**
 * Handles the items this plugin created that the spec no longer mentions.
 * Those in unchecked groups stay in the file; the rest have left the theme
 * and are deleted. Items without a token key are never touched.
 */
function sweep(
  items: { id: string; key: string; name: string }[],
  kept: ReadonlySet<string>,
  target: Extract<Op, { kind: "remove" }>["target"],
  { retained, summary, ops }: PlanContext
) {
  for (const item of items) {
    if (!item.key || kept.has(item.id)) {
      continue
    }

    if (retained.has(item.key)) {
      summary.orphans.push(item.name)
    } else {
      summary.deleted.push(item.name)
      ops.push({ kind: "remove", target, id: item.id })
    }
  }
}

/**
 * Replaces the variable ids in a stored signature with the token keys they
 * stood for, since older applies wrote ids.
 */
function withKeys(applied: string, keyOfId: Map<string, string>) {
  let result = applied.replace(
    /alias:([^|]+)/g,
    (_, id: string) => `alias:${keyOfId.get(id) ?? id}`
  )
  // Effect signatures quote the id of the variable a blur is bound to.
  for (const [id, key] of keyOfId) {
    result = result.split(`"${id}"`).join(`"${key}"`)
  }

  return result
}

/**
 * A variable's signature is `light|dark`. Older applies stored only the light
 * half, which reads as the same value in both modes.
 */
function normalizeVariableApplied(
  applied: string,
  keyOfId: Map<string, string>
) {
  if (!applied) {
    return ""
  }

  const keyed = withKeys(applied, keyOfId)

  return keyed.includes("|") ? keyed : `${keyed}|${keyed}`
}

/**
 * Variables that point at other colors go last, each after its own target,
 * so the target exists by the time the alias is written.
 */
function orderForCreation(variables: VariableSpec[]) {
  const byKey = new Map(variables.map((v) => [v.key, v]))
  const depth = (variable: VariableSpec, seen = new Set<string>()): number => {
    const target =
      variable.type === "COLOR" && variable.aliasOf
        ? byKey.get(variable.aliasOf)
        : undefined
    if (!target || seen.has(variable.key)) {
      return 0
    }

    return 1 + depth(target, new Set(seen).add(variable.key))
  }

  return variables
    .map((variable, index) => ({ variable, index, depth: depth(variable) }))
    .sort((a, b) => a.depth - b.depth || a.index - b.index)
    .map((entry) => entry.variable)
}

const TEXT_FIELDS = [
  "fontFamily",
  "fontWeight",
  "fontSize",
  "lineHeight",
] as const

function pixelsSignature(value: number) {
  return `px:${round(value)}`
}

function textSignature(
  font: FontRef,
  fontSize: number,
  lineHeight: string,
  bound: Partial<Record<TextField, string>>
) {
  return JSON.stringify([
    `${font.family}/${font.style}`,
    fontSize,
    lineHeight,
    TEXT_FIELDS.map((field) => bound[field] ?? ""),
  ])
}

function planTextStyles(specs: TextStyleSpec[], ctx: PlanContext) {
  const { snapshot, keyOfId, summary, ops } = ctx
  const resolveFont = createFontResolver(snapshot.fonts)
  const kept = new Set<string>()

  for (const spec of specs) {
    const existing =
      snapshot.textStyles.find((s) => s.key === spec.key) ??
      snapshot.textStyles.find((s) => s.name === spec.name)
    if (existing) {
      kept.add(existing.id)
    }

    const font = resolveFont(spec.family, spec.weight)
    if (!font) {
      summary.skipped.push(spec.name)
      continue
    }

    // A binding counts when its variable is in the file, kept there by an
    // unchecked group, or will be created by this run.
    const wanted: Partial<Record<TextField, string>> = {}
    for (const field of TEXT_FIELDS) {
      const key = spec.bindings[field]
      if (key && pointAt(ctx, key) !== undefined) {
        wanted[field] = key
      }
    }

    if (!existing) {
      summary.created += 1
      ops.push({
        kind: "createTextStyle",
        key: spec.key,
        name: spec.name,
        font,
        fontSize: spec.fontSize,
        ...(spec.lineHeight === undefined
          ? {}
          : { lineHeight: spec.lineHeight }),
        bind: wanted,
        applied: textSignature(
          font,
          spec.fontSize,
          spec.lineHeight === undefined ? "" : pixelsSignature(spec.lineHeight),
          wanted
        ),
      })
      continue
    }

    const current = existing.lineHeight
    const currentLineHeight =
      current.unit === "PIXELS"
        ? pixelsSignature(current.value ?? 0)
        : `${current.unit}:${current.value ?? ""}`
    const currentBound: Partial<Record<TextField, string>> = {}
    for (const field of TEXT_FIELDS) {
      const id = existing.bound[field]
      if (id) {
        currentBound[field] = keyOfId.get(id) ?? id
      }
    }

    const renamed = existing.name !== spec.name
    const refonted =
      existing.font.family !== font.family || existing.font.style !== font.style
    const resized = existing.fontSize !== spec.fontSize
    const reheighted =
      spec.lineHeight !== undefined &&
      (current.unit !== "PIXELS" || current.value !== spec.lineHeight)
    const bind: Partial<Record<TextField, string>> = {}
    for (const field of TEXT_FIELDS) {
      const key = wanted[field]
      if (!key) {
        continue
      }
      const id = pointAt(ctx, key)
      if (id === null || existing.bound[field] !== id) {
        bind[field] = key
      }
    }
    const rebound = Object.keys(bind).length > 0

    const next = textSignature(
      font,
      spec.fontSize,
      spec.lineHeight === undefined
        ? currentLineHeight
        : pixelsSignature(spec.lineHeight),
      { ...currentBound, ...wanted }
    )
    const now = textSignature(
      existing.font,
      existing.fontSize,
      currentLineHeight,
      currentBound
    )
    const applied = withKeys(existing.applied, keyOfId)
    if (now !== next && applied && applied !== now) {
      summary.overwritten.push(existing.name)
    }

    if (renamed || refonted || resized || reheighted || rebound) {
      summary.updated += 1
    } else {
      summary.unchanged += 1
    }

    ops.push({
      kind: "updateTextStyle",
      id: existing.id,
      key: spec.key,
      applied: next,
      ...(renamed ? { name: spec.name } : {}),
      ...(refonted ? { font } : {}),
      ...(resized ? { fontSize: spec.fontSize } : {}),
      ...(reheighted ? { lineHeight: spec.lineHeight } : {}),
      ...(rebound ? { bind } : {}),
    })
  }

  sweep(snapshot.textStyles, kept, "textStyle", ctx)
}

/** The part of an effect that counts when comparing two of them. */
type EffectShape =
  | {
      type: "DROP_SHADOW" | "INNER_SHADOW"
      color: FigmaColor
      offset: { x: number; y: number }
      radius: number
      spread: number
    }
  | {
      type: "LAYER_BLUR" | "BACKGROUND_BLUR"
      radius: number
      /** Token key of the variable the radius is bound to, if any. */
      boundKey: string | null
    }
  | { type: "OTHER" }

function effectSignature(effects: EffectShape[]) {
  return JSON.stringify(
    effects.map((effect) => {
      if ("boundKey" in effect) {
        return [effect.type, round(effect.radius), effect.boundKey]
      }
      if ("color" in effect) {
        const { r, g, b, a } = effect.color

        return [
          effect.type,
          [r, g, b, a].map(round),
          round(effect.offset.x),
          round(effect.offset.y),
          round(effect.radius),
          round(effect.spread),
        ]
      }

      return [effect.type]
    })
  )
}

function planEffectStyles(specs: EffectStyleSpec[], ctx: PlanContext) {
  const { snapshot, keyOfId, summary, ops } = ctx
  const kept = new Set<string>()

  for (const spec of specs) {
    const existing =
      snapshot.effectStyles.find((s) => s.key === spec.key) ??
      snapshot.effectStyles.find((s) => s.name === spec.name)

    // A blur is bound when its variable is in the file or will be created
    // by this run; otherwise it stays a plain radius.
    const next = effectSignature(
      spec.effects.map((effect): EffectShape =>
        "radiusKey" in effect
          ? {
              type: effect.type,
              radius: effect.radius,
              boundKey:
                pointAt(ctx, effect.radiusKey) !== undefined
                  ? effect.radiusKey
                  : null,
            }
          : effect
      )
    )

    if (!existing) {
      summary.created += 1
      ops.push({
        kind: "createEffectStyle",
        key: spec.key,
        name: spec.name,
        effects: spec.effects,
        applied: next,
      })
      continue
    }

    kept.add(existing.id)

    const current = effectSignature(
      existing.effects.map((effect): EffectShape => {
        if (!("radiusBoundId" in effect)) {
          return effect
        }
        const id = effect.radiusBoundId

        return {
          type: effect.type,
          radius: effect.radius,
          boundKey: id === null ? null : (keyOfId.get(id) ?? id),
        }
      })
    )
    const applied = withKeys(existing.applied, keyOfId)
    const renamed = existing.name !== spec.name
    const restyled = current !== next

    if (restyled && applied && applied !== current) {
      summary.overwritten.push(existing.name)
    }
    if (renamed || restyled) {
      summary.updated += 1
    } else {
      summary.unchanged += 1
    }

    ops.push({
      kind: "updateEffectStyle",
      id: existing.id,
      key: spec.key,
      applied: next,
      ...(renamed ? { name: spec.name } : {}),
      ...(restyled ? { effects: spec.effects } : {}),
    })
  }

  sweep(snapshot.effectStyles, kept, "effectStyle", ctx)
}

export function planSync(
  spec: FigmaSpec,
  snapshot: Snapshot,
  retained: ReadonlySet<string>
): SyncPlan {
  const summary: SyncSummary = {
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: [],
    orphans: [],
    deleted: [],
    overwritten: [],
    darkUnavailable: false,
  }
  const ops: Op[] = []
  const resolved = new Map<string, string | null>()
  const keyOfId = new Map(
    snapshot.variables.filter((v) => v.key).map((v) => [v.id, v.key])
  )
  const specKeys = new Set(
    spec.collections.flatMap((c) => c.variables.map((v) => v.key))
  )
  const held = new Map<string, string>()
  for (const variable of snapshot.variables) {
    if (
      retained.has(variable.key) &&
      !specKeys.has(variable.key) &&
      !held.has(variable.key)
    ) {
      held.set(variable.key, variable.id)
    }
  }
  const ctx: PlanContext = {
    snapshot,
    retained,
    resolved,
    held,
    references: {},
    keyOfId,
    summary,
    ops,
  }

  for (const collection of spec.collections) {
    const existingCollection =
      snapshot.collections.find((c) => c.key === collection.name) ??
      snapshot.collections.find((c) => c.name === collection.name)
    if (!existingCollection && collection.variables.length === 0) {
      continue
    }
    ops.push(
      existingCollection
        ? {
            kind: "useCollection",
            id: existingCollection.id,
            name: collection.name,
          }
        : { kind: "createCollection", name: collection.name }
    )

    // Dark values need a second mode. A new mode starts as a copy of the
    // default one, so until it exists the dark half of a signature is the
    // light half.
    const darkMode = existingCollection?.modes.find((m) => m.name === "Dark")
    const wantsDark = collection.variables.some(
      (v) => v.type === "COLOR" && v.dark
    )
    if (!darkMode && wantsDark) {
      ops.push({ kind: "addDarkMode", collection: collection.name })
    }
    const hasDark = !!darkMode || wantsDark

    const inCollection = snapshot.variables.filter(
      (v) => v.collectionId === existingCollection?.id
    )
    const byKey = new Map(inCollection.map((v) => [v.key, v]))
    const byName = new Map(inCollection.map((v) => [v.name, v]))
    const modeId = existingCollection?.defaultModeId ?? ""
    const kept = new Set<string>()
    const planned = new Set(collection.variables.map((v) => v.key))

    for (const variable of orderForCreation(collection.variables)) {
      const found = byKey.get(variable.key) ?? byName.get(variable.name)
      const existing = found?.type === variable.type ? found : undefined
      const light: PlannedValue =
        variable.type === "COLOR" &&
        variable.aliasOf &&
        (planned.has(variable.aliasOf) ||
          pointAt(ctx, variable.aliasOf) !== undefined)
          ? { value: variable.value, aliasOf: variable.aliasOf }
          : { value: variable.value }
      const dark: PlannedValue =
        variable.type === "COLOR" && variable.dark
          ? { value: variable.dark }
          : light
      const lightNext = plannedSignature(light, keyOfId)
      const next = `${lightNext}|${plannedSignature(dark, keyOfId)}`
      const appliedWithoutDark = `${lightNext}|${lightNext}`

      resolved.set(variable.key, existing?.id ?? null)
      if (!existing) {
        summary.created += 1
        ops.push({
          kind: "createVariable",
          collection: collection.name,
          key: variable.key,
          name: variable.name,
          type: variable.type,
          codeSyntax: variable.codeSyntax,
          scopes: variable.scopes,
          light,
          ...(hasDark ? { dark } : {}),
          applied: next,
          appliedWithoutDark,
        })
        continue
      }

      kept.add(existing.id)
      const currentLight = valueSignature(
        existing.valuesByMode[modeId],
        keyOfId
      )
      const currentDark = darkMode
        ? valueSignature(existing.valuesByMode[darkMode.id], keyOfId)
        : currentLight
      const current = `${currentLight}|${currentDark}`
      const renamed = existing.name !== variable.name
      const revalued = current !== next
      const resyntaxed = existing.codeSyntax !== variable.codeSyntax
      // Only a variable still on Figma's default is narrowed; a scope someone
      // set by hand is left as it is.
      const rescoped =
        !!variable.scopes &&
        existing.scopes.length === 1 &&
        existing.scopes[0] === "ALL_SCOPES"

      const applied = normalizeVariableApplied(existing.applied, keyOfId)
      if (revalued && applied && applied !== current) {
        summary.overwritten.push(existing.name)
      }
      if (renamed || revalued || resyntaxed || rescoped) {
        summary.updated += 1
      } else {
        summary.unchanged += 1
      }

      ops.push({
        kind: "updateVariable",
        id: existing.id,
        collection: collection.name,
        key: variable.key,
        applied: next,
        appliedWithoutDark,
        ...(renamed ? { name: variable.name } : {}),
        ...(revalued ? { light, ...(hasDark ? { dark } : {}) } : {}),
        ...(resyntaxed ? { codeSyntax: variable.codeSyntax } : {}),
        ...(rescoped ? { scopes: variable.scopes } : {}),
      })
    }

    sweep(inCollection, kept, "variable", ctx)
  }

  for (const [key, id] of resolved) {
    if (id) {
      keyOfId.set(id, key)
    }
  }
  planTextStyles(spec.textStyles, ctx)
  planEffectStyles(spec.effectStyles, ctx)

  return { summary, ops, references: ctx.references }
}
