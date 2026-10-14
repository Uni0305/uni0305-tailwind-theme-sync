import type { FigmaSpec } from "../core/figma-spec/build"
import type { SyncSummary } from "../core/messages"
import { planSync } from "../core/sync/plan"
import { executePlan } from "./execute"
import { readSnapshot } from "./snapshot"

/**
 * Compares the spec with the document and, when `write` is set, brings the
 * document in line with it. Items this plugin made that the spec no longer
 * contains are deleted, except those whose keys are in `retained`.
 *
 * Preview and apply run the same plan. Only whether the Dark mode can be
 * added is unknown until a write tries it.
 */
export async function syncSpec(
  spec: FigmaSpec,
  retainedKeys: string[],
  write: boolean
): Promise<SyncSummary> {
  const snapshot = await readSnapshot()
  const { summary, ops, references } = planSync(
    spec,
    snapshot,
    new Set(retainedKeys)
  )
  if (!write) {
    return summary
  }

  const families = new Set(
    spec.collections.flatMap((c) =>
      c.variables.flatMap((v) => (v.type === "STRING" ? [v.value] : []))
    )
  )
  const { darkUnavailable } = await executePlan(
    ops,
    snapshot.fonts,
    families,
    references
  )
  figma.commitUndo()

  return { ...summary, darkUnavailable }
}
