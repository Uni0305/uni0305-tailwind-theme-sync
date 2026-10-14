import type {
  Snapshot,
  SnapshotEffect,
  SnapshotValue,
  SnapshotVariable,
  TextField,
} from "../core/sync/snapshot"
import { APPLIED_KEY, TOKEN_KEY } from "./keys"

const TEXT_FIELDS: TextField[] = [
  "fontFamily",
  "fontWeight",
  "fontSize",
  "lineHeight",
]

function snapshotValue(value: VariableValue): SnapshotValue {
  if (typeof value === "object" && "id" in value) {
    return { aliasId: value.id }
  }
  if (typeof value === "object" && "r" in value) {
    return { r: value.r, g: value.g, b: value.b, a: "a" in value ? value.a : 1 }
  }

  // Booleans and motion values are not something the plugin writes.
  return typeof value === "number" || typeof value === "string"
    ? value
    : String(value)
}

function snapshotEffect(effect: Effect): SnapshotEffect {
  if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
    return {
      type: effect.type,
      color: effect.color,
      offset: effect.offset,
      radius: effect.radius,
      spread: effect.spread ?? 0,
    }
  }
  if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
    return {
      type: effect.type,
      radius: effect.radius,
      radiusBoundId: effect.boundVariables?.radius?.id ?? null,
    }
  }

  return { type: "OTHER" }
}

/** Reads what the plan needs from the document, without changing anything. */
export async function readSnapshot(): Promise<Snapshot> {
  const [collections, variables, textStyles, effectStyles, fonts] =
    await Promise.all([
      figma.variables.getLocalVariableCollectionsAsync(),
      figma.variables.getLocalVariablesAsync(),
      figma.getLocalTextStylesAsync(),
      figma.getLocalEffectStylesAsync(),
      figma.listAvailableFontsAsync(),
    ])

  return {
    collections: collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      key: collection.getPluginData(TOKEN_KEY),
      defaultModeId: collection.defaultModeId,
      modes: collection.modes.map((mode) => ({
        id: mode.modeId,
        name: mode.name,
      })),
    })),
    variables: variables.flatMap((variable): SnapshotVariable[] => {
      // The plugin only makes color, number and string variables.
      const type = variable.resolvedType
      if (type !== "COLOR" && type !== "FLOAT" && type !== "STRING") {
        return []
      }

      return [
        {
          id: variable.id,
          collectionId: variable.variableCollectionId,
          key: variable.getPluginData(TOKEN_KEY),
          applied: variable.getPluginData(APPLIED_KEY),
          name: variable.name,
          type,
          valuesByMode: Object.fromEntries(
            Object.entries(variable.valuesByMode).map(([mode, value]) => [
              mode,
              snapshotValue(value),
            ])
          ),
          codeSyntax: variable.codeSyntax.WEB ?? "",
          scopes: [...variable.scopes],
        },
      ]
    }),
    textStyles: textStyles.map((style) => ({
      id: style.id,
      key: style.getPluginData(TOKEN_KEY),
      applied: style.getPluginData(APPLIED_KEY),
      name: style.name,
      font: style.fontName,
      fontSize: style.fontSize,
      lineHeight:
        style.lineHeight.unit === "AUTO"
          ? { unit: "AUTO" }
          : { unit: style.lineHeight.unit, value: style.lineHeight.value },
      bound: Object.fromEntries(
        TEXT_FIELDS.flatMap((field) => {
          const id = style.boundVariables?.[field]?.id

          return id ? [[field, id]] : []
        })
      ),
    })),
    effectStyles: effectStyles.map((style) => ({
      id: style.id,
      key: style.getPluginData(TOKEN_KEY),
      applied: style.getPluginData(APPLIED_KEY),
      name: style.name,
      effects: style.effects.map(snapshotEffect),
    })),
    fonts: fonts.map((font) => font.fontName),
  }
}
