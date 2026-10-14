import type {
  CollectionSpec,
  FigmaSpec,
  VariableSpec,
} from "../core/figma-spec/build"
import type { SyncSummary } from "../core/messages"
import { createFonts } from "./fonts"
import { APPLIED_KEY, sweep, TOKEN_KEY } from "./keys"
import { syncEffectStyles, syncTextStyles } from "./styles"

function round(value: number) {
  return Math.round(value * 1e4) / 1e4
}

/** Comparable form of a variable value, tolerant of float32 storage. */
function signature(value: VariableValue | VariableSpec["value"] | undefined) {
  if (typeof value === "number") {
    return String(round(value))
  }
  if (typeof value === "object" && "id" in value) {
    return `alias:${value.id}`
  }
  if (typeof value === "object" && "r" in value) {
    const alpha = "a" in value ? value.a : 1
    return [value.r, value.g, value.b, alpha].map(round).join(",")
  }

  return typeof value === "string" ? `"${value}"` : "other"
}

type Target = { value: VariableValue; signature: string }

function literal(value: VariableSpec["value"]): Target {
  return { value, signature: signature(value) }
}

/**
 * The value a variable should hold in the default mode. A color that points
 * at another color becomes an alias once its target exists.
 */
function lightTarget(
  spec: VariableSpec,
  variablesByKey: Map<string, Variable>,
  planned: ReadonlySet<string>
): Target {
  if (spec.type !== "COLOR" || !spec.aliasOf) {
    return literal(spec.value)
  }

  const target = variablesByKey.get(spec.aliasOf)
  if (target) {
    const alias = figma.variables.createVariableAlias(target)
    return { value: alias, signature: signature(alias) }
  }

  // During a preview the target may not exist yet; it will by the time the
  // alias is written, so report the variable as changing.
  return planned.has(spec.aliasOf)
    ? { value: spec.value, signature: "alias:pending" }
    : literal(spec.value)
}

async function findCollection(spec: CollectionSpec) {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()

  return (
    collections.find((c) => c.getPluginData(TOKEN_KEY) === spec.name) ??
    collections.find((c) => c.name === spec.name)
  )
}

async function syncCollection(
  spec: CollectionSpec,
  retained: ReadonlySet<string>,
  write: boolean,
  summary: SyncSummary,
  variablesByKey: Map<string, Variable>
) {
  let collection = await findCollection(spec)
  if (!collection && write && spec.variables.length > 0) {
    collection = figma.variables.createVariableCollection(spec.name)
  }
  if (!collection) {
    summary.created += spec.variables.length
    return
  }
  if (write) {
    collection.setPluginData(TOKEN_KEY, spec.name)
  }

  const collectionId = collection.id
  const modeId = collection.defaultModeId
  const variables = (await figma.variables.getLocalVariablesAsync()).filter(
    (v) => v.variableCollectionId === collectionId
  )
  const byKey = new Map(variables.map((v) => [v.getPluginData(TOKEN_KEY), v]))
  const byName = new Map(variables.map((v) => [v.name, v]))
  const kept = new Set<string>()
  const planned = new Set(spec.variables.map((v) => v.key))

  // Dark values need a second mode, which not every plan allows.
  let darkModeId = collection.modes.find((m) => m.name === "Dark")?.modeId
  const wantsDark = spec.variables.some((v) => v.type === "COLOR" && v.dark)
  if (wantsDark && !darkModeId && write) {
    try {
      darkModeId = collection.addMode("Dark")
      if (collection.modes[0].name === "Mode 1") {
        collection.renameMode(modeId, "Light")
      }
    } catch {
      summary.darkUnavailable = true
    }
  }

  // Aliases go last so the variables they point at already exist.
  const ordered = [
    ...spec.variables.filter((v) => v.type !== "COLOR" || !v.aliasOf),
    ...spec.variables.filter((v) => v.type === "COLOR" && v.aliasOf),
  ]

  for (const variableSpec of ordered) {
    const found = byKey.get(variableSpec.key) ?? byName.get(variableSpec.name)
    const existing =
      found?.resolvedType === variableSpec.type ? found : undefined
    const light = lightTarget(variableSpec, variablesByKey, planned)
    const dark =
      variableSpec.type === "COLOR" && variableSpec.dark
        ? literal(variableSpec.dark)
        : light
    const next = darkModeId
      ? `${light.signature}|${dark.signature}`
      : light.signature

    if (!existing) {
      summary.created += 1
      if (write) {
        const created = figma.variables.createVariable(
          variableSpec.name,
          collection,
          variableSpec.type
        )
        created.setPluginData(TOKEN_KEY, variableSpec.key)
        created.setPluginData(APPLIED_KEY, next)
        created.setValueForMode(modeId, light.value)
        if (darkModeId) {
          created.setValueForMode(darkModeId, dark.value)
        }
        created.setVariableCodeSyntax("WEB", variableSpec.codeSyntax)
        if (variableSpec.scopes) {
          created.scopes = variableSpec.scopes
        }
        variablesByKey.set(variableSpec.key, created)
      }
      continue
    }

    kept.add(existing.id)
    variablesByKey.set(variableSpec.key, existing)

    const currentLight = signature(existing.valuesByMode[modeId])
    const current = darkModeId
      ? `${currentLight}|${signature(existing.valuesByMode[darkModeId])}`
      : currentLight
    const applied = existing.getPluginData(APPLIED_KEY)
    const renamed = existing.name !== variableSpec.name
    const revalued = current !== next
    const resyntaxed = existing.codeSyntax.WEB !== variableSpec.codeSyntax
    // Only a variable still on Figma's default is narrowed; a scope someone
    // set by hand is left as it is.
    const rescoped =
      !!variableSpec.scopes &&
      existing.scopes.length === 1 &&
      existing.scopes[0] === "ALL_SCOPES"

    if (revalued && applied && applied !== current) {
      summary.overwritten.push(existing.name)
    }
    if (renamed || revalued || resyntaxed || rescoped) {
      summary.updated += 1
    } else {
      summary.unchanged += 1
    }

    if (write) {
      existing.setPluginData(TOKEN_KEY, variableSpec.key)
      existing.setPluginData(APPLIED_KEY, next)
      if (renamed) existing.name = variableSpec.name
      if (revalued) {
        existing.setValueForMode(modeId, light.value)
        if (darkModeId) {
          existing.setValueForMode(darkModeId, dark.value)
        }
      }
      if (resyntaxed) {
        existing.setVariableCodeSyntax("WEB", variableSpec.codeSyntax)
      }
      if (rescoped && variableSpec.scopes) {
        existing.scopes = variableSpec.scopes
      }
    }
  }

  sweep(variables, kept, retained, write, summary)
}

/**
 * Compares the spec with the document and, when `write` is set, brings the
 * document in line with it. Items this plugin made that the spec no longer
 * contains are deleted, except those whose keys are in `retained`.
 */
export async function syncSpec(
  spec: FigmaSpec,
  retainedKeys: string[],
  write: boolean
): Promise<SyncSummary> {
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
  const retained = new Set(retainedKeys)
  const variablesByKey = new Map<string, Variable>()
  const fonts = await createFonts()

  if (write) {
    // Text styles bound to a font variable switch fonts the moment the
    // variable changes, which fails unless the new family is already loaded.
    const families = new Set(
      spec.collections.flatMap((c) =>
        c.variables.flatMap((v) => (v.type === "STRING" ? [v.value] : []))
      )
    )
    await Promise.all([...families].map(fonts.loadFamily))
  }

  for (const collectionSpec of spec.collections) {
    await syncCollection(
      collectionSpec,
      retained,
      write,
      summary,
      variablesByKey
    )
  }

  const planned = new Set(
    spec.collections.flatMap((c) => c.variables.map((v) => v.key))
  )
  await syncTextStyles(
    spec.textStyles,
    variablesByKey,
    planned,
    fonts,
    retained,
    write,
    summary
  )
  await syncEffectStyles(
    spec.effectStyles,
    variablesByKey,
    retained,
    write,
    summary
  )

  if (write) {
    figma.commitUndo()
  }

  return summary
}
