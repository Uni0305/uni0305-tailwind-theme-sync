import type { CollectionName } from "../core/figma-spec/build"
import type { Op, PlannedValue } from "../core/sync/plan"
import type { TextField } from "../core/sync/snapshot"
import { createFontLoader } from "./fonts"
import { APPLIED_KEY, TOKEN_KEY } from "./keys"

type CollectionState = {
  collection: VariableCollection
  modeId: string
  darkModeId?: string
}

async function variableById(id: string) {
  const variable = await figma.variables.getVariableByIdAsync(id)
  if (!variable) {
    throw new Error("A variable changed while the plan was running.")
  }

  return variable
}

async function styleById<T extends BaseStyle>(id: string) {
  const style = await figma.getStyleByIdAsync(id)
  if (!style) {
    throw new Error("A style changed while the plan was running.")
  }

  return style as T
}

function buildEffects(
  effects: Extract<Op, { kind: "createEffectStyle" }>["effects"],
  variablesByKey: Map<string, Variable>
): Effect[] {
  return effects.map((effect): Effect => {
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
    const variable = variablesByKey.get(effect.radiusKey)

    return variable
      ? figma.variables.setBoundVariableForEffect(blur, "radius", variable)
      : blur
  })
}

/**
 * Carries out a plan against the document. All decisions were made by the
 * plan; this only turns ops into Figma calls. Returns whether the Dark mode
 * could not be added.
 */
export async function executePlan(
  ops: Op[],
  available: readonly FontName[],
  families: ReadonlySet<string>,
  references: Readonly<Record<string, string>>
) {
  const fonts = createFontLoader(available)
  const collections = new Map<CollectionName, CollectionState>()
  const variablesByKey = new Map<string, Variable>()
  let darkUnavailable = false

  // Variables of unchecked groups that something below aliases or binds to.
  for (const [key, id] of Object.entries(references)) {
    variablesByKey.set(key, await variableById(id))
  }

  // Text styles bound to a font variable switch fonts the moment the
  // variable changes, which fails unless the new family is already loaded.
  await Promise.all([...families].map(fonts.loadFamily))

  const stateOf = (name: CollectionName) => {
    const state = collections.get(name)
    if (!state) {
      throw new Error(`The ${name} collection was not set up.`)
    }

    return state
  }

  /** An alias once its target exists, otherwise the literal value. */
  const valueOf = (target: PlannedValue): VariableValue => {
    const aliased = target.aliasOf && variablesByKey.get(target.aliasOf)

    return aliased ? figma.variables.createVariableAlias(aliased) : target.value
  }

  /** Without a Dark mode only the light half was written. */
  const appliedOf = (
    op: { applied: string; appliedWithoutDark: string },
    state: CollectionState
  ) => (state.darkModeId ? op.applied : op.appliedWithoutDark)

  const setValues = (
    variable: Variable,
    state: CollectionState,
    light: PlannedValue,
    dark: PlannedValue | undefined
  ) => {
    variable.setValueForMode(state.modeId, valueOf(light))
    if (state.darkModeId && dark) {
      variable.setValueForMode(state.darkModeId, valueOf(dark))
    }
  }

  const bindFields = (
    style: TextStyle,
    bind: Partial<Record<TextField, string>>
  ) => {
    for (const [field, key] of Object.entries(bind)) {
      const variable = variablesByKey.get(key)
      if (variable) {
        style.setBoundVariable(field as TextField, variable)
      }
    }
  }

  for (const op of ops) {
    switch (op.kind) {
      case "createCollection": {
        const collection = figma.variables.createVariableCollection(op.name)
        collection.setPluginData(TOKEN_KEY, op.name)
        collections.set(op.name, {
          collection,
          modeId: collection.defaultModeId,
        })
        break
      }
      case "useCollection": {
        const collection = await figma.variables.getVariableCollectionByIdAsync(
          op.id
        )
        if (!collection) {
          throw new Error(`The ${op.name} collection was removed.`)
        }
        collection.setPluginData(TOKEN_KEY, op.name)
        collections.set(op.name, {
          collection,
          modeId: collection.defaultModeId,
          darkModeId: collection.modes.find((m) => m.name === "Dark")?.modeId,
        })
        break
      }
      case "addDarkMode": {
        const state = stateOf(op.collection)
        try {
          state.darkModeId = state.collection.addMode("Dark")
          if (state.collection.modes[0].name === "Mode 1") {
            state.collection.renameMode(state.modeId, "Light")
          }
        } catch {
          darkUnavailable = true
        }
        break
      }
      case "createVariable": {
        const state = stateOf(op.collection)
        const variable = figma.variables.createVariable(
          op.name,
          state.collection,
          op.type
        )
        variable.setPluginData(TOKEN_KEY, op.key)
        variable.setPluginData(APPLIED_KEY, appliedOf(op, state))
        setValues(variable, state, op.light, op.dark)
        variable.setVariableCodeSyntax("WEB", op.codeSyntax)
        if (op.scopes) {
          variable.scopes = op.scopes
        }
        variablesByKey.set(op.key, variable)
        break
      }
      case "updateVariable": {
        const state = stateOf(op.collection)
        const variable = await variableById(op.id)
        variable.setPluginData(TOKEN_KEY, op.key)
        variable.setPluginData(APPLIED_KEY, appliedOf(op, state))
        if (op.name !== undefined) {
          variable.name = op.name
        }
        if (op.light) {
          setValues(variable, state, op.light, op.dark)
        }
        if (op.codeSyntax !== undefined) {
          variable.setVariableCodeSyntax("WEB", op.codeSyntax)
        }
        if (op.scopes) {
          variable.scopes = op.scopes
        }
        variablesByKey.set(op.key, variable)
        break
      }
      case "createTextStyle": {
        const style = figma.createTextStyle()
        await Promise.all([fonts.load(op.font), fonts.load(style.fontName)])
        style.setPluginData(TOKEN_KEY, op.key)
        style.setPluginData(APPLIED_KEY, op.applied)
        style.name = op.name
        style.fontName = op.font
        style.fontSize = op.fontSize
        if (op.lineHeight !== undefined) {
          style.lineHeight = { unit: "PIXELS", value: op.lineHeight }
        }
        bindFields(style, op.bind)
        break
      }
      case "updateTextStyle": {
        const style = await styleById<TextStyle>(op.id)
        style.setPluginData(TOKEN_KEY, op.key)
        style.setPluginData(APPLIED_KEY, op.applied)

        const edits =
          op.name !== undefined ||
          op.font ||
          op.fontSize !== undefined ||
          op.lineHeight !== undefined ||
          op.bind
        if (!edits) {
          break
        }

        // A style can only be edited while both its current and next fonts
        // are loaded.
        await Promise.all([
          fonts.load(op.font ?? style.fontName),
          fonts.load(style.fontName),
        ])
        if (op.name !== undefined) style.name = op.name
        if (op.font) style.fontName = op.font
        if (op.fontSize !== undefined) style.fontSize = op.fontSize
        if (op.lineHeight !== undefined) {
          style.lineHeight = { unit: "PIXELS", value: op.lineHeight }
        }
        if (op.bind) bindFields(style, op.bind)
        break
      }
      case "createEffectStyle": {
        const style = figma.createEffectStyle()
        style.name = op.name
        style.effects = buildEffects(op.effects, variablesByKey)
        style.setPluginData(TOKEN_KEY, op.key)
        style.setPluginData(APPLIED_KEY, op.applied)
        break
      }
      case "updateEffectStyle": {
        const style = await styleById<EffectStyle>(op.id)
        style.setPluginData(TOKEN_KEY, op.key)
        style.setPluginData(APPLIED_KEY, op.applied)
        if (op.name !== undefined) style.name = op.name
        if (op.effects) {
          style.effects = buildEffects(op.effects, variablesByKey)
        }
        break
      }
      case "remove": {
        if (op.target === "variable") {
          const variable = await figma.variables.getVariableByIdAsync(op.id)
          variable?.remove()
        } else {
          const style = await figma.getStyleByIdAsync(op.id)
          style?.remove()
        }
        break
      }
    }
  }

  return { darkUnavailable }
}
