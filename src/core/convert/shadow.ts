import { toFigmaColor } from "./color"
import type { ColorProfile, FigmaColor } from "./color"
import { evaluate, round } from "./units"

export type ShadowSpec = {
  type: "DROP_SHADOW" | "INNER_SHADOW"
  color: FigmaColor
  offset: { x: number; y: number }
  radius: number
  spread: number
}

/** Splits on a separator that is not nested inside parentheses. */
function splitTopLevel(input: string, separator: "," | " ") {
  const parts: string[] = []
  let depth = 0
  let current = ""

  for (const char of input) {
    if (char === "(") depth += 1
    if (char === ")") depth -= 1

    if (depth === 0 && char === separator) {
      parts.push(current)
      current = ""
    } else {
      current += char
    }
  }
  parts.push(current)

  return parts.map((part) => part.trim()).filter(Boolean)
}

function parseShadow(
  input: string,
  inner: boolean,
  profile: ColorProfile | undefined
): ShadowSpec | null {
  const lengths: number[] = []
  let color: FigmaColor | null = null
  let inset = inner

  for (const part of splitTopLevel(input, " ")) {
    if (part === "inset") {
      inset = true
      continue
    }

    const length = evaluate(part)
    if (length && (length.unit === "px" || length.value === 0)) {
      lengths.push(round(length.value))
      continue
    }

    color = toFigmaColor(part, profile)
    if (!color) {
      return null
    }
  }

  if (!color || lengths.length < 2 || lengths.length > 4) {
    return null
  }

  const [x, y, radius = 0, spread = 0] = lengths

  return {
    type: inset ? "INNER_SHADOW" : "DROP_SHADOW",
    color,
    offset: { x, y },
    radius,
    spread,
  }
}

/**
 * Parses a CSS shadow list (`box-shadow`, `drop-shadow`, `text-shadow`
 * values) into Figma shadow effects, keeping the CSS order.
 */
export function parseShadows(
  input: string,
  options: { inner?: boolean; colorProfile?: ColorProfile } = {}
): ShadowSpec[] | null {
  const shadows: ShadowSpec[] = []

  for (const part of splitTopLevel(input, ",")) {
    const shadow = parseShadow(
      part,
      options.inner ?? false,
      options.colorProfile
    )
    if (!shadow) {
      return null
    }
    shadows.push(shadow)
  }

  return shadows.length > 0 ? shadows : null
}
