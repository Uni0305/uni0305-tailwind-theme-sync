import { describe, expect, it } from "vitest"

import {
  EMPTY_OVERRIDES,
  removeToken,
  setDarkValue,
  setFontFamily,
  setToken,
} from "../theme/model"
import { exportCss } from "./export"
import { parseThemeTokens } from "./parse"

const defaults = new Map([
  ["--font-sans", "ui-sans-serif, system-ui, sans-serif"],
  ["--color-red-500", "red"],
  ["--color-blue-500", "blue"],
  ["--radius-md", "0.375rem"],
])

describe("exportCss", () => {
  it("emits nothing when the theme is unchanged", () => {
    expect(exportCss(defaults, EMPTY_OVERRIDES)).toBe("")
  })

  it("emits changed, added, and removed tokens in theme order", () => {
    let overrides = setToken(EMPTY_OVERRIDES, defaults, "--radius-md", "1rem")
    overrides = setToken(overrides, defaults, "--color-brand-500", "#3b82f6")
    overrides = removeToken(overrides, defaults, "--color-blue-500")

    expect(exportCss(defaults, overrides)).toBe(
      [
        "@theme {",
        "  --color-blue-500: initial;",
        "  --radius-md: 1rem;",
        "  --color-brand-500: #3b82f6;",
        "}",
      ].join("\n")
    )
  })

  it("puts the chosen family in front of the default stack", () => {
    let overrides = setFontFamily(
      EMPTY_OVERRIDES,
      defaults,
      "sans",
      "Pretendard"
    )
    overrides = setFontFamily(overrides, defaults, "display", "Satoshi")
    overrides = setFontFamily(overrides, defaults, "display", "Sora")

    expect(exportCss(defaults, overrides)).toBe(
      [
        "@theme {",
        '  --font-sans: "Pretendard", ui-sans-serif, system-ui, sans-serif;',
        '  --font-display: "Sora", sans-serif;',
        "}",
      ].join("\n")
    )
  })

  it("turns colors with a dark value into semantic tokens", () => {
    let overrides = setToken(
      EMPTY_OVERRIDES,
      defaults,
      "--color-surface",
      "white"
    )
    overrides = setDarkValue(overrides, "--color-surface", "black")
    overrides = setDarkValue(overrides, "--color-red-500", "maroon")

    expect(exportCss(defaults, overrides)).toBe(
      "@theme {\n  --color-surface: white;\n}"
    )

    const css = exportCss(defaults, { ...overrides, darkEnabled: true })
    expect(css).toBe(
      [
        "@theme inline {",
        "  --color-red-500: var(--red-500);",
        "  --color-surface: var(--surface);",
        "}",
        "",
        ":root {",
        "  --red-500: red;",
        "  --surface: white;",
        "}",
        "",
        ".dark {",
        "  --red-500: maroon;",
        "  --surface: black;",
        "}",
      ].join("\n")
    )
    expect([...parseThemeTokens(css)]).toEqual([
      ["--color-red-500", "var(--red-500)"],
      ["--color-surface", "var(--surface)"],
    ])
  })
})
