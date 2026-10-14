import { useMemo, useState } from "react"

import { Input } from "@/components/ui/input"

const MAX_OPTIONS = 50

type FontPickerProps = {
  value: string
  families: ReadonlySet<string>
  label: string
  placeholder?: string
  invalid?: boolean
  /** Called with every keystroke and selection. */
  onInput?: (family: string) => void
  /** Called when a family is picked from the list or the field is left. */
  onCommit?: (family: string) => void
}

/** Text field with a filtered list of the font families Figma offers. */
export function FontPicker({
  value,
  families,
  label,
  placeholder,
  invalid,
  onInput,
  onCommit,
}: FontPickerProps) {
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const options = useMemo(() => {
    const query = draft.trim().toLowerCase()
    const matches: string[] = []
    for (const family of families) {
      if (family.toLowerCase().includes(query)) {
        matches.push(family)
        if (matches.length === MAX_OPTIONS) {
          break
        }
      }
    }

    return matches
  }, [draft, families])

  function change(family: string) {
    setDraft(family)
    setActive(0)
    onInput?.(family)
  }

  function commit(family: string) {
    const next = family.trim()
    setOpen(false)
    if (next && next !== value) {
      onCommit?.(next)
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        value={draft}
        placeholder={placeholder}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => setOpen(true)}
        onBlur={() => commit(draft)}
        onChange={(event) => {
          change(event.target.value)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            const step = event.key === "ArrowDown" ? 1 : -1
            setOpen(true)
            setActive((index) =>
              Math.min(Math.max(index + step, 0), options.length - 1)
            )
          }
          if (event.key === "Enter") {
            event.preventDefault()
            const picked = open ? options[active] : undefined
            if (picked) {
              change(picked)
            }
            commit(picked ?? draft)
          }
          if (event.key === "Escape") {
            setOpen(false)
          }
        }}
      />
      {open && options.length > 0 && (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-full z-10 mt-1 max-h-44 overflow-y-auto rounded-md border bg-popover py-1 text-popover-foreground shadow-md"
        >
          {options.map((family, index) => (
            <li
              key={family}
              role="option"
              aria-selected={index === active}
              className="cursor-pointer truncate px-2 py-1 aria-selected:bg-accent"
              // Keeps focus in the field so the blur handler does not fire
              // before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                change(family)
                commit(family)
              }}
            >
              {family}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
