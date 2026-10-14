import themeCss from "virtual:tailwind-theme"
import { describe, expect, it } from "vitest"

import { parseThemeTokens } from "../css/parse"
import { buildFigmaSpec } from "./build"
import { filterSpec, listGroups, retainedKeys } from "./select"

const spec = buildFigmaSpec(parseThemeTokens(themeCss, { skipReference: true }))

describe("listGroups", () => {
  const groups = listGroups(spec)
  const group = (id: string) => groups.find((g) => g.id === id)

  it("groups colors by palette and keeps stepless colors together", () => {
    expect(group("Color/red")).toMatchObject({ label: "red", count: 11 })
    expect(group("Color/other")?.count).toBe(2)
    expect(groups.filter((g) => g.section === "Color")).toHaveLength(27)
  })

  it("groups the remaining variables and styles by namespace", () => {
    expect(group("Size/spacing")?.count).toBe(35)
    expect(group("Typography/text")?.count).toBe(26)
    expect(group("Text styles/sans")?.count).toBe(117)
    expect(group("Effects/backdrop-blur")?.count).toBe(7)
  })

  it("accounts for every item exactly once", () => {
    const total =
      spec.collections.reduce((sum, c) => sum + c.variables.length, 0) +
      spec.textStyles.length +
      spec.effectStyles.length

    expect(groups.reduce((sum, g) => sum + g.count, 0)).toBe(total)
  })
})

describe("filterSpec", () => {
  it("returns the same spec when nothing is excluded", () => {
    expect(filterSpec(spec, new Set())).toBe(spec)
  })

  it("removes only the excluded groups", () => {
    const filtered = filterSpec(
      spec,
      new Set([
        "Color/taupe",
        "Size/spacing",
        "Text styles/sans",
        "Effects/blur",
      ])
    )
    const names = filtered.collections.flatMap((c) =>
      c.variables.map((v) => v.name)
    )

    expect(names).not.toContain("taupe/500")
    expect(names).toContain("red/500")
    expect(names.some((n) => n.startsWith("spacing/"))).toBe(false)
    expect(names).toContain("radius/md")
    expect(filtered.textStyles).toEqual([])
    expect(filtered.effectStyles.map((s) => s.name)).not.toContain("blur/sm")
    expect(filtered.effectStyles.map((s) => s.name)).toContain(
      "backdrop-blur/sm"
    )
    expect(filtered.collections.map((c) => c.name)).toEqual([
      "Color",
      "Typography",
      "Size",
    ])
  })
})

describe("retainedKeys", () => {
  it("is empty when nothing is excluded", () => {
    expect(retainedKeys(spec, new Set())).toEqual([])
  })

  it("lists the keys of every item in an excluded group", () => {
    const keys = retainedKeys(
      spec,
      new Set(["Color/taupe", "Text styles/sans", "Effects/blur"])
    )

    expect(keys).toContain("--color-taupe-500")
    expect(keys).toContain("text:sans/sm/semibold")
    expect(keys).toContain("--blur-sm@layer")
    expect(keys).not.toContain("--blur-sm@backdrop")
    expect(keys).not.toContain("--color-red-500")
    expect(keys).toHaveLength(11 + 117 + 7)
  })

  it("covers exactly what filterSpec leaves out", () => {
    const excluded = new Set(["Color/red", "Size/spacing"])
    const kept = filterSpec(spec, excluded)
    const count = (s: typeof spec) =>
      s.collections.reduce((sum, c) => sum + c.variables.length, 0) +
      s.textStyles.length +
      s.effectStyles.length

    expect(retainedKeys(spec, excluded)).toHaveLength(count(spec) - count(kept))
  })
})
