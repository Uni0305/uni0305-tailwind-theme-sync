import themeCss from "virtual:tailwind-theme"
import { describe, expect, it } from "vitest"

import { parseThemeTokens } from "../css/parse"

import { buildFigmaSpec } from "../figma-spec/build"
import type {
  CollectionName,
  EffectStyleSpec,
  FigmaSpec,
  TextStyleSpec,
  VariableSpec,
} from "../figma-spec/build"
import { planSync } from "./plan"
import type {
  Snapshot,
  SnapshotCollection,
  SnapshotEffectStyle,
  SnapshotTextStyle,
  SnapshotVariable,
} from "./snapshot"

const EMPTY_SNAPSHOT: Snapshot = {
  collections: [],
  variables: [],
  textStyles: [],
  effectStyles: [],
  fonts: [],
}

const RED = { r: 1, g: 0, b: 0, a: 1 }

function color(key: string, name: string, extra: object = {}): VariableSpec {
  return {
    key,
    name,
    type: "COLOR",
    value: RED,
    codeSyntax: `var(${key})`,
    ...extra,
  }
}

function specOf(
  variables: Partial<Record<CollectionName, VariableSpec[]>>
): FigmaSpec {
  return {
    collections: (["Color", "Typography", "Size"] as const).map((name) => ({
      name,
      variables: variables[name] ?? [],
    })),
    textStyles: [],
    effectStyles: [],
    skipped: [],
    unconvertedKeys: [],
  }
}

function collectionSnap(
  name: string,
  extra: Partial<SnapshotCollection> = {}
): SnapshotCollection {
  return {
    id: `c:${name}`,
    name,
    key: name,
    defaultModeId: "light",
    modes: [{ id: "light", name: "Mode 1" }],
    ...extra,
  }
}

function colorSnap(
  key: string,
  name: string,
  extra: Partial<SnapshotVariable> = {}
): SnapshotVariable {
  return {
    id: `v:${key}`,
    collectionId: "c:Color",
    key,
    applied: `${RED.r},${RED.g},${RED.b},${RED.a}|${RED.r},${RED.g},${RED.b},${RED.a}`,
    name,
    type: "COLOR",
    valuesByMode: { light: RED },
    codeSyntax: `var(${key})`,
    scopes: ["ALL_SCOPES"],
    ...extra,
  }
}

function snapshotOf(
  variables: SnapshotVariable[],
  collections: SnapshotCollection[] = [collectionSnap("Color")]
): Snapshot {
  return { ...EMPTY_SNAPSHOT, collections, variables }
}

function plan(
  spec: FigmaSpec,
  snapshot: Snapshot = EMPTY_SNAPSHOT,
  retained: string[] = []
) {
  return planSync(spec, snapshot, new Set(retained))
}

describe("planSync variables", () => {
  it("creates the collection and a variable in an empty document", () => {
    const result = plan(specOf({ Color: [color("--color-red", "red")] }))

    expect(result.summary).toMatchObject({
      created: 1,
      updated: 0,
      unchanged: 0,
    })
    expect(result.ops.map((op) => op.kind)).toEqual([
      "createCollection",
      "createVariable",
    ])
  })

  it("creates no collection for an empty spec, but cleans up an existing one", () => {
    const empty = specOf({})
    const stale = colorSnap("--color-gone", "gone")

    expect(plan(empty).ops).toEqual([])
    expect(plan(empty, snapshotOf([stale])).summary.deleted).toEqual(["gone"])
  })

  it("marks a collection that was already in the file", () => {
    const result = plan(
      specOf({ Color: [color("--color-red", "red")] }),
      snapshotOf([], [collectionSnap("Color", { key: "" })])
    )

    expect(result.ops[0]).toEqual({
      kind: "useCollection",
      id: "c:Color",
      name: "Color",
    })
    expect(result.ops.map((op) => op.kind)).not.toContain("createCollection")
  })

  it("leaves a variable alone when nothing differs", () => {
    const result = plan(
      specOf({ Color: [color("--color-red", "red")] }),
      snapshotOf([colorSnap("--color-red", "red")])
    )

    expect(result.summary).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 1,
    })
    expect(result.ops.map((op) => op.kind)).not.toContain("createVariable")
  })

  it("updates a renamed variable found by its key", () => {
    const result = plan(
      specOf({ Color: [color("--color-red", "crimson")] }),
      snapshotOf([colorSnap("--color-red", "red")])
    )

    expect(result.summary).toMatchObject({
      created: 0,
      updated: 1,
      unchanged: 0,
    })
    expect(result.ops).toContainEqual(
      expect.objectContaining({
        kind: "updateVariable",
        id: "v:--color-red",
        name: "crimson",
      })
    )
  })

  it("updates a variable whose value changed, and only sets that value", () => {
    const blue = { r: 0, g: 0, b: 1, a: 1 }
    const result = plan(
      specOf({ Color: [color("--color-red", "red", { value: blue })] }),
      snapshotOf([colorSnap("--color-red", "red")])
    )

    expect(result.summary.updated).toBe(1)
    const update = result.ops.find((op) => op.kind === "updateVariable")
    expect(update).toMatchObject({ light: { value: blue } })
    expect(update).not.toHaveProperty("name")
    expect(update).not.toHaveProperty("codeSyntax")
  })

  it("updates a variable whose code syntax changed", () => {
    const result = plan(
      specOf({ Color: [color("--color-red", "red", { codeSyntax: "red" })] }),
      snapshotOf([colorSnap("--color-red", "red")])
    )

    expect(result.summary.updated).toBe(1)
    expect(result.ops).toContainEqual(
      expect.objectContaining({ kind: "updateVariable", codeSyntax: "red" })
    )
  })

  it("matches by name when the variable carries no token key yet", () => {
    const result = plan(
      specOf({ Color: [color("--color-red", "red")] }),
      snapshotOf([colorSnap("", "red", { codeSyntax: "var(--color-red)" })])
    )

    expect(result.summary).toMatchObject({ created: 0, unchanged: 1 })
    expect(result.ops).toContainEqual(
      expect.objectContaining({ kind: "updateVariable", key: "--color-red" })
    )
  })

  it("creates a new variable when the one with that name has another type", () => {
    const result = plan(
      specOf({ Color: [color("--color-red", "red")] }),
      snapshotOf([colorSnap("--color-red", "red", { type: "FLOAT" })])
    )

    expect(result.summary).toMatchObject({ created: 1, unchanged: 0 })
  })

  it("finds a collection by its token marker before its name", () => {
    const result = plan(
      specOf({ Color: [color("--color-red", "red")] }),
      snapshotOf(
        [colorSnap("--color-red", "red", { collectionId: "c:mine" })],
        [
          collectionSnap("Color", { id: "c:other", key: "" }),
          collectionSnap("Renamed", { id: "c:mine", key: "Color" }),
        ]
      )
    )

    expect(result.summary).toMatchObject({ created: 0, unchanged: 1 })
  })

  it("ignores float noise below the stored precision", () => {
    const nudged = { r: 1.00001, g: 0, b: 0, a: 1 }
    const result = plan(
      specOf({ Color: [color("--color-red", "red")] }),
      snapshotOf([
        colorSnap("--color-red", "red", { valuesByMode: { light: nudged } }),
      ])
    )

    expect(result.summary.unchanged).toBe(1)
  })

  it("narrows scopes only while the variable is still on the default", () => {
    const spec = specOf({
      Color: [color("--color-red", "red", { scopes: ["FRAME_FILL"] })],
    })
    const onDefault = plan(spec, snapshotOf([colorSnap("--color-red", "red")]))
    const byHand = plan(
      spec,
      snapshotOf([colorSnap("--color-red", "red", { scopes: ["TEXT_FILL"] })])
    )

    expect(onDefault.summary.updated).toBe(1)
    expect(byHand.summary.unchanged).toBe(1)
  })
})

describe("planSync overwritten", () => {
  const blue = { r: 0, g: 0, b: 1, a: 1 }
  const green = { r: 0, g: 1, b: 0, a: 1 }
  const spec = specOf({ Color: [color("--color-red", "red", { value: blue })] })

  it("reports a variable edited by hand since the last apply", () => {
    const edited = colorSnap("--color-red", "red", {
      valuesByMode: { light: green },
    })

    expect(plan(spec, snapshotOf([edited])).summary.overwritten).toEqual([
      "red",
    ])
  })

  it("does not report a variable that still holds what the plugin wrote", () => {
    expect(
      plan(spec, snapshotOf([colorSnap("--color-red", "red")])).summary
        .overwritten
    ).toEqual([])
  })

  it("does not report variables the plugin never stamped", () => {
    const unstamped = colorSnap("--color-red", "red", {
      applied: "",
      valuesByMode: { light: green },
    })

    expect(plan(spec, snapshotOf([unstamped])).summary.overwritten).toEqual([])
  })

  it("reads a light-only signature from an older apply as light|light", () => {
    const older = colorSnap("--color-red", "red", { applied: "1,0,0,1" })

    expect(plan(spec, snapshotOf([older])).summary.overwritten).toEqual([])
  })
})

describe("planSync sweep", () => {
  const spec = specOf({ Color: [color("--color-red", "red")] })
  const stale = colorSnap("--color-gone", "gone")
  const mine = colorSnap("", "hand-made", { applied: "" })

  it("deletes plugin variables that left the theme", () => {
    const result = plan(
      spec,
      snapshotOf([colorSnap("--color-red", "red"), stale])
    )

    expect(result.summary.deleted).toEqual(["gone"])
    expect(result.ops).toContainEqual({
      kind: "remove",
      target: "variable",
      id: "v:--color-gone",
    })
  })

  it("keeps variables of unchecked groups and reports them as orphans", () => {
    const result = plan(spec, snapshotOf([stale]), ["--color-gone"])

    expect(result.summary.orphans).toEqual(["gone"])
    expect(result.summary.deleted).toEqual([])
    expect(result.ops.map((op) => op.kind)).not.toContain("remove")
  })

  it("never touches variables the plugin did not make", () => {
    const result = plan(spec, snapshotOf([mine]))

    expect(result.summary.deleted).toEqual([])
    expect(result.summary.orphans).toEqual([])
  })

  it("does not delete a variable that matched by name", () => {
    const named = colorSnap("--color-old-key", "red")
    const result = plan(spec, snapshotOf([named]))

    expect(result.summary.deleted).toEqual([])
  })

  it("leaves variables outside the matched collections alone", () => {
    const elsewhere = colorSnap("--color-gone", "gone", {
      collectionId: "other",
    })
    const result = plan(spec, snapshotOf([elsewhere]))

    expect(result.summary.deleted).toEqual([])
  })
})

describe("planSync aliases", () => {
  const base = color("--color-base", "base")
  const alias = (key: string, to: string) =>
    color(key, key.slice("--color-".length), { aliasOf: to })
  const created = (ops: ReturnType<typeof plan>["ops"]) =>
    ops.flatMap((op) => (op.kind === "createVariable" ? [op.key] : []))

  it("creates alias variables after the variables they point at", () => {
    const result = plan(
      specOf({
        Color: [
          alias("--color-a", "--color-b"),
          alias("--color-b", "--color-c"),
          alias("--color-c", "--color-base"),
          base,
        ],
      })
    )

    expect(created(result.ops)).toEqual([
      "--color-base",
      "--color-c",
      "--color-b",
      "--color-a",
    ])
  })

  it("plans an alias when its target is part of the spec", () => {
    const result = plan(
      specOf({ Color: [base, alias("--color-brand", "--color-base")] })
    )

    expect(result.ops).toContainEqual(
      expect.objectContaining({
        kind: "createVariable",
        key: "--color-brand",
        light: { value: RED, aliasOf: "--color-base" },
      })
    )
  })

  it("writes a literal when the target is not in the spec", () => {
    const result = plan(
      specOf({ Color: [alias("--color-brand", "--color-missing")] })
    )

    expect(result.ops).toContainEqual(
      expect.objectContaining({
        kind: "createVariable",
        light: { value: RED },
      })
    )
  })

  it("leaves an existing alias alone while its target is unchanged", () => {
    const existing = colorSnap("--color-brand", "brand", {
      valuesByMode: { light: { aliasId: "v:--color-base" } },
      applied: "alias:--color-base|alias:--color-base",
    })
    const result = plan(
      specOf({ Color: [base, alias("--color-brand", "--color-base")] }),
      snapshotOf([colorSnap("--color-base", "base"), existing])
    )

    expect(result.summary).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 2,
    })
  })

  it("turns a literal into an alias when the theme starts pointing at a color", () => {
    const result = plan(
      specOf({ Color: [base, alias("--color-brand", "--color-base")] }),
      snapshotOf([
        colorSnap("--color-base", "base"),
        colorSnap("--color-brand", "brand"),
      ])
    )

    expect(result.summary.updated).toBe(1)
  })

  it("reads ids stored by an older apply as the keys they stand for", () => {
    const existing = colorSnap("--color-brand", "brand", {
      valuesByMode: { light: { aliasId: "v:--color-base" } },
      applied: "alias:v:--color-base",
    })
    const result = plan(
      specOf({ Color: [base, alias("--color-brand", "--color-other")] }),
      snapshotOf([colorSnap("--color-base", "base"), existing])
    )

    expect(result.summary.overwritten).toEqual([])
  })

  describe("to variables of unchecked groups", () => {
    const sky = colorSnap("--color-sky", "sky")
    const brandSpec = specOf({
      Color: [alias("--color-brand", "--color-sky")],
    })

    it("keeps an alias whose target is retained and already in the file", () => {
      const existing = colorSnap("--color-brand", "brand", {
        valuesByMode: { light: { aliasId: "v:--color-sky" } },
        applied: "alias:--color-sky|alias:--color-sky",
      })
      const result = plan(brandSpec, snapshotOf([sky, existing]), [
        "--color-sky",
      ])

      expect(result.summary).toMatchObject({ updated: 0, unchanged: 1 })
      expect(result.references).toEqual({ "--color-sky": "v:--color-sky" })
    })

    it("creates a new alias to a retained variable", () => {
      const result = plan(brandSpec, snapshotOf([sky]), ["--color-sky"])

      expect(result.ops).toContainEqual(
        expect.objectContaining({
          kind: "createVariable",
          light: { value: RED, aliasOf: "--color-sky" },
        })
      )
      expect(result.references).toEqual({ "--color-sky": "v:--color-sky" })
    })

    it("writes a literal when the retained target is not in the file", () => {
      const result = plan(brandSpec, snapshotOf([]), ["--color-sky"])

      expect(result.ops).toContainEqual(
        expect.objectContaining({ light: { value: RED } })
      )
      expect(result.references).toEqual({})
    })

    it("writes a literal when the target is neither planned nor retained", () => {
      const result = plan(brandSpec, snapshotOf([sky]))

      expect(result.ops).toContainEqual(
        expect.objectContaining({ light: { value: RED } })
      )
    })

    it("lists only the retained variables something refers to", () => {
      const result = plan(
        specOf({ Color: [color("--color-red", "red")] }),
        snapshotOf([sky]),
        ["--color-sky"]
      )

      expect(result.references).toEqual({})
    })
  })
})

describe("planSync dark mode", () => {
  const NAVY = { r: 0, g: 0, b: 0.5, a: 1 }
  const withDark = specOf({
    Color: [color("--color-red", "red", { dark: NAVY })],
  })
  const darkMode = { id: "dark", name: "Dark" }
  const withDarkMode = collectionSnap("Color", {
    modes: [{ id: "light", name: "Light" }, darkMode],
  })

  it("adds the Dark mode before the variables that need it", () => {
    const result = plan(withDark)

    expect(result.ops.map((op) => op.kind)).toEqual([
      "createCollection",
      "addDarkMode",
      "createVariable",
    ])
    expect(result.ops[2]).toMatchObject({ dark: { value: NAVY } })
  })

  it("counts a new dark value as an update before the mode exists", () => {
    const result = plan(withDark, snapshotOf([colorSnap("--color-red", "red")]))

    expect(result.summary).toMatchObject({ updated: 1, unchanged: 0 })
    expect(result.ops.map((op) => op.kind)).toContain("addDarkMode")
  })

  it("does not blame the user when the plugin adds the mode itself", () => {
    // An older apply stored only the light half; the new mode starts as a
    // copy of it, so nothing was edited by hand.
    const older = colorSnap("--color-red", "red", { applied: "1,0,0,1" })
    const result = plan(withDark, snapshotOf([older]))

    expect(result.summary.overwritten).toEqual([])
  })

  it("compares both modes once the Dark mode exists", () => {
    const current = colorSnap("--color-red", "red", {
      valuesByMode: { light: RED, dark: NAVY },
      applied: "1,0,0,1|0,0,0.5,1",
    })
    const result = plan(withDark, snapshotOf([current], [withDarkMode]))

    expect(result.summary).toMatchObject({ updated: 0, unchanged: 1 })
    expect(result.ops.map((op) => op.kind)).not.toContain("addDarkMode")
  })

  it("reports a dark value edited by hand", () => {
    const edited = colorSnap("--color-red", "red", {
      valuesByMode: { light: RED, dark: RED },
      applied: "1,0,0,1|0,0,0.5,1",
    })
    const result = plan(
      specOf({
        Color: [
          color("--color-red", "red", { dark: { r: 0, g: 1, b: 0, a: 1 } }),
        ],
      }),
      snapshotOf([edited], [withDarkMode])
    )

    expect(result.summary.overwritten).toEqual(["red"])
  })

  it("also offers a light-only signature, for when the mode cannot be added", () => {
    const create = plan(withDark).ops.find((op) => op.kind === "createVariable")
    const update = plan(
      withDark,
      snapshotOf([colorSnap("--color-red", "red")])
    ).ops.find((op) => op.kind === "updateVariable")

    for (const op of [create, update]) {
      expect(op).toMatchObject({
        applied: "1,0,0,1|0,0,0.5,1",
        appliedWithoutDark: "1,0,0,1|1,0,0,1",
      })
    }
  })

  it("asks for no Dark mode when no color has a dark value", () => {
    const result = plan(specOf({ Color: [color("--color-red", "red")] }))

    expect(result.ops.map((op) => op.kind)).not.toContain("addDarkMode")
  })
})

describe("planSync text styles", () => {
  const INTER = [
    { family: "Inter", style: "Regular" },
    { family: "Inter", style: "Bold" },
  ]
  const style = (extra: Partial<TextStyleSpec> = {}): TextStyleSpec => ({
    key: "text:sans/sm/bold",
    name: "sans/sm/bold",
    family: "Inter",
    weight: 700,
    fontSize: 14,
    lineHeight: 20,
    bindings: {
      fontFamily: "--font-sans",
      fontWeight: "--font-weight-bold",
      fontSize: "--text-sm",
      lineHeight: "--text-sm--line-height",
    },
    ...extra,
  })
  const withStyles = (...textStyles: TextStyleSpec[]): FigmaSpec => ({
    ...specOf({}),
    textStyles,
  })
  const existing = (
    extra: Partial<SnapshotTextStyle> = {}
  ): SnapshotTextStyle => ({
    id: "t:sm-bold",
    key: "text:sans/sm/bold",
    applied: "",
    name: "sans/sm/bold",
    font: { family: "Inter", style: "Bold" },
    fontSize: 14,
    lineHeight: { unit: "PIXELS", value: 20 },
    bound: {},
    ...extra,
  })
  const doc = (...textStyles: SnapshotTextStyle[]): Snapshot => ({
    ...EMPTY_SNAPSHOT,
    fonts: INTER,
    textStyles,
  })

  it("creates a style from the installed font", () => {
    const result = plan(withStyles(style()), doc())

    expect(result.summary.created).toBe(1)
    expect(result.ops).toContainEqual(
      expect.objectContaining({
        kind: "createTextStyle",
        key: "text:sans/sm/bold",
        font: { family: "Inter", style: "Bold" },
        fontSize: 14,
        lineHeight: 20,
      })
    )
  })

  it("skips a style whose weight the family lacks, and keeps the one in the file", () => {
    const result = plan(withStyles(style({ weight: 500 })), doc(existing()))

    expect(result.summary.skipped).toEqual(["sans/sm/bold"])
    expect(result.summary.deleted).toEqual([])
    expect(result.ops).toEqual([])
  })

  it("leaves a matching style alone", () => {
    const result = plan(
      withStyles(style({ bindings: { ...style().bindings } })),
      doc(existing())
    )

    expect(result.summary).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 1,
    })
  })

  it("updates a style whose size, font, name or line height changed", () => {
    const changes = [
      style({ fontSize: 16 }),
      style({ weight: 400 }),
      style({ name: "sans/sm/strong" }),
      style({ lineHeight: 24 }),
    ]

    for (const change of changes) {
      expect(plan(withStyles(change), doc(existing())).summary.updated).toBe(1)
    }
  })

  it("does not touch a line height the spec has no opinion on", () => {
    const result = plan(
      withStyles(style({ lineHeight: undefined })),
      doc(existing({ lineHeight: { unit: "AUTO" } }))
    )

    expect(result.summary.unchanged).toBe(1)
  })

  it("rebinds to a variable that exists but is not bound yet", () => {
    const doc2 = {
      ...doc(existing({ bound: { fontSize: "v:--text-sm" } })),
      variables: [
        colorSnap("--text-sm", "text/sm/size", {
          type: "FLOAT",
          collectionId: "c:Size",
        }),
        colorSnap("--font-weight-bold", "font-weight/bold", {
          type: "FLOAT",
          collectionId: "c:Typography",
        }),
      ],
      collections: [
        collectionSnap("Size"),
        collectionSnap("Typography", { id: "c:Typography" }),
      ],
    }
    const spec = {
      ...withStyles(style()),
      collections: specOf({
        Size: [
          {
            key: "--text-sm",
            name: "text/sm/size",
            type: "FLOAT" as const,
            value: 14,
            codeSyntax: "",
          },
        ],
        Typography: [
          {
            key: "--font-weight-bold",
            name: "font-weight/bold",
            type: "FLOAT" as const,
            value: 700,
            codeSyntax: "",
          },
        ],
      }).collections,
    }
    const update = plan(spec, doc2).ops.find(
      (op) => op.kind === "updateTextStyle"
    )

    expect(update).toMatchObject({ bind: { fontWeight: "--font-weight-bold" } })
    expect(update).not.toHaveProperty("bind.fontSize")
  })

  it("counts a binding to a variable this run will create", () => {
    const spec = {
      ...withStyles(style()),
      collections: specOf({
        Typography: [
          {
            key: "--font-weight-bold",
            name: "font-weight/bold",
            type: "FLOAT" as const,
            value: 700,
            codeSyntax: "",
          },
        ],
      }).collections,
    }

    expect(plan(spec, doc(existing())).summary.updated).toBe(1)
  })

  it("reports a style edited by hand since the last apply", () => {
    const edited = existing({
      applied: JSON.stringify(["Inter/Bold", 14, "px:20", ["", "", "", ""]]),
      fontSize: 18,
    })
    const result = plan(withStyles(style()), doc(edited))

    expect(result.summary.overwritten).toEqual(["sans/sm/bold"])
  })

  it("does not blame the user for a style that still holds what was written", () => {
    const untouched = existing({
      applied: JSON.stringify(["Inter/Bold", 14, "px:20", ["", "", "", ""]]),
    })
    const result = plan(withStyles(style({ fontSize: 16 })), doc(untouched))

    expect(result.summary.updated).toBe(1)
    expect(result.summary.overwritten).toEqual([])
  })

  it("keeps a binding to a variable of an unchecked group", () => {
    const sm = colorSnap("--text-sm", "text/sm/size", {
      type: "FLOAT",
      collectionId: "c:Typography",
      valuesByMode: { light: 14 },
    })
    const bound = existing({ bound: { fontSize: sm.id } })
    const snapshot: Snapshot = {
      ...doc(bound),
      collections: [collectionSnap("Typography", { id: "c:Typography" })],
      variables: [sm],
    }
    const result = plan(withStyles(style()), snapshot, ["--text-sm"])

    expect(result.summary).toMatchObject({ updated: 0, unchanged: 1 })
    expect(result.references).toEqual({ "--text-sm": sm.id })
  })

  it("records what it wrote so later hand edits can be told apart", () => {
    const update = plan(withStyles(style({ fontSize: 16 })), doc(existing()))
      .ops[0]

    expect(update).toMatchObject({ kind: "updateTextStyle" })
    expect((update as { applied: string }).applied).not.toBe("")
  })

  it("deletes plugin styles that left the theme, except retained ones", () => {
    const stale = existing({
      id: "t:gone",
      key: "text:sans/gone",
      name: "gone",
    })
    const dropped = plan(withStyles(), doc(stale))
    const held = plan(withStyles(), doc(stale), ["text:sans/gone"])

    expect(dropped.summary.deleted).toEqual(["gone"])
    expect(held.summary.orphans).toEqual(["gone"])
  })
})

describe("planSync effect styles", () => {
  const BLACK = { r: 0, g: 0, b: 0, a: 0.1 }
  const shadow = (radius = 4): EffectStyleSpec => ({
    key: "--shadow-sm",
    name: "shadow/sm",
    effects: [
      {
        type: "DROP_SHADOW",
        color: BLACK,
        offset: { x: 0, y: 1 },
        radius,
        spread: 0,
      },
    ],
  })
  const blur = (): EffectStyleSpec => ({
    key: "--blur-sm@layer",
    name: "blur/sm",
    effects: [{ type: "LAYER_BLUR", radius: 8, radiusKey: "--blur-sm" }],
  })
  const withEffects = (
    effectStyles: EffectStyleSpec[],
    size: VariableSpec[] = []
  ): FigmaSpec => ({ ...specOf({ Size: size }), effectStyles })
  const blurVariable: VariableSpec = {
    key: "--blur-sm",
    name: "blur/sm",
    type: "FLOAT",
    value: 8,
    codeSyntax: "var(--blur-sm)",
  }
  const shadowSnap = (
    extra: Partial<SnapshotEffectStyle> = {},
    radius = 4
  ): SnapshotEffectStyle => ({
    id: "e:sm",
    key: "--shadow-sm",
    applied: "",
    name: "shadow/sm",
    effects: [
      {
        type: "DROP_SHADOW",
        color: BLACK,
        offset: { x: 0, y: 1 },
        radius,
        spread: 0,
      },
    ],
    ...extra,
  })
  const blurSnap = (boundId: string | null): SnapshotEffectStyle => ({
    id: "e:blur",
    key: "--blur-sm@layer",
    applied: "",
    name: "blur/sm",
    effects: [{ type: "LAYER_BLUR", radius: 8, radiusBoundId: boundId }],
  })
  const doc = (
    effectStyles: SnapshotEffectStyle[],
    variables: SnapshotVariable[] = []
  ): Snapshot => ({
    ...EMPTY_SNAPSHOT,
    collections: variables.length
      ? [collectionSnap("Size", { id: "c:Size" })]
      : [],
    variables,
    effectStyles,
  })
  const sizeVariable = colorSnap("--blur-sm", "blur/sm", {
    type: "FLOAT",
    collectionId: "c:Size",
    valuesByMode: { light: 8 },
    applied: "8|8",
  })

  it("creates a style from the spec", () => {
    const result = plan(withEffects([shadow()]), doc([]))

    expect(result.summary.created).toBe(1)
    expect(result.ops).toContainEqual(
      expect.objectContaining({
        kind: "createEffectStyle",
        key: "--shadow-sm",
        effects: shadow().effects,
      })
    )
  })

  it("leaves a matching style alone and updates a changed one", () => {
    expect(
      plan(withEffects([shadow()]), doc([shadowSnap()])).summary.unchanged
    ).toBe(1)
    expect(
      plan(withEffects([shadow(8)]), doc([shadowSnap()])).summary.updated
    ).toBe(1)
  })

  it("ignores float noise below the stored precision", () => {
    const result = plan(withEffects([shadow()]), doc([shadowSnap({}, 4.00001)]))

    expect(result.summary.unchanged).toBe(1)
  })

  it("keeps a blur bound to the variable it already uses", () => {
    const result = plan(
      withEffects([blur()], [blurVariable]),
      doc([blurSnap("v:--blur-sm")], [sizeVariable])
    )

    // The variable and the style, neither of which changed.
    expect(result.summary).toMatchObject({ updated: 0, unchanged: 2 })
  })

  it("rebinds a blur that lost its variable", () => {
    const result = plan(
      withEffects([blur()], [blurVariable]),
      doc([blurSnap(null)], [sizeVariable])
    )

    expect(result.summary.updated).toBe(1)
  })

  it("keeps a blur bound to a variable of an unchecked group", () => {
    const result = plan(
      withEffects([blur()]),
      doc([blurSnap("v:--blur-sm")], [sizeVariable]),
      ["--blur-sm"]
    )

    expect(result.summary).toMatchObject({ updated: 0, unchanged: 1 })
    expect(result.references).toEqual({ "--blur-sm": "v:--blur-sm" })
  })

  it("unbinds a blur whose variable is neither planned nor retained", () => {
    const result = plan(
      withEffects([blur()]),
      doc([blurSnap("v:--blur-sm")], [sizeVariable])
    )

    expect(result.summary.updated).toBe(1)
  })

  it("counts the binding to a variable this run will create", () => {
    const result = plan(
      withEffects([blur()], [blurVariable]),
      doc([blurSnap(null)])
    )

    expect(result.summary.updated).toBe(1)
  })

  it("reports a style edited by hand since the last apply", () => {
    const applied = JSON.stringify([
      ["DROP_SHADOW", [0, 0, 0, 0.1], 0, 1, 4, 0],
    ])
    const edited = shadowSnap({ applied }, 2)
    const result = plan(withEffects([shadow()]), doc([edited]))

    expect(result.summary.overwritten).toEqual(["shadow/sm"])
  })

  it("does not blame the user for a style that still holds what was written", () => {
    const untouched = shadowSnap({
      applied: JSON.stringify([["DROP_SHADOW", [0, 0, 0, 0.1], 0, 1, 4, 0]]),
    })
    const result = plan(withEffects([shadow(8)]), doc([untouched]))

    expect(result.summary.updated).toBe(1)
    expect(result.summary.overwritten).toEqual([])
  })

  it("deletes plugin styles that left the theme, except retained ones", () => {
    const stale = shadowSnap({
      id: "e:gone",
      key: "--shadow-gone",
      name: "gone",
    })

    expect(plan(withEffects([]), doc([stale])).summary.deleted).toEqual([
      "gone",
    ])
    expect(
      plan(withEffects([]), doc([stale]), ["--shadow-gone"]).summary.orphans
    ).toEqual(["gone"])
  })
})

describe("planSync over a whole theme", () => {
  const spec = buildFigmaSpec(
    parseThemeTokens(themeCss, { skipReference: true })
  )
  const total =
    spec.collections.reduce((sum, c) => sum + c.variables.length, 0) +
    spec.textStyles.length +
    spec.effectStyles.length
  const fonts = [400, 500, 600, 700].map((weight) => ({
    family: "Inter",
    style: { 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold" }[
      weight
    ]!,
  }))

  it("accounts for every variable and style in an empty file", () => {
    const result = plan(spec, { ...EMPTY_SNAPSHOT, fonts })
    const { created, updated, unchanged, skipped } = result.summary

    expect(updated + unchanged).toBe(0)
    expect(created + skipped.length).toBe(total)
  })

  it("is the same plan for the same inputs", () => {
    const snapshot = { ...EMPTY_SNAPSHOT, fonts }

    expect(plan(spec, snapshot)).toEqual(plan(spec, snapshot))
  })
})

describe("planSync removals", () => {
  it("plans exactly one removal for each item it reports as deleted", () => {
    const result = plan(
      { ...specOf({}), textStyles: [], effectStyles: [] },
      {
        ...snapshotOf([colorSnap("--color-gone", "gone")]),
        textStyles: [
          {
            id: "t",
            key: "text:gone",
            applied: "",
            name: "t",
            font: { family: "Inter", style: "Regular" },
            fontSize: 1,
            lineHeight: { unit: "AUTO" },
            bound: {},
          },
        ],
        effectStyles: [
          {
            id: "e",
            key: "--shadow-gone",
            applied: "",
            name: "e",
            effects: [],
          },
        ],
      }
    )

    expect(result.summary.deleted).toHaveLength(3)
    expect(result.ops.filter((op) => op.kind === "remove")).toHaveLength(3)
  })
})
