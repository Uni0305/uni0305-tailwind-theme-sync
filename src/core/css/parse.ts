import postcss from "postcss"

export type ThemeTokens = Map<string, string>

/**
 * Collects the custom properties declared directly inside `@theme` blocks.
 * Later declarations win, matching how Tailwind merges theme blocks.
 */
export function parseThemeTokens(
  css: string,
  options: { skipReference?: boolean } = {}
): ThemeTokens {
  const tokens: ThemeTokens = new Map()
  const root = postcss.parse(css)

  root.walkAtRules("theme", (rule) => {
    // Tailwind keeps its deprecated aliases in a `reference` block.
    if (options.skipReference && /\breference\b/.test(rule.params)) {
      return
    }

    rule.each((node) => {
      if (node.type === "decl" && node.prop.startsWith("--")) {
        tokens.set(node.prop, node.value.replace(/\s+/g, " ").trim())
      }
    })
  })

  return tokens
}
