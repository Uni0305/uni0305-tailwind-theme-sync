import themeCss from "virtual:tailwind-theme"
import { describe, expect, it } from "vitest"

import { toFigmaColor } from "./convert/color"
import { parseThemeTokens } from "./css/parse"
import { buildFigmaSpec, colorVariableName } from "./figma-spec/build"

describe("parseThemeTokens", () => {
  it("reads the default theme", () => {
    const tokens = parseThemeTokens(themeCss)

    expect(tokens.get("--color-red-500")).toBe("oklch(63.7% 0.237 25.331)")
    expect(tokens.get("--spacing")).toBe("0.25rem")
    expect(tokens.get("--font-serif")).toContain("ui-serif")
  })

  it("can leave out the deprecated reference block", () => {
    expect(parseThemeTokens(themeCss).has("--shadow-inner")).toBe(true)
    expect(
      parseThemeTokens(themeCss, { skipReference: true }).has("--shadow-inner")
    ).toBe(false)
  })

  it("lets later declarations win and ignores nested rules", () => {
    const tokens = parseThemeTokens(`
      @theme { --color-brand: red; @keyframes spin { to { --x: 1 } } }
      @theme inline { --color-brand: blue; }
      :root { --color-other: green; }
    `)

    expect([...tokens]).toEqual([["--color-brand", "blue"]])
  })
})

describe("toFigmaColor", () => {
  it("converts in-gamut colors exactly", () => {
    expect(toFigmaColor("#ff0000")).toEqual({ r: 1, g: 0, b: 0, a: 1 })
    expect(toFigmaColor("oklch(1 0 0)")).toEqual({ r: 1, g: 1, b: 1, a: 1 })
    // Alpha round-trips through an 8-bit hex channel, so 0.1 becomes 26/255.
    expect(toFigmaColor("rgb(0 0 0 / 0.1)")?.a).toBeCloseTo(0.1, 2)
  })

  it("clips out-of-range colors into 0-1 channels", () => {
    const vivid = toFigmaColor("oklch(63.7% 0.3 25.331)")!

    for (const value of [vivid.r, vivid.g, vivid.b, vivid.a]) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it("returns null for values that are not colors", () => {
    expect(toFigmaColor("var(--primary)")).toBeNull()
  })
})

describe("buildFigmaSpec", () => {
  it("names variables after their CSS custom property", () => {
    expect(colorVariableName("--color-red-500")).toBe("red/500")
    expect(colorVariableName("--color-black")).toBe("black")
    expect(colorVariableName("--color-sidebar-primary-foreground")).toBe(
      "sidebar-primary-foreground"
    )
  })

  it("turns every default color into a Color variable", () => {
    const spec = buildFigmaSpec(parseThemeTokens(themeCss))
    const [color] = spec.collections

    expect(color.name).toBe("Color")
    expect(color.variables).toHaveLength(288)
    expect(spec.skipped).toEqual([])
    expect(color.variables.find((v) => v.key === "--color-red-500")).toEqual({
      key: "--color-red-500",
      name: "red/500",
      type: "COLOR",
      value: toFigmaColor("oklch(63.7% 0.237 25.331)"),
      codeSyntax: "var(--color-red-500)",
    })
  })
})

describe("buildFigmaSpec typography and size", () => {
  const spec = buildFigmaSpec(parseThemeTokens(themeCss))
  const find = (key: string) =>
    spec.collections.flatMap((c) => c.variables).find((v) => v.key === key)
  const collection = (name: string) =>
    spec.collections.find((c) => c.name === name)!

  it("converts nothing it cannot represent and skips nothing", () => {
    expect(spec.skipped).toEqual([])
    expect(spec.collections.map((c) => c.name)).toEqual([
      "Color",
      "Typography",
      "Size",
    ])
  })

  it("maps font slots to Figma families", () => {
    expect(find("--font-sans")).toMatchObject({
      name: "font/sans",
      type: "STRING",
      value: "Inter",
    })
    expect(find("--font-mono")?.value).toBe("Roboto Mono")

    const custom = buildFigmaSpec(
      new Map([
        ["--font-sans", "ui-sans-serif"],
        ["--font-display", "'Satoshi Variable', sans-serif"],
      ]),
      { fontFamilies: { sans: "Pretendard" } }
    )
    expect(custom.collections[1].variables.map((v) => v.value)).toEqual([
      "Pretendard",
      "Satoshi Variable",
    ])
  })

  it("converts type sizes and line heights to pixels", () => {
    expect(find("--text-sm")).toMatchObject({
      name: "text/sm/size",
      value: 14,
    })
    expect(find("--text-sm--line-height")).toMatchObject({
      name: "text/sm/line-height",
      value: 20,
    })
    expect(find("--text-9xl--line-height")?.value).toBe(128)
    expect(find("--font-weight-semibold")).toMatchObject({
      name: "font-weight/semibold",
      value: 600,
    })
    expect(find("--leading-tight")?.value).toBe(1.25)
    expect(find("--tracking-tight")?.value).toBe(-2.5)
    expect(find("--text-shadow-sm")).toBeUndefined()
  })

  it("builds the spacing scale from the base value", () => {
    const spacing = collection("Size").variables.filter((v) =>
      v.name.startsWith("spacing/")
    )

    expect(spacing).toHaveLength(35)
    expect(find("--spacing*0.5")).toMatchObject({
      name: "spacing/0_5",
      value: 2,
      codeSyntax: "calc(var(--spacing) * 0.5)",
    })
    expect(find("--spacing*px")).toMatchObject({ value: 1, codeSyntax: "1px" })
    expect(find("--spacing*96")?.value).toBe(384)

    const wide = buildFigmaSpec(new Map([["--spacing", "0.5rem"]]))
    expect(wide.collections[2].variables[3]).toMatchObject({
      name: "spacing/1",
      value: 8,
    })
  })

  it("converts lengths to pixels", () => {
    expect(find("--radius-md")).toMatchObject({ name: "radius/md", value: 6 })
    expect(find("--breakpoint-sm")?.value).toBe(640)
    expect(find("--container-3xs")?.value).toBe(256)
    expect(find("--blur-sm")?.value).toBe(8)
  })

  it("limits each variable to the fields it fits", () => {
    const scopes = (key: string) => find(key)?.scopes

    expect(scopes("--spacing*4")).toEqual(["GAP", "WIDTH_HEIGHT"])
    expect(scopes("--spacing*px")).toEqual(["GAP", "WIDTH_HEIGHT"])
    expect(scopes("--radius-md")).toEqual(["CORNER_RADIUS"])
    expect(scopes("--breakpoint-sm")).toEqual(["WIDTH_HEIGHT"])
    expect(scopes("--container-3xs")).toEqual(["WIDTH_HEIGHT"])
    expect(scopes("--blur-sm")).toEqual(["EFFECT_FLOAT"])
    expect(scopes("--font-sans")).toEqual(["FONT_FAMILY"])
    expect(scopes("--font-weight-semibold")).toEqual(["FONT_WEIGHT"])
    expect(scopes("--text-sm")).toEqual(["FONT_SIZE"])
    expect(scopes("--text-sm--line-height")).toEqual(["LINE_HEIGHT"])
    expect(scopes("--leading-tight")).toEqual(["LINE_HEIGHT"])
    expect(scopes("--tracking-tight")).toEqual(["LETTER_SPACING"])
  })

  it("leaves color variables on Figma's default scope", () => {
    expect(find("--color-red-500")).not.toHaveProperty("scopes")
  })

  it("reports tokens whose values cannot be converted", () => {
    const broken = buildFigmaSpec(
      new Map([
        ["--radius-md", "var(--radius)"],
        ["--color-brand", "not-a-color"],
        ["--ease-in", "cubic-bezier(0.4, 0, 1, 1)"],
      ])
    )

    expect(broken.skipped).toEqual(["--radius-md", "--color-brand"])
  })
})

describe("buildFigmaSpec styles", () => {
  const tokens = parseThemeTokens(themeCss, { skipReference: true })
  const spec = buildFigmaSpec(tokens)

  it("builds a text style per size and weight for the sans slot", () => {
    expect(spec.textStyles).toHaveLength(117)
    expect(spec.textStyles.find((s) => s.name === "sans/sm/semibold")).toEqual({
      key: "text:sans/sm/semibold",
      name: "sans/sm/semibold",
      family: "Inter",
      weight: 600,
      fontSize: 14,
      lineHeight: 20,
      bindings: {
        fontFamily: "--font-sans",
        fontWeight: "--font-weight-semibold",
        fontSize: "--text-sm",
        lineHeight: "--text-sm--line-height",
      },
    })
  })

  it("adds text styles for the requested slots only", () => {
    const more = buildFigmaSpec(tokens, { textStyleSlots: ["sans", "mono"] })

    expect(more.textStyles).toHaveLength(234)
    expect(more.textStyles[117]).toMatchObject({
      name: "mono/xs/thin",
      family: "Roboto Mono",
    })
    expect(
      buildFigmaSpec(tokens, { textStyleSlots: ["display"] }).textStyles
    ).toEqual([])
  })

  it("turns shadows into effect styles", () => {
    const style = (name: string) =>
      spec.effectStyles.find((s) => s.name === name)

    // Alpha round-trips through an 8-bit hex channel, so 0.1 becomes 26/255.
    expect(style("shadow/sm")?.effects).toEqual([
      {
        type: "DROP_SHADOW",
        color: { r: 0, g: 0, b: 0, a: expect.closeTo(0.1, 2) },
        offset: { x: 0, y: 1 },
        radius: 3,
        spread: 0,
      },
      {
        type: "DROP_SHADOW",
        color: { r: 0, g: 0, b: 0, a: expect.closeTo(0.1, 2) },
        offset: { x: 0, y: 1 },
        radius: 2,
        spread: -1,
      },
    ])
    expect(style("shadow/2xs")?.effects[0]).toMatchObject({
      radius: 0,
      spread: 0,
    })
    expect(style("inset-shadow/sm")?.effects[0]).toMatchObject({
      type: "INNER_SHADOW",
      offset: { x: 0, y: 2 },
      radius: 4,
    })
    expect(style("drop-shadow/md")?.effects).toHaveLength(1)
    expect(style("text-shadow/lg")?.effects).toHaveLength(3)
  })

  it("creates layer and background blur styles bound to the blur token", () => {
    const blur = spec.effectStyles.filter((s) => s.key.startsWith("--blur-sm"))

    expect(blur).toEqual([
      {
        key: "--blur-sm@layer",
        name: "blur/sm",
        effects: [{ type: "LAYER_BLUR", radius: 8, radiusKey: "--blur-sm" }],
      },
      {
        key: "--blur-sm@backdrop",
        name: "backdrop-blur/sm",
        effects: [
          { type: "BACKGROUND_BLUR", radius: 8, radiusKey: "--blur-sm" },
        ],
      },
    ])
    // 7 shadow + 3 inset + 6 drop + 5 text shadows, and 2 styles per blur.
    expect(spec.effectStyles).toHaveLength(21 + 14)
    expect(spec.skipped).toEqual([])
  })

  it("skips shadows it cannot parse", () => {
    const broken = buildFigmaSpec(
      new Map([["--shadow-brand", "0 1px var(--shadow-color)"]])
    )

    expect(broken.effectStyles).toEqual([])
    expect(broken.skipped).toEqual(["--shadow-brand"])
  })
})

describe("buildFigmaSpec aliases and dark values", () => {
  const tokens = new Map([
    ["--color-sky-500", "#0ea5e9"],
    ["--color-accent", "var(--color-sky-500)"],
    ["--color-link", "var(--color-accent)"],
    ["--color-broken", "var(--color-missing)"],
    ["--color-surface", "white"],
  ])
  const spec = buildFigmaSpec(tokens, {
    dark: { "--color-surface": "black", "--color-accent": "nope" },
  })
  const find = (key: string) =>
    spec.collections[0].variables.find((v) => v.key === key)

  it("marks direct references as aliases with the resolved color", () => {
    expect(find("--color-accent")).toMatchObject({
      aliasOf: "--color-sky-500",
      value: toFigmaColor("#0ea5e9"),
    })
    expect(find("--color-link")).toMatchObject({
      aliasOf: "--color-accent",
      value: toFigmaColor("#0ea5e9"),
    })
    expect(find("--color-sky-500")).not.toHaveProperty("aliasOf")
    expect(spec.skipped).toEqual(["--color-broken"])
  })

  it("attaches dark values that convert", () => {
    expect(find("--color-surface")).toMatchObject({
      dark: { r: 0, g: 0, b: 0, a: 1 },
    })
    expect(find("--color-accent")).not.toHaveProperty("dark")
  })
})

describe("buildFigmaSpec unconvertedKeys", () => {
  it("is empty when every token converts", () => {
    expect(buildFigmaSpec(parseThemeTokens(themeCss)).unconvertedKeys).toEqual(
      []
    )
  })

  it("names the key a color would have had if its value converted", () => {
    const spec = buildFigmaSpec(
      new Map([
        ["--color-brand", "not-a-color"],
        ["--color-ok", "#ffffff"],
      ])
    )

    expect(spec.unconvertedKeys).toEqual(["--color-brand"])
  })

  it("names every step a broken --spacing would have produced", () => {
    const spec = buildFigmaSpec(new Map([["--spacing", "wide"]]))

    expect(spec.unconvertedKeys).toHaveLength(35)
    expect(spec.unconvertedKeys).toContain("--spacing*0.5")
    expect(spec.unconvertedKeys).toContain("--spacing*px")
    expect(spec.unconvertedKeys).not.toContain("--spacing")
    expect(spec.skipped).toEqual(["--spacing"])
  })

  it("names length and typography tokens that fail", () => {
    const spec = buildFigmaSpec(
      new Map([
        ["--radius-md", "round"],
        ["--font-weight-bold", "heavy"],
        ["--tracking-tight", "tight"],
        ["--radius-ok", "4px"],
      ])
    )

    expect(spec.unconvertedKeys).toEqual([
      "--radius-md",
      "--font-weight-bold",
      "--tracking-tight",
    ])
  })

  it("names an effect style whose shadow does not parse", () => {
    const spec = buildFigmaSpec(new Map([["--shadow-brand", "glow"]]))

    expect(spec.unconvertedKeys).toEqual(["--shadow-brand"])
  })

  it("names the variable and both styles of a blur that is not in pixels", () => {
    const spec = buildFigmaSpec(new Map([["--blur-soft", "foggy"]]))

    expect(spec.unconvertedKeys).toEqual([
      "--blur-soft",
      "--blur-soft@layer",
      "--blur-soft@backdrop",
    ])
  })

  describe("text styles", () => {
    const base: [string, string][] = [
      ["--font-sans", "Inter"],
      ["--font-weight-normal", "400"],
      ["--font-weight-bold", "700"],
      ["--text-sm", "14px"],
      ["--text-lg", "18px"],
    ]
    const build = (
      changes: Record<string, string>,
      options: Parameters<typeof buildFigmaSpec>[1] = {}
    ) =>
      buildFigmaSpec(
        new Map(base.map(([prop, value]) => [prop, changes[prop] ?? value])),
        options
      )
    const textKeys = (keys: string[]) =>
      keys.filter((key) => key.startsWith("text:")).sort()

    it("names the styles a size that fails would have had", () => {
      const spec = build({ "--text-sm": "big" })

      expect(spec.unconvertedKeys).toContain("--text-sm")
      expect(textKeys(spec.unconvertedKeys)).toEqual([
        "text:sans/sm/bold",
        "text:sans/sm/normal",
      ])
      expect(spec.textStyles.map((s) => s.key).sort()).toEqual([
        "text:sans/lg/bold",
        "text:sans/lg/normal",
      ])
    })

    it("names the styles a weight that fails would have had", () => {
      const spec = build({ "--font-weight-bold": "heavy" })

      expect(textKeys(spec.unconvertedKeys)).toEqual([
        "text:sans/lg/bold",
        "text:sans/sm/bold",
      ])
    })

    it("names each missing combination once when both fail", () => {
      const spec = build({ "--text-sm": "big", "--font-weight-bold": "heavy" })

      expect(textKeys(spec.unconvertedKeys)).toEqual([
        "text:sans/lg/bold",
        "text:sans/sm/bold",
        "text:sans/sm/normal",
      ])
    })

    it("covers every font slot that gets text styles", () => {
      const tokens = new Map(base)
      tokens.set("--font-mono", "Roboto Mono")
      tokens.set("--text-sm", "big")
      const spec = buildFigmaSpec(tokens, { textStyleSlots: ["sans", "mono"] })

      expect(textKeys(spec.unconvertedKeys)).toEqual([
        "text:mono/sm/bold",
        "text:mono/sm/normal",
        "text:sans/sm/bold",
        "text:sans/sm/normal",
      ])
    })

    it("does not mistake a failing text shadow for a text size", () => {
      const spec = buildFigmaSpec(
        new Map([...base, ["--text-shadow-soft", "glow"]])
      )

      expect(spec.unconvertedKeys).toEqual(["--text-shadow-soft"])
    })

    it("names no styles for a line height that fails, since they still exist", () => {
      const spec = build({})
      const broken = buildFigmaSpec(
        new Map([...base, ["--text-sm--line-height", "tall"]])
      )

      expect(spec.unconvertedKeys).toEqual([])
      expect(broken.unconvertedKeys).toEqual(["--text-sm--line-height"])
    })

    it("names no styles when there is no font to put them in", () => {
      const spec = buildFigmaSpec(new Map([["--text-sm", "big"]]))

      expect(spec.unconvertedKeys).toEqual(["--text-sm"])
    })
  })
})

describe("buildFigmaSpec renamed", () => {
  const tokens = new Map([
    ["--font-display", "Satoshi"],
    ["--font-weight-bold", "700"],
    ["--text-huge", "64px"],
    ["--color-accent", "#0d99ff"],
    ["--color-brand", "#000000"],
    ["--blur-soft", "8px"],
  ])

  it("maps the keys items had under earlier token names to their keys now", () => {
    const spec = buildFigmaSpec(tokens, {
      textStyleSlots: ["display"],
      renames: {
        "--font-display": ["--font-brand"],
        "--text-huge": ["--text-big"],
        "--blur-soft": ["--blur-haze"],
      },
    })

    expect(spec.renamed).toMatchObject({
      "--font-brand": "--font-display",
      "--text-big": "--text-huge",
      "--blur-haze": "--blur-soft",
      "--blur-haze@layer": "--blur-soft@layer",
      "--blur-haze@backdrop": "--blur-soft@backdrop",
      "text:brand/huge/bold": "text:display/huge/bold",
      "text:brand/big/bold": "text:display/huge/bold",
      "text:display/big/bold": "text:display/huge/bold",
    })
  })

  it("leaves out an earlier key that an item still uses", () => {
    const spec = buildFigmaSpec(tokens, {
      renames: { "--color-accent": ["--color-brand", "--color-old"] },
    })

    expect(spec.renamed).toEqual({ "--color-old": "--color-accent" })
  })
})
