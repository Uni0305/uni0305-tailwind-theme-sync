import { describe, expect, it } from "vitest"

import { evaluate } from "./units"

describe("evaluate", () => {
  it("reads plain quantities", () => {
    expect(evaluate("0.25rem")).toEqual({ value: 4, unit: "px" })
    expect(evaluate("12px")).toEqual({ value: 12, unit: "px" })
    expect(evaluate("-0.025em")).toEqual({ value: -0.025, unit: "em" })
    expect(evaluate("700")).toEqual({ value: 700, unit: "" })
  })

  it("evaluates calc expressions", () => {
    expect(evaluate("calc(1.25 / 0.875)")?.value).toBeCloseTo(1.42857)
    expect(evaluate("calc(0.625rem * 0.6)")).toEqual({ value: 6, unit: "px" })
    expect(evaluate("calc(0.5rem + 2px)")).toEqual({ value: 10, unit: "px" })
    expect(evaluate("calc((1rem - 4px) * 2)")).toEqual({
      value: 24,
      unit: "px",
    })
  })

  it("rejects what it cannot reduce", () => {
    expect(evaluate("var(--radius)")).toBeNull()
    expect(evaluate("calc(1rem + 1em)")).toBeNull()
    expect(evaluate("calc(1px * 1px)")).toBeNull()
    expect(evaluate("ui-serif, Georgia")).toBeNull()
    expect(evaluate("")).toBeNull()
  })
})
