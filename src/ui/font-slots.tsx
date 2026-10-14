import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import type { ThemeTokens } from "@/core/css/parse"
import {
  isValidTokenName,
  listFontSlots,
  removeFontSlot,
  setFontFamily,
} from "@/core/theme/model"
import type { Overrides } from "@/core/theme/model"
import { FontPicker } from "@/ui/font-picker"
import { useTranslate } from "@/ui/i18n"

type FontSlotsProps = {
  defaults: ThemeTokens
  overrides: Overrides
  /** Families installed in Figma; empty until the list has loaded. */
  families: ReadonlySet<string>
  /** `removed` names what a deletion took out, so the caller can offer undo. */
  onChange: (overrides: Overrides, removed?: string) => void
}

export function FontSlots({
  defaults,
  overrides,
  families,
  onChange,
}: FontSlotsProps) {
  const t = useTranslate()
  const [slotName, setSlotName] = useState("")
  const [slotFamily, setSlotFamily] = useState("")

  const slots = listFontSlots(defaults, overrides)
  const known = (family: string) => families.size === 0 || families.has(family)
  const canAdd =
    isValidTokenName(slotName) &&
    slotName !== "weight" &&
    !slots.some((row) => row.slot === slotName) &&
    slotFamily.trim() !== "" &&
    known(slotFamily.trim())

  return (
    <section className="mb-2 flex flex-col gap-1.5 border-b pb-3">
      <div>
        <h2 className="font-medium">{t("fontSlots")}</h2>
        <p className="text-muted-foreground">{t("fontSlotsHint")}</p>
      </div>
      <ul className="flex flex-col">
        {slots.map((row) => (
          <li key={row.slot} className="group/row flex flex-col">
            <div className="flex h-7 items-center gap-2">
              <span className="w-24 shrink-0 truncate font-mono">
                --font-{row.slot}
              </span>
              <FontPicker
                key={row.family}
                value={row.family}
                families={families}
                label={`${t("fontFamily")} (${row.slot})`}
                invalid={!known(row.family)}
                onCommit={(family) =>
                  onChange(setFontFamily(overrides, defaults, row.slot, family))
                }
              />
              <label className="flex shrink-0 items-center gap-1.5">
                <Checkbox
                  checked={overrides.textStyleSlots.includes(row.slot)}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...overrides,
                      textStyleSlots: checked
                        ? [...overrides.textStyleSlots, row.slot]
                        : overrides.textStyleSlots.filter(
                            (slot) => slot !== row.slot
                          ),
                    })
                  }
                />
                {t("textStyles")}
              </label>
              <span className="flex w-6 shrink-0 justify-end">
                {row.custom && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title={t("remove")}
                    aria-label={t("remove")}
                    onClick={() =>
                      onChange(
                        removeFontSlot(overrides, row.slot),
                        `--font-${row.slot}`
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </span>
            </div>
            {!known(row.family) && (
              <p className="pb-1 pl-26 text-destructive">{t("fontMissing")}</p>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!canAdd) {
            return
          }
          onChange(
            setFontFamily(overrides, defaults, slotName, slotFamily.trim())
          )
          setSlotName("")
          setSlotFamily("")
        }}
      >
        <Input
          value={slotName}
          placeholder={t("slotName")}
          aria-label={t("slotName")}
          spellCheck={false}
          className="w-24 shrink-0 font-mono"
          onChange={(event) => setSlotName(event.target.value)}
        />
        <FontPicker
          key={slots.length}
          value=""
          families={families}
          label={t("fontFamily")}
          placeholder={t("fontFamily")}
          onInput={setSlotFamily}
        />
        <Button type="submit" variant="outline" size="xs" disabled={!canAdd}>
          <Plus />
          {t("addSlot")}
        </Button>
      </form>
    </section>
  )
}
