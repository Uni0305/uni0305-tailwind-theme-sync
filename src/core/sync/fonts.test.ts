import { describe, expect, it } from "vitest"

import { createFontResolver } from "./fonts"

const inter = [
  { family: "Inter", style: "Regular" },
  { family: "Inter", style: "Semi Bold" },
  { family: "Inter", style: "Bold" },
]

describe("createFontResolver", () => {
  const resolve = createFontResolver(inter)

  it("maps numeric weights to installed styles", () => {
    expect(resolve("Inter", 400)).toEqual({ family: "Inter", style: "Regular" })
    expect(resolve("Inter", 700)).toEqual({ family: "Inter", style: "Bold" })
  })

  it("ignores case, spaces and dashes in style names", () => {
    expect(resolve("Inter", 600)).toEqual({
      family: "Inter",
      style: "Semi Bold",
    })
  })

  it("returns null instead of substituting a neighboring weight", () => {
    expect(resolve("Inter", 500)).toBeNull()
  })

  it("returns null for families that are not installed", () => {
    expect(resolve("Missing", 400)).toBeNull()
  })
})
