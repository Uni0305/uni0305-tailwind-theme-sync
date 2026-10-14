import type { FigmaColor } from "../convert/color"
import type { FontRef } from "./fonts"

/**
 * What the sandbox read from the document, as plain data. The plan module
 * sees nothing of Figma but this, so it can run anywhere.
 */

export type SnapshotValue = number | string | FigmaColor | { aliasId: string }

export type SnapshotCollection = {
  id: string
  name: string
  /** Value of the plugin's token marker, empty when the plugin did not make it. */
  key: string
  defaultModeId: string
  modes: { id: string; name: string }[]
}

export type SnapshotVariable = {
  id: string
  collectionId: string
  /** Plugin token key, empty for variables the plugin did not make. */
  key: string
  /** Signature stored when the plugin last wrote the variable. */
  applied: string
  name: string
  type: "COLOR" | "FLOAT" | "STRING"
  valuesByMode: Record<string, SnapshotValue>
  /** Web code syntax, empty when unset. */
  codeSyntax: string
  scopes: string[]
}

export type TextField = "fontFamily" | "fontWeight" | "fontSize" | "lineHeight"

export type SnapshotTextStyle = {
  id: string
  key: string
  applied: string
  name: string
  font: FontRef
  fontSize: number
  lineHeight: { unit: "PIXELS" | "PERCENT" | "AUTO"; value?: number }
  /** Ids of the variables bound to each text field. */
  bound: Partial<Record<TextField, string>>
}

export type SnapshotEffect =
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
      /** Id of the variable the radius is bound to. */
      radiusBoundId: string | null
    }
  | { type: "OTHER" }

export type SnapshotEffectStyle = {
  id: string
  key: string
  applied: string
  name: string
  effects: SnapshotEffect[]
}

export type Snapshot = {
  collections: SnapshotCollection[]
  variables: SnapshotVariable[]
  textStyles: SnapshotTextStyle[]
  effectStyles: SnapshotEffectStyle[]
  fonts: FontRef[]
}
