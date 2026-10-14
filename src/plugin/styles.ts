import type { EffectStyleSpec, TextStyleSpec } from "../core/figma-spec/build"
import type { SyncSummary } from "../core/messages"
import type { Fonts } from "./fonts"
import { APPLIED_KEY, sweep, TOKEN_KEY } from "./keys"

type Variables = Map<string, Variable>

function findStyle<T extends BaseStyle>(
  styles: T[],
  spec: { key: string; name: string }
) {
  return (
    styles.find((style) => style.getPluginData(TOKEN_KEY) === spec.key) ??
    styles.find((style) => style.name === spec.name)
  )
}

function count(summary: SyncSummary, created: boolean, changed: boolean) {
  if (created) {
    summary.created += 1
  } else if (changed) {
    summary.updated += 1
  } else {
    summary.unchanged += 1
  }
}

function sameFont(a: FontName, b: FontName) {
  return a.family === b.family && a.style === b.style
}

const TEXT_FIELDS = [
  "fontFamily",
  "fontWeight",
  "fontSize",
  "lineHeight",
] as const

export async function syncTextStyles(
  specs: TextStyleSpec[],
  variables: Variables,
  planned: ReadonlySet<string>,
  fonts: Fonts,
  retained: ReadonlySet<string>,
  write: boolean,
  summary: SyncSummary
) {
  const styles = await figma.getLocalTextStylesAsync()
  const kept = new Set<string>()

  if (specs.length > 0) {
    for (const spec of specs) {
      const existing = findStyle(styles, spec)
      if (existing) {
        kept.add(existing.id)
      }

      const fontName = fonts.resolve(spec.family, spec.weight)
      if (!fontName) {
        summary.skipped.push(spec.name)
        continue
      }
      if (!existing) {
        summary.created += 1
        if (!write) {
          continue
        }
      }

      const lineHeight = existing?.lineHeight
      const changes = {
        name: existing?.name !== spec.name,
        fontName: !existing || !sameFont(existing.fontName, fontName),
        fontSize: existing?.fontSize !== spec.fontSize,
        lineHeight:
          spec.lineHeight !== undefined &&
          (lineHeight?.unit !== "PIXELS" ||
            lineHeight.value !== spec.lineHeight),
      }
      // A planned variable that does not exist yet will be created by this
      // run, so its binding counts as a change.
      const rebind = TEXT_FIELDS.filter((field) => {
        const key = spec.bindings[field]
        if (!key) {
          return false
        }

        const variable = variables.get(key)
        if (!variable) {
          return planned.has(key)
        }

        return existing?.boundVariables?.[field]?.id !== variable.id
      })

      if (existing) {
        const changed =
          Object.values(changes).some(Boolean) || rebind.length > 0
        count(summary, false, changed)
      }
      if (!write) {
        continue
      }

      const style = existing ?? figma.createTextStyle()
      // A style can only be edited while both its current and next fonts
      // are loaded.
      await Promise.all([fonts.load(fontName), fonts.load(style.fontName)])
      style.setPluginData(TOKEN_KEY, spec.key)

      if (changes.name) style.name = spec.name
      if (changes.fontName) style.fontName = fontName
      if (changes.fontSize) style.fontSize = spec.fontSize
      if (changes.lineHeight && spec.lineHeight !== undefined) {
        style.lineHeight = { unit: "PIXELS", value: spec.lineHeight }
      }
      for (const field of rebind) {
        const variable = variables.get(spec.bindings[field] ?? "")
        if (variable) {
          style.setBoundVariable(field, variable)
        }
      }
    }
  }

  sweep(styles, kept, retained, write, summary)
}

function round(value: number) {
  return Math.round(value * 1e4) / 1e4
}

/** Comparable summary of the effect fields this plugin manages. */
function signature(effects: readonly Effect[]) {
  return JSON.stringify(
    effects.map((effect) => {
      if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
        const { r, g, b, a } = effect.color
        return [
          effect.type,
          [r, g, b, a].map(round),
          round(effect.offset.x),
          round(effect.offset.y),
          round(effect.radius),
          round(effect.spread ?? 0),
        ]
      }
      if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
        return [
          effect.type,
          round(effect.radius),
          effect.boundVariables?.radius?.id ?? null,
        ]
      }

      return [effect.type]
    })
  )
}

function buildEffects(spec: EffectStyleSpec, variables: Variables): Effect[] {
  return spec.effects.map((effect): Effect => {
    if (!("radiusKey" in effect)) {
      return {
        type: effect.type,
        color: effect.color,
        offset: effect.offset,
        radius: effect.radius,
        spread: effect.spread,
        visible: true,
        blendMode: "NORMAL",
      }
    }

    const blur: Effect = {
      type: effect.type,
      blurType: "NORMAL",
      radius: effect.radius,
      visible: true,
    }
    const variable = variables.get(effect.radiusKey)

    return variable
      ? figma.variables.setBoundVariableForEffect(blur, "radius", variable)
      : blur
  })
}

export async function syncEffectStyles(
  specs: EffectStyleSpec[],
  variables: Variables,
  retained: ReadonlySet<string>,
  write: boolean,
  summary: SyncSummary
) {
  const styles = await figma.getLocalEffectStylesAsync()
  const kept = new Set<string>()

  for (const spec of specs) {
    const existing = findStyle(styles, spec)
    const effects = buildEffects(spec, variables)
    const next = signature(effects)

    if (!existing) {
      summary.created += 1
      if (write) {
        const style = figma.createEffectStyle()
        style.name = spec.name
        style.effects = effects
        style.setPluginData(TOKEN_KEY, spec.key)
        style.setPluginData(APPLIED_KEY, next)
      }
      continue
    }

    kept.add(existing.id)

    const current = signature(existing.effects)
    const applied = existing.getPluginData(APPLIED_KEY)
    const renamed = existing.name !== spec.name
    const restyled = current !== next

    if (restyled && applied && applied !== current) {
      summary.overwritten.push(existing.name)
    }
    count(summary, false, renamed || restyled)

    if (write) {
      existing.setPluginData(TOKEN_KEY, spec.key)
      existing.setPluginData(APPLIED_KEY, next)
      if (renamed) existing.name = spec.name
      if (restyled) existing.effects = effects
    }
  }

  sweep(styles, kept, retained, write, summary)
}
