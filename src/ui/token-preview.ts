import type { FigmaSpec } from "@/core/figma-spec/build"

export type TokenPreview =
  | { kind: "color" }
  | { kind: "number"; value: number }
  | { kind: "layers"; count: number }
  | { kind: "invalid" }
  | { kind: "none" }

/** Looks up how a token was converted, so the editor can show the result. */
export function createTokenPreview(spec: FigmaSpec) {
  const variables = new Map(
    spec.collections.flatMap((c) => c.variables.map((v) => [v.key, v]))
  )
  const effects = new Map(spec.effectStyles.map((s) => [s.key, s]))
  const skipped = new Set(spec.skipped)

  return (prop: string): TokenPreview => {
    if (skipped.has(prop)) {
      return { kind: "invalid" }
    }

    // The spacing base has no variable of its own; show one step of it.
    const variable = variables.get(prop) ?? variables.get(`${prop}*1`)
    if (variable?.type === "COLOR") {
      return { kind: "color" }
    }
    if (variable?.type === "FLOAT") {
      return { kind: "number", value: variable.value }
    }

    const effect = effects.get(prop)
    if (effect) {
      return { kind: "layers", count: effect.effects.length }
    }

    return { kind: "none" }
  }
}
