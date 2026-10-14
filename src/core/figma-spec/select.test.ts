import themeCss from "virtual:tailwind-theme"
import { describe, expect, it } from "vitest"

import { parseThemeTokens } from "../css/parse"
import { buildFigmaSpec } from "./build"
import type {
  CollectionName,
  EffectStyleSpec,
  FigmaSpec,
  TextStyleSpec,
  VariableSpec,
} from "./build"
import { groupSwatches, selectGroups } from "./select"

const RED = { r: 1, g: 0, b: 0, a: 1 }

const color = (key: string, name: string): VariableSpec => ({
  key,
  name,
  type: "COLOR",
  value: RED,
  codeSyntax: `var(${key})`,
})

const float = (key: string, name: string): VariableSpec => ({
  key,
  name,
  type: "FLOAT",
  value: 4,
  codeSyntax: `var(${key})`,
})

const textStyle = (key: string, name: string): TextStyleSpec => ({
  key,
  name,
  family: "Inter",
  weight: 700,
  fontSize: 14,
  bindings: {
    fontFamily: "--font-sans",
    fontWeight: "--font-weight-bold",
    fontSize: "--text-sm",
  },
})

const effect = (key: string, name: string): EffectStyleSpec => ({
  key,
  name,
  effects: [{ type: "LAYER_BLUR", radius: 4, radiusKey: "--blur-sm" }],
})

const collections = (
  variables: Partial<Record<CollectionName, VariableSpec[]>>
) =>
  (["Color", "Typography", "Size"] as const).map((name) => ({
    name,
    variables: variables[name] ?? [],
  }))

const spec: FigmaSpec = {
  collections: collections({
    Color: [
      color("--color-red-500", "red/500"),
      color("--color-red-600", "red/600"),
      color("--color-black", "black"),
    ],
    Typography: [
      float("--text-sm", "text/sm/size"),
      float("--font-weight-bold", "font-weight/bold"),
    ],
    Size: [
      float("--spacing*4", "spacing/4"),
      float("--radius-md", "radius/md"),
    ],
  }),
  textStyles: [
    textStyle("text:sans/sm/bold", "sans/sm/bold"),
    textStyle("text:mono/sm/bold", "mono/sm/bold"),
  ],
  effectStyles: [
    effect("--blur-sm@layer", "blur/sm"),
    effect("--blur-sm@backdrop", "backdrop-blur/sm"),
  ],
  skipped: ["--color-bad"],
  unconvertedKeys: ["--color-bad"],
}

const keysOf = (s: FigmaSpec) => [
  ...s.collections.flatMap((c) => c.variables.map((v) => v.key)),
  ...s.textStyles.map((t) => t.key),
  ...s.effectStyles.map((e) => e.key),
]

describe("selectGroups groups", () => {
  const { groups } = selectGroups(spec, new Set())

  it("lists groups in spec order with their sizes", () => {
    expect(groups).toEqual([
      { id: "Color/red", section: "Color", label: "red", count: 2 },
      { id: "Color/other", section: "Color", label: "other", count: 1 },
      { id: "Typography/text", section: "Typography", label: "text", count: 1 },
      {
        id: "Typography/font-weight",
        section: "Typography",
        label: "font-weight",
        count: 1,
      },
      { id: "Size/spacing", section: "Size", label: "spacing", count: 1 },
      { id: "Size/radius", section: "Size", label: "radius", count: 1 },
      {
        id: "Text styles/sans",
        section: "Text styles",
        label: "sans",
        count: 1,
      },
      {
        id: "Text styles/mono",
        section: "Text styles",
        label: "mono",
        count: 1,
      },
      { id: "Effects/blur", section: "Effects", label: "blur", count: 1 },
      {
        id: "Effects/backdrop-blur",
        section: "Effects",
        label: "backdrop-blur",
        count: 1,
      },
    ])
  })

  it("still lists a group after it is excluded", () => {
    const result = selectGroups(spec, new Set(["Color/red"]))

    expect(result.groups).toEqual(groups)
  })
})

describe("selectGroups selection", () => {
  it("passes the spec through when nothing is excluded", () => {
    const result = selectGroups(spec, new Set())

    expect(result.spec).toBe(spec)
    expect(result.selectedCount).toBe(keysOf(spec).length)
  })

  it("always retains what failed to convert, even with nothing excluded", () => {
    expect(selectGroups(spec, new Set()).retained).toEqual(["--color-bad"])
  })

  it("drops excluded groups from the spec and retains their keys", () => {
    const result = selectGroups(
      spec,
      new Set(["Color/red", "Size/spacing", "Text styles/sans", "Effects/blur"])
    )

    expect(keysOf(result.spec)).toEqual([
      "--color-black",
      "--text-sm",
      "--font-weight-bold",
      "--radius-md",
      "text:mono/sm/bold",
      "--blur-sm@backdrop",
    ])
    expect([...result.retained].sort()).toEqual(
      [
        "--color-bad",
        "--color-red-500",
        "--color-red-600",
        "--spacing*4",
        "text:sans/sm/bold",
        "--blur-sm@layer",
      ].sort()
    )
  })

  it("keeps every collection even when all its variables are excluded", () => {
    const result = selectGroups(spec, new Set(["Color/red", "Color/other"]))

    expect(result.spec.collections.map((c) => c.name)).toEqual([
      "Color",
      "Typography",
      "Size",
    ])
    expect(result.spec.collections[0].variables).toEqual([])
  })

  it("counts the items of the groups that stay checked", () => {
    const result = selectGroups(
      spec,
      new Set(["Color/red", "Text styles/sans"])
    )

    expect(result.selectedCount).toBe(keysOf(spec).length - 2 - 1)
  })

  it("carries the spec's own fields through to the narrowed spec", () => {
    const result = selectGroups(spec, new Set(["Color/red"]))

    expect(result.spec.skipped).toEqual(["--color-bad"])
    expect(result.spec.unconvertedKeys).toEqual(["--color-bad"])
  })
})

describe("selectGroups over a whole theme", () => {
  const theme = buildFigmaSpec(
    parseThemeTokens(themeCss, { skipReference: true })
  )
  const groups = selectGroups(theme, new Set()).groups

  it("puts every item on exactly one side, whatever is excluded", () => {
    const all = keysOf(theme)
    const sets = [
      [],
      groups.slice(0, 1).map((g) => g.id),
      groups.filter((_, i) => i % 3 === 0).map((g) => g.id),
      groups.map((g) => g.id),
    ]

    for (const ids of sets) {
      const result = selectGroups(theme, new Set(ids))
      const kept = keysOf(result.spec)
      const held = new Set(result.retained)

      expect(kept.length + held.size).toBe(all.length)
      expect(kept.filter((key) => held.has(key))).toEqual([])
      expect(result.selectedCount).toBe(kept.length)
    }
  })
})

describe("selectGroups over a theme with a broken value", () => {
  const broken = buildFigmaSpec(
    new Map([
      ["--color-red-500", "#f00"],
      ["--color-red-600", "not-a-color"],
      ["--radius-md", "4px"],
      ["--radius-lg", "round"],
      ["--spacing", "wide"],
    ])
  )

  it("retains what failed next to what an unchecked group holds", () => {
    const result = selectGroups(broken, new Set(["Color/red"]))
    const kept = keysOf(result.spec)

    expect(result.retained).toContain("--color-red-500")
    expect(result.retained).toContain("--color-red-600")
    expect(result.retained).toContain("--radius-lg")
    expect(result.retained).toContain("--spacing*4")
    expect(kept).toEqual(["--radius-md"])
    expect(kept.filter((key) => result.retained.includes(key))).toEqual([])
  })

  it("does not count what failed as selected", () => {
    expect(selectGroups(broken, new Set()).selectedCount).toBe(2)
  })
})

describe("groupSwatches", () => {
  it("collects the CSS colors of each color group", () => {
    const swatches = groupSwatches(
      spec,
      new Map([
        ["--color-red-500", "#f00"],
        ["--color-red-600", "#c00"],
        ["--color-black", "#000"],
      ])
    )

    expect(swatches.get("Color/red")).toEqual(["#f00", "#c00"])
    expect(swatches.get("Color/other")).toEqual(["#000"])
    expect(swatches.has("Size/spacing")).toBe(false)
  })

  it("skips colors whose token is not in the theme", () => {
    const swatches = groupSwatches(spec, new Map([["--color-black", "#000"]]))

    expect(swatches.has("Color/red")).toBe(false)
    expect(swatches.get("Color/other")).toEqual(["#000"])
  })
})
