import { Checkbox } from "@/components/ui/checkbox"
import type { SpecGroup, SpecSection } from "@/core/figma-spec/select"

const SECTIONS: SpecSection[] = [
  "Color",
  "Typography",
  "Size",
  "Text styles",
  "Effects",
]

type GroupListProps = {
  groups: SpecGroup[]
  excluded: ReadonlySet<string>
  /** CSS colors to preview per group id. */
  swatches: ReadonlyMap<string, string[]>
  disabled?: boolean
  onToggle: (ids: string[], included: boolean) => void
}

export function GroupList({
  groups,
  excluded,
  swatches,
  disabled,
  onToggle,
}: GroupListProps) {
  return (
    <div className="flex flex-col gap-3">
      {SECTIONS.map((section) => {
        const items = groups.filter((group) => group.section === section)
        if (items.length === 0) {
          return null
        }

        const included = items.filter((group) => !excluded.has(group.id))
        const total = included.reduce((sum, group) => sum + group.count, 0)

        return (
          <section key={section}>
            <label className="flex h-7 items-center gap-2 border-b font-medium">
              <Checkbox
                checked={included.length === items.length}
                indeterminate={
                  included.length > 0 && included.length < items.length
                }
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onToggle(
                    items.map((group) => group.id),
                    checked
                  )
                }
              />
              <span className="flex-1">{section}</span>
              <span className="font-normal text-muted-foreground tabular-nums">
                {total}
              </span>
            </label>
            <ul className="flex flex-col pt-1">
              {items.map((group) => (
                <li key={group.id}>
                  <label className="flex h-6 items-center gap-2 pl-6">
                    <Checkbox
                      checked={!excluded.has(group.id)}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        onToggle([group.id], checked)
                      }
                    />
                    <span className="w-28 shrink-0 truncate">
                      {group.label}
                    </span>
                    <span className="flex h-3.5 flex-1 overflow-hidden rounded-sm outline outline-1 -outline-offset-1 outline-foreground/10">
                      {swatches.get(group.id)?.map((color, index) => (
                        <span
                          key={index}
                          className="flex-1"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                    <span className="w-8 shrink-0 text-right text-muted-foreground tabular-nums">
                      {group.count}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
