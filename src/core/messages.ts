import type { FigmaSpec } from "./figma-spec/build"
import type { Overrides } from "./theme/model"

export type Language = "en" | "ko"

export type SyncSummary = {
  created: number
  updated: number
  unchanged: number
  /** Names of styles left out, e.g. weights the font family lacks. */
  skipped: string[]
  /** Items left in the file because their group is unchecked for this apply. */
  orphans: string[]
  /** Items this plugin created whose tokens are no longer in the theme. */
  deleted: string[]
  /** Items edited by hand in Figma whose values the spec replaces. */
  overwritten: string[]
  /** Dark values were requested but the file's plan does not allow modes. */
  darkUnavailable: boolean
}

export type UiMessage =
  | { type: "ready" }
  | { type: "preview"; spec: FigmaSpec; retained: string[] }
  | { type: "apply"; spec: FigmaSpec; retained: string[] }
  | { type: "save"; overrides: Overrides }
  | { type: "language"; language: Language }

export type PluginMessage =
  | {
      type: "init"
      /** Stored overrides as JSON, or null when the file has none. */
      overrides: string | null
      language: Language | null
    }
  | { type: "fonts"; families: string[] }
  | { type: "preview"; summary: SyncSummary }
  | { type: "applied"; summary: SyncSummary }
  | { type: "error"; message: string }
