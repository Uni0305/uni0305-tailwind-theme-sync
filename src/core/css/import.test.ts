import { readFileSync } from "node:fs"
import themeCss from "virtual:tailwind-theme"
import { describe, expect, it } from "vitest"

import { EMPTY_OVERRIDES } from "../theme/model"
import { exportCss } from "./export"
import { applyImport, importCss, matchFontFamily } from "./import"
import { parseThemeTokens } from "./parse"

const defaults = parseThemeTokens(themeCss, { skipReference: true })

describe("importCss", () => {
  it("reads plain theme overrides and ignores unchanged values", () => {
    const result = importCss(
      `@import "tailwindcss";
       @theme {
         --color-brand-500: #3b82f6;
         --radius-md: 0.5rem;
         --radius-lg: 0.5rem;
       }`,
      defaults
    )

    expect(result.values).toEqual({
      "--color-brand-500": "#3b82f6",
      "--radius-md": "0.5rem",
    })
    expect(result.removed).toEqual([])
    expect(result.unresolved).toEqual([])
  })

  it("follows var() through :root and records dark values", () => {
    const result = importCss(
      `@theme inline {
         --color-primary: var(--primary);
         --color-muted: var(--muted);
         --radius-lg: var(--radius);
         --radius-sm: calc(var(--radius) * 0.6);
       }
       :root { --primary: oklch(0.2 0 0); --muted: #eee; --radius: 0.625rem; }
       .dark { --primary: oklch(0.9 0 0); }`,
      defaults
    )

    expect(result.values).toEqual({
      "--color-primary": "oklch(0.2 0 0)",
      "--color-muted": "#eee",
      "--radius-lg": "0.625rem",
      "--radius-sm": "calc(0.625rem * 0.6)",
    })
    expect(result.dark).toEqual({ "--color-primary": "oklch(0.9 0 0)" })
  })

  it("keeps direct references to theme colors and uses fallbacks", () => {
    const result = importCss(
      `@theme {
         --color-accent: var(--color-sky-500);
         --color-ink: var(--missing, black);
         --color-lost: var(--missing);
       }`,
      defaults
    )

    expect(result.values).toEqual({
      "--color-accent": "var(--color-sky-500)",
      "--color-ink": "black",
    })
    expect(result.unresolved).toEqual(["--color-lost"])
  })

  it("applies initial resets to tokens and whole namespaces", () => {
    const result = importCss(
      `@theme {
         --radius-xs: initial;
         --font-*: initial;
         --color-*: initial;
         --color-red-500: red;
         --color-white: #fff;
       }`,
      defaults
    )

    expect(result.removed).toContain("--radius-xs")
    expect(result.removed).toContain("--font-sans")
    expect(result.removed).not.toContain("--font-weight-bold")
    expect(result.removed).toContain("--color-blue-500")
    expect(result.removed).not.toContain("--color-red-500")
    expect(result.removed).not.toContain("--color-white")
    expect(result.values).toEqual({ "--color-red-500": "red" })
  })

  it("reports the first family of each font slot", () => {
    const result = importCss(
      `@theme inline {
         --font-sans: 'Noto Sans Variable', sans-serif;
         --font-heading: var(--font-sans);
       }`,
      defaults
    )

    expect(result.fonts).toEqual({
      sans: "Noto Sans Variable",
      heading: "Noto Sans Variable",
    })
  })

  it("throws on CSS it cannot parse", () => {
    expect(() => importCss("@theme { --a: 1", defaults)).toThrow()
  })

  it("survives an export and re-import of this project's stylesheet", () => {
    const first = importCss(readFileSync("src/index.css", "utf8"), defaults)

    expect(first.unresolved).toEqual([])
    expect(first.values["--color-primary"]).toBe("#0d99ff")
    expect(first.dark["--color-primary"]).toBe("#0c8ce9")
    expect(first.values["--radius-sm"]).toBe("calc(0.375rem * 0.6)")

    const overrides = {
      ...EMPTY_OVERRIDES,
      values: first.values,
      removed: first.removed,
      dark: first.dark,
      darkEnabled: true,
    }
    const second = importCss(exportCss(defaults, overrides), defaults)

    expect(second.values).toEqual(first.values)
    expect(second.dark).toEqual(first.dark)
    expect(second.removed).toEqual(first.removed)
  })
})

describe("exportCss resets", () => {
  it("collapses a fully removed namespace into one wildcard", () => {
    const { removed, values } = importCss(
      `@theme { --color-*: initial; --color-brand: teal; --radius-xs: initial; }`,
      defaults
    )
    const css = exportCss(defaults, { ...EMPTY_OVERRIDES, removed, values })

    expect(css).toBe(
      [
        "@theme {",
        "  --color-*: initial;",
        "  --radius-xs: initial;",
        "  --color-brand: teal;",
        "}",
      ].join("\n")
    )
  })
})

describe("matchFontFamily", () => {
  const families = new Set(["Inter", "Noto Sans"])

  it("matches exactly or without the Variable suffix", () => {
    expect(matchFontFamily("Inter", families)).toBe("Inter")
    expect(matchFontFamily("Noto Sans Variable", families)).toBe("Noto Sans")
    expect(matchFontFamily("Satoshi", families)).toBeNull()
  })
})

describe("applyImport", () => {
  const current = {
    ...EMPTY_OVERRIDES,
    values: { "--radius-md": "1rem", "--color-old": "red" },
    removed: ["--radius-xs", "--radius-lg"],
    fontFamilies: { mono: "JetBrains Mono" },
    excludedGroups: ["Color/taupe"],
  }
  const result = importCss(
    `@theme {
       --font-sans: 'Noto Sans Variable', sans-serif;
       --font-display: Satoshi, sans-serif;
       --radius-lg: 2rem;
       --radius-sm: initial;
       --color-surface: var(--surface);
     }
     :root { --surface: white; }
     .dark { --surface: black; }`,
    defaults
  )
  const families = new Set(["Noto Sans"])

  it("replaces the theme but keeps apply settings", () => {
    const next = applyImport(current, result, families, "replace")

    expect(next.values).toEqual(result.values)
    expect(next.removed).toEqual(["--radius-sm"])
    expect(next.darkEnabled).toBe(true)
    expect(next.fontFamilies).toEqual({ sans: "Noto Sans", display: "Satoshi" })
    expect(next.excludedGroups).toEqual(["Color/taupe"])
  })

  it("merges on top of existing changes", () => {
    const next = applyImport(current, result, families, "merge")

    expect(next.values).toMatchObject({
      "--radius-md": "1rem",
      "--color-old": "red",
      "--radius-lg": "2rem",
      "--color-surface": "white",
    })
    expect(next.removed).toEqual(["--radius-xs", "--radius-sm"])
    expect(next.fontFamilies).toEqual({
      mono: "JetBrains Mono",
      sans: "Noto Sans",
      display: "Satoshi",
    })
  })
})
