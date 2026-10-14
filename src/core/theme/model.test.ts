import { describe, expect, it } from "vitest"

import {
  applyOverrides,
  EMPTY_OVERRIDES,
  fontSlot,
  groupColorRows,
  countThemeChanges,
  hasAnyChanges,
  isValidTokenName,
  listFontSlots,
  listTokens,
  parseOverrides,
  removeFontSlot,
  removeToken,
  removeTokens,
  resetToken,
  setDarkEnabled,
  setDarkValue,
  setFontFamily,
  setGroupsIncluded,
  setTextStyleSlot,
  setToken,
  tokenTab,
} from "./model"

const defaults = new Map([
  ["--font-sans", "ui-sans-serif, system-ui"],
  ["--font-weight-bold", "700"],
  ["--color-red-500", "red"],
  ["--color-blue-500", "blue"],
  ["--spacing", "0.25rem"],
  ["--radius-md", "0.375rem"],
  ["--shadow-sm", "0 1px 2px black"],
  ["--text-shadow-sm", "0 1px 0 black"],
  ["--ease-in", "ease-in"],
])

describe("parseOverrides", () => {
  it("falls back to empty overrides for missing or unusable data", () => {
    expect(parseOverrides(null)).toBe(EMPTY_OVERRIDES)
    expect(parseOverrides("{not json")).toBe(EMPTY_OVERRIDES)
    expect(parseOverrides('{"version":2}')).toBe(EMPTY_OVERRIDES)
  })

  it("fills in fields missing from stored data", () => {
    const stored = parseOverrides('{"version":1,"values":{"--color-a":"red"}}')

    expect(stored.values).toEqual({ "--color-a": "red" })
    expect(stored.textStyleSlots).toEqual(["sans"])
  })
})

describe("token edits", () => {
  it("overrides in place, appends additions, and drops removals", () => {
    let overrides = setToken(
      EMPTY_OVERRIDES,
      defaults,
      "--color-red-500",
      "#f00"
    )
    overrides = setToken(overrides, defaults, "--color-brand", " teal ")
    overrides = removeToken(overrides, defaults, "--color-blue-500")

    const tokens = [...applyOverrides(defaults, overrides)]
    expect(tokens.filter(([prop]) => prop.startsWith("--color-"))).toEqual([
      ["--color-red-500", "#f00"],
      ["--color-brand", "teal"],
    ])
    expect(overrides.removed).toEqual(["--color-blue-500"])
  })

  it("clears an override when the value returns to the default", () => {
    const changed = setToken(EMPTY_OVERRIDES, defaults, "--radius-md", "1rem")

    expect(
      setToken(changed, defaults, "--radius-md", "0.375rem").values
    ).toEqual({})
    expect(resetToken(changed, "--radius-md").values).toEqual({})
  })

  it("restores a removed default when it is set or reset", () => {
    const removed = removeToken(EMPTY_OVERRIDES, defaults, "--radius-md")

    expect(resetToken(removed, "--radius-md").removed).toEqual([])
    expect(setToken(removed, defaults, "--radius-md", "1rem").removed).toEqual(
      []
    )
  })

  it("deletes added tokens outright", () => {
    let overrides = setToken(EMPTY_OVERRIDES, defaults, "--color-brand", "teal")
    overrides = setDarkValue(overrides, "--color-brand", "navy")
    overrides = removeToken(overrides, defaults, "--color-brand")

    expect(overrides).toEqual(EMPTY_OVERRIDES)
  })

  it("stores and clears dark values", () => {
    const dark = setDarkValue(EMPTY_OVERRIDES, "--color-red-500", " maroon ")

    expect(dark.dark).toEqual({ "--color-red-500": "maroon" })
    expect(setDarkValue(dark, "--color-red-500", "").dark).toEqual({})
  })
})

describe("listTokens", () => {
  it("sorts tokens into tabs", () => {
    expect(tokenTab("--color-red-500")).toBe("Color")
    expect(tokenTab("--text-shadow-sm")).toBe("Effects")
    expect(tokenTab("--text-sm")).toBe("Typography")
    expect(tokenTab("--spacing")).toBe("Size")
    expect(tokenTab("--ease-in")).toBeNull()
  })

  it("reports the state of each row, leaving out font slots and removed tokens", () => {
    let overrides = setToken(
      EMPTY_OVERRIDES,
      defaults,
      "--color-red-500",
      "#f00"
    )
    overrides = setToken(overrides, defaults, "--color-brand", "teal")
    overrides = removeToken(overrides, defaults, "--color-blue-500")

    expect(listTokens(defaults, overrides, "Color")).toEqual([
      {
        prop: "--color-red-500",
        value: "#f00",
        defaultValue: "red",
        state: "modified",
      },
      { prop: "--color-brand", value: "teal", state: "custom" },
    ])
    expect(
      listTokens(defaults, overrides, "Typography").map((row) => row.prop)
    ).toEqual(["--font-weight-bold"])
  })
})

describe("font slots", () => {
  it("recognizes font family tokens only", () => {
    expect(fontSlot("--font-sans")).toBe("sans")
    expect(fontSlot("--font-weight-bold")).toBeNull()
    expect(fontSlot("--font-sans--font-feature-settings")).toBeNull()
  })

  it("lists default and custom slots with their families", () => {
    let overrides = setFontFamily(
      EMPTY_OVERRIDES,
      defaults,
      "sans",
      "Pretendard"
    )
    overrides = setFontFamily(overrides, defaults, "display", "Satoshi")

    expect(listFontSlots(defaults, EMPTY_OVERRIDES)).toEqual([
      { slot: "sans", family: "Inter", custom: false },
    ])
    expect(listFontSlots(defaults, overrides)).toEqual([
      { slot: "sans", family: "Pretendard", custom: false },
      { slot: "display", family: "Satoshi", custom: true },
    ])
    expect(overrides.values).toEqual({
      "--font-display": '"Satoshi", sans-serif',
    })
  })

  it("removes a custom slot and its text styles", () => {
    let overrides = setFontFamily(
      EMPTY_OVERRIDES,
      defaults,
      "display",
      "Satoshi"
    )
    overrides = { ...overrides, textStyleSlots: ["sans", "display"] }

    expect(removeFontSlot(overrides, "display")).toEqual(EMPTY_OVERRIDES)
  })
})

describe("isValidTokenName", () => {
  it("accepts kebab-case names only", () => {
    expect(isValidTokenName("brand-500")).toBe(true)
    expect(isValidTokenName("Brand")).toBe(false)
    expect(isValidTokenName("brand--x")).toBe(false)
    expect(isValidTokenName("")).toBe(false)
  })
})

describe("hasAnyChanges", () => {
  it("is false for untouched overrides", () => {
    expect(hasAnyChanges(EMPTY_OVERRIDES)).toBe(false)
  })

  it("is true once anything differs from the defaults", () => {
    expect(
      hasAnyChanges(setToken(EMPTY_OVERRIDES, defaults, "--radius-md", "1rem"))
    ).toBe(true)
    expect(
      hasAnyChanges(removeToken(EMPTY_OVERRIDES, defaults, "--radius-md"))
    ).toBe(true)
    expect(
      hasAnyChanges({ ...EMPTY_OVERRIDES, excludedGroups: ["Color/red"] })
    ).toBe(true)
    expect(
      hasAnyChanges({ ...EMPTY_OVERRIDES, textStyleSlots: ["sans", "mono"] })
    ).toBe(true)
  })
})

describe("apply settings", () => {
  it("unchecks groups and checks them again", () => {
    const unchecked = setGroupsIncluded(
      EMPTY_OVERRIDES,
      ["Color/red", "Size/spacing"],
      false
    )

    expect(unchecked.excludedGroups).toEqual(["Color/red", "Size/spacing"])
    expect(
      setGroupsIncluded(unchecked, ["Color/red"], true).excludedGroups
    ).toEqual(["Size/spacing"])
  })

  it("does not list a group twice or disturb the order", () => {
    const overrides = { ...EMPTY_OVERRIDES, excludedGroups: ["B", "A"] }

    expect(
      setGroupsIncluded(overrides, ["A", "C"], false).excludedGroups
    ).toEqual(["B", "A", "C"])
  })

  it("leaves the slot order alone when nothing changes", () => {
    const overrides = { ...EMPTY_OVERRIDES, textStyleSlots: ["mono", "sans"] }

    expect(setTextStyleSlot(overrides, "mono", true)).toBe(overrides)
  })

  it("turns text styles on and off per font slot", () => {
    const on = setTextStyleSlot(EMPTY_OVERRIDES, "mono", true)

    expect(on.textStyleSlots).toEqual(["sans", "mono"])
    expect(setTextStyleSlot(on, "sans", false).textStyleSlots).toEqual(["mono"])
    expect(setTextStyleSlot(on, "mono", true).textStyleSlots).toEqual([
      "sans",
      "mono",
    ])
  })

  it("keeps dark values while dark mode is off", () => {
    const dark = setDarkEnabled(
      setDarkValue(EMPTY_OVERRIDES, "--color-red-500", "maroon"),
      true
    )
    const off = setDarkEnabled(dark, false)

    expect(off.darkEnabled).toBe(false)
    expect(off.dark).toEqual({ "--color-red-500": "maroon" })
    expect(setDarkEnabled(off, true)).toEqual(dark)
  })
})

describe("countThemeChanges", () => {
  it("counts changed, removed and added tokens and chosen fonts", () => {
    let overrides = setToken(EMPTY_OVERRIDES, defaults, "--radius-md", "1rem")
    overrides = removeToken(overrides, defaults, "--shadow-sm")
    overrides = setToken(overrides, defaults, "--color-brand", "teal")
    overrides = setFontFamily(overrides, defaults, "sans", "Pretendard")

    expect(countThemeChanges(overrides)).toBe(4)
  })

  it("leaves apply settings out", () => {
    const settings = setTextStyleSlot(
      setGroupsIncluded(EMPTY_OVERRIDES, ["Color/red"], false),
      "mono",
      true
    )

    expect(countThemeChanges(settings)).toBe(0)
  })
})

describe("groupColorRows", () => {
  const row = (prop: string) => ({
    prop,
    value: "red",
    state: "default" as const,
  })

  it("groups stepped colors by palette in order of appearance", () => {
    const groups = groupColorRows([
      row("--color-red-50"),
      row("--color-red-500"),
      row("--color-blue-500"),
      row("--color-red-950"),
    ])

    expect(groups.map((g) => [g.name, g.rows.map((r) => r.prop)])).toEqual([
      ["red", ["--color-red-50", "--color-red-500", "--color-red-950"]],
      ["blue", ["--color-blue-500"]],
    ])
  })

  it("collects colors without a step into one unnamed group at the end", () => {
    const groups = groupColorRows([
      row("--color-black"),
      row("--color-red-500"),
      row("--color-sidebar-primary"),
      row("--color-brand-500"),
    ])

    expect(groups.map((g) => [g.name, g.rows.length])).toEqual([
      ["red", 1],
      ["brand", 1],
      [null, 2],
    ])
  })
})

describe("removing a group of tokens", () => {
  const group = ["--color-red-500", "--color-blue-500", "--color-brand-500"]
  const edited = setDarkValue(
    setToken(
      setToken(EMPTY_OVERRIDES, defaults, "--color-brand-500", "teal"),
      defaults,
      "--color-red-500",
      "#f00"
    ),
    "--color-brand-500",
    "navy"
  )

  it("marks defaults removed and drops added tokens", () => {
    const next = removeTokens(edited, defaults, group)

    expect(next.removed).toEqual(["--color-red-500", "--color-blue-500"])
    expect(next.values).toEqual({})
    expect(next.dark).toEqual({})
  })

  it("leaves tokens outside the group alone", () => {
    const next = removeTokens(edited, defaults, ["--color-blue-500"])

    expect(next.removed).toEqual(["--color-blue-500"])
    expect(next.values).toEqual(edited.values)
  })
})
