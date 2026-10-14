export const REM_PX = 16

export type Unit = "" | "px" | "em" | "%"

export type Quantity = { value: number; unit: Unit }

// Numbers come first so a leading minus binds to the number; CSS requires
// whitespace around the binary `-` operator inside calc().
const TOKEN = /\s*(calc\(|-?(?:\d+\.?\d*|\.\d+)(?:rem|px|em|%)?|[()+*/-])/y

function tokenize(input: string) {
  const tokens: string[] = []
  TOKEN.lastIndex = 0

  while (TOKEN.lastIndex < input.length) {
    const start = TOKEN.lastIndex
    const match = TOKEN.exec(input)
    if (!match) {
      return input.slice(start).trim() === "" ? tokens : null
    }
    tokens.push(match[1] === "calc(" ? "(" : match[1])
  }

  return tokens
}

function parseNumber(token: string): Quantity | null {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(rem|px|em|%)?$/.exec(token)
  if (!match) {
    return null
  }

  const value = Number(match[1])
  if (match[2] === "rem") {
    return { value: value * REM_PX, unit: "px" }
  }

  return { value, unit: (match[2] ?? "") as Unit }
}

/**
 * Evaluates a CSS length, number, or `calc()` expression. `rem` is converted
 * to pixels; `em` and `%` are kept because they depend on context.
 * Returns null for anything it cannot reduce to a single quantity.
 */
export function evaluate(input: string): Quantity | null {
  const tokens = tokenize(input)
  if (!tokens || tokens.length === 0) {
    return null
  }

  let position = 0

  function primary(): Quantity | null {
    const token = tokens![position++]
    if (token === "(") {
      const inner = sum()
      return tokens![position++] === ")" ? inner : null
    }

    return token === undefined ? null : parseNumber(token)
  }

  function product(): Quantity | null {
    let left = primary()
    while (left && (tokens![position] === "*" || tokens![position] === "/")) {
      const operator = tokens![position++]
      const right = primary()
      if (!right) {
        return null
      }

      if (operator === "*") {
        if (left.unit && right.unit) {
          return null
        }
        left = {
          value: left.value * right.value,
          unit: left.unit || right.unit,
        }
      } else {
        if (right.unit || right.value === 0) {
          return null
        }
        left = { value: left.value / right.value, unit: left.unit }
      }
    }

    return left
  }

  function sum(): Quantity | null {
    let left = product()
    while (left && (tokens![position] === "+" || tokens![position] === "-")) {
      const sign = tokens![position++] === "+" ? 1 : -1
      const right = product()
      if (!right || right.unit !== left.unit) {
        return null
      }
      left = { value: left.value + sign * right.value, unit: left.unit }
    }

    return left
  }

  const result = sum()

  return result && position === tokens.length ? result : null
}

/** Rounds away floating point noise without losing sub-pixel precision. */
export function round(value: number) {
  return Math.round(value * 1e4) / 1e4
}
