import {
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ThemeTokens } from "@/core/css/parse"
import {
  groupColorRows,
  isValidTokenName,
  listTokens,
  namespaceOf,
  paletteRenameIssue,
  removeToken,
  removeTokens,
  renamePalette,
  renameToken,
  resetToken,
  setDarkEnabled,
  setDarkValue,
  setToken,
  TAB_NAMESPACES,
  tokenName,
  tokenRenameIssue,
} from "@/core/theme/model"
import type { Overrides, TokenRow, TokenTab } from "@/core/theme/model"
import { useTranslate } from "@/ui/i18n"
import { RenameField, RenameInput } from "@/ui/rename-field"
import type { TokenPreview } from "@/ui/token-preview"

type TokenTableProps = {
  tab: TokenTab
  defaults: ThemeTokens
  overrides: Overrides
  preview: (prop: string) => TokenPreview
  /** `removed` names what a deletion took out, so the caller can offer undo. */
  onChange: (overrides: Overrides, removed?: string) => void
  /** Shown above the tokens, inside the scrolling area. */
  children?: ReactNode
}

// Shown on hover and whenever focus is inside the row, so the keyboard reaches
// them too.
const ROW_ACTIONS =
  "flex justify-end opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100"

/** Grid tracks: state dot, swatch (colors), name, value(s), actions. */
function columns(tab: TokenTab, dark: boolean) {
  if (tab !== "Color") {
    return "8px 200px minmax(0, 1fr) 48px"
  }

  return dark
    ? "8px 16px 132px minmax(0, 1fr) minmax(0, 1fr) 48px"
    : "8px 16px 132px minmax(0, 1fr) 48px"
}

/** Commits on blur or Enter, so half-typed values are never stored. */
function ValueInput({
  value,
  placeholder,
  invalid,
  label,
  suffix,
  onCommit,
}: {
  value: string
  placeholder?: string
  invalid?: boolean
  label: string
  /** What the value converts to, shown at the end of the field. */
  suffix?: string
  onCommit: (value: string) => void
}) {
  return (
    <span className="flex h-6 min-w-0 items-center gap-1.5 rounded-md border border-input px-1.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive dark:bg-input/30">
      <input
        key={value}
        defaultValue={value}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={invalid || undefined}
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent font-mono outline-none placeholder:text-muted-foreground"
        onBlur={(event) => {
          if (event.target.value.trim() !== value) {
            onCommit(event.target.value)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur()
          }
        }}
      />
      {suffix && (
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {suffix}
        </span>
      )}
    </span>
  )
}

function Row({
  row,
  tab,
  defaults,
  overrides,
  preview,
  onChange,
}: TokenTableProps & { row: TokenRow }) {
  const t = useTranslate()
  const result = preview(row.prop)
  const dark = tab === "Color" && overrides.darkEnabled
  const stateLabel =
    row.state === "modified"
      ? t("modified")
      : row.state === "custom"
        ? t("added")
        : null
  const suffix =
    result.kind === "number"
      ? `→ ${result.value}`
      : result.kind === "layers"
        ? `→ ${t("layers", { n: result.count })}`
        : undefined
  // Added tokens can be renamed; sub-properties such as
  // `--text-x--line-height` follow their token instead.
  const namespace = namespaceOf(row.prop)
  const renameable =
    row.state === "custom" && isValidTokenName(tokenName(row.prop))

  return (
    <li
      className="group/row grid min-h-7 items-center gap-x-1.5 py-0.5"
      style={{ gridTemplateColumns: columns(tab, dark) }}
    >
      {stateLabel ? (
        <Tooltip>
          <TooltipTrigger
            render={<span className="flex h-6 items-center justify-center" />}
          >
            <span
              className={`size-1.5 rounded-full ${row.state === "modified" ? "bg-warning" : "bg-success"}`}
            />
          </TooltipTrigger>
          <TooltipContent side="right">{stateLabel}</TooltipContent>
        </Tooltip>
      ) : (
        <span />
      )}
      {tab === "Color" && (
        <span
          className="size-4 rounded-sm border"
          style={{ backgroundColor: row.value }}
        />
      )}
      {renameable ? (
        <span className="flex min-w-0">
          <RenameField
            prefix={namespace}
            name={tokenName(row.prop)}
            check={(name) =>
              tokenRenameIssue(overrides, defaults, row.prop, namespace + name)
            }
            onRename={(name) =>
              onChange(
                renameToken(overrides, defaults, row.prop, namespace + name)
              )
            }
            className="flex-1"
          />
          {stateLabel && <span className="sr-only"> ({stateLabel})</span>}
        </span>
      ) : (
        <span title={row.prop} className="truncate font-mono">
          {row.prop}
          {stateLabel && <span className="sr-only"> ({stateLabel})</span>}
        </span>
      )}
      <ValueInput
        value={row.value}
        invalid={result.kind === "invalid"}
        label={row.prop}
        suffix={suffix}
        onCommit={(value) =>
          onChange(setToken(overrides, defaults, row.prop, value))
        }
      />
      {dark && (
        <ValueInput
          value={overrides.dark[row.prop] ?? ""}
          placeholder={t("darkPlaceholder")}
          label={`${row.prop} (dark)`}
          onCommit={(value) =>
            onChange(setDarkValue(overrides, row.prop, value))
          }
        />
      )}
      <span className={ROW_ACTIONS}>
        {row.state === "modified" && (
          <Button
            variant="ghost"
            size="icon-xs"
            title={t("reset")}
            aria-label={t("reset")}
            onClick={() => onChange(resetToken(overrides, row.prop))}
          >
            <RotateCcw />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          title={t("remove")}
          aria-label={t("remove")}
          onClick={() =>
            onChange(removeToken(overrides, defaults, row.prop), row.prop)
          }
        >
          <Trash2 />
        </Button>
      </span>
      {result.kind === "invalid" && (
        <p
          className="pb-0.5 text-destructive"
          style={{ gridColumn: `${tab === "Color" ? 4 : 3} / -1` }}
        >
          {t("invalidValue")}
        </p>
      )}
    </li>
  )
}

function AddToken({
  tab,
  defaults,
  overrides,
  onChange,
}: Omit<TokenTableProps, "preview" | "children">) {
  const t = useTranslate()
  const namespaces = TAB_NAMESPACES[tab]
  const [namespace, setNamespace] = useState(namespaces[0])
  const [name, setName] = useState("")
  const [value, setValue] = useState("")

  const prop = `--${namespace}-${name}`
  const error = !name
    ? null
    : !isValidTokenName(name)
      ? t("invalidName")
      : // A removed default is free to be added again.
        (defaults.has(prop) && !overrides.removed.includes(prop)) ||
          prop in overrides.values
        ? t("duplicateName")
        : null

  return (
    <form
      className="mb-2 flex flex-col gap-1 rounded-md border bg-muted/40 p-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name || !value.trim() || error) {
          return
        }
        onChange(setToken(overrides, defaults, prop, value))
        setName("")
        setValue("")
      }}
    >
      <div className="flex items-center gap-1.5">
        {namespaces.length > 1 ? (
          <Select
            value={namespace}
            onValueChange={(next) => {
              if (next) {
                setNamespace(next)
              }
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label="namespace"
              className="h-6! w-36 shrink-0 bg-background py-0 pr-1.5 pl-2 font-mono"
            >
              <SelectValue>{(item: string) => `--${item}-`}</SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start">
              {namespaces.map((item) => (
                <SelectItem key={item} value={item} className="font-mono">
                  --{item}-
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="shrink-0 pl-1 font-mono text-muted-foreground">
            --{namespace}-
          </span>
        )}
        <Input
          autoFocus
          value={name}
          placeholder={t("name")}
          aria-label={t("name")}
          aria-invalid={error ? true : undefined}
          spellCheck={false}
          className="w-32 shrink-0 bg-background font-mono"
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          value={value}
          placeholder={t("value")}
          aria-label={t("value")}
          spellCheck={false}
          className="flex-1 bg-background font-mono"
          onChange={(event) => setValue(event.target.value)}
        />
        <Button
          type="submit"
          size="xs"
          disabled={!name || !value.trim() || !!error}
        >
          {t("add")}
        </Button>
      </div>
      {error && <p className="pl-1 text-destructive">{error}</p>}
    </form>
  )
}

export function TokenTable(props: TokenTableProps) {
  const t = useTranslate()
  const [filter, setFilter] = useState("")
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  /** The palette whose name is being edited. */
  const [renaming, setRenaming] = useState<string | null>(null)
  const { tab, defaults, overrides, onChange, children } = props

  const query = filter.trim().toLowerCase()
  const rows = listTokens(defaults, overrides, tab).filter((row) =>
    row.prop.includes(query)
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b px-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={filter}
            placeholder={t("filter")}
            aria-label={t("filter")}
            className="pl-6.5"
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        {tab === "Color" && (
          <label className="flex shrink-0 items-center gap-1.5">
            {t("darkToggle")}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Switch
                    size="sm"
                    checked={overrides.darkEnabled}
                    onCheckedChange={(checked) =>
                      onChange(setDarkEnabled(overrides, checked))
                    }
                  />
                }
              />
              <TooltipContent side="bottom">{t("darkHint")}</TooltipContent>
            </Tooltip>
          </label>
        )}
        <Button
          variant="outline"
          size="xs"
          aria-expanded={adding}
          onClick={() => setAdding(!adding)}
        >
          <Plus />
          {t("add")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {adding && (
          <AddToken
            tab={tab}
            defaults={defaults}
            overrides={overrides}
            onChange={onChange}
          />
        )}
        {children}
        {rows.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">
            {t("noMatch")}
          </p>
        ) : tab === "Color" ? (
          <div className="flex flex-col">
            {groupColorRows(rows).map((group) => {
              const id = group.name ?? ""
              const changed = group.rows.filter(
                (row) => row.state !== "default"
              ).length
              const label = group.name ?? t("otherColors")
              const palette = group.name
              // Only a palette made entirely of added tokens can be renamed.
              const renameable =
                palette !== null &&
                group.rows.every((row) => row.state === "custom")

              return (
                <Collapsible
                  key={id}
                  // Filtering opens every match; otherwise the user decides.
                  open={query !== "" || open.has(id)}
                  onOpenChange={(next) => {
                    const ids = new Set(open)
                    if (next) {
                      ids.add(id)
                    } else {
                      ids.delete(id)
                    }
                    setOpen(ids)
                  }}
                >
                  <div className="group/row flex min-h-7 items-center gap-1.5">
                    {renameable && renaming === palette ? (
                      <RenameInput
                        prefix="--color-"
                        name={palette}
                        check={(name) =>
                          paletteRenameIssue(overrides, defaults, palette, name)
                        }
                        onRename={(name) => {
                          if (open.has(palette)) {
                            setOpen(new Set(open).add(name))
                          }
                          onChange(
                            renamePalette(overrides, defaults, palette, name)
                          )
                        }}
                        onDone={() => setRenaming(null)}
                        className="flex-1 py-0.5"
                      />
                    ) : (
                      <CollapsibleTrigger className="group/trigger flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                        <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform group-data-panel-open/trigger:rotate-90" />
                        <span className="w-20 shrink-0 truncate font-medium">
                          {label}
                        </span>
                        <span className="flex h-3.5 flex-1 overflow-hidden rounded-sm outline outline-1 -outline-offset-1 outline-foreground/10">
                          {group.rows.map((row) => (
                            <span
                              key={row.prop}
                              className="flex-1"
                              style={{ backgroundColor: row.value }}
                            />
                          ))}
                        </span>
                        <span
                          className={`w-16 shrink-0 text-right tabular-nums ${changed > 0 ? "text-warning" : "text-muted-foreground"}`}
                        >
                          {changed > 0
                            ? t("changedCount", { n: changed })
                            : group.rows.length}
                        </span>
                      </CollapsibleTrigger>
                    )}
                    <span className={`w-12 shrink-0 ${ROW_ACTIONS}`}>
                      {renameable && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title={`${t("rename")}: ${label}`}
                          aria-label={`${t("rename")}: ${label}`}
                          onClick={() => setRenaming(palette)}
                        >
                          <Pencil />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title={`${t("remove")}: ${label}`}
                        aria-label={`${t("remove")}: ${label}`}
                        onClick={() =>
                          onChange(
                            removeTokens(
                              overrides,
                              defaults,
                              group.rows.map((row) => row.prop)
                            ),
                            label
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  </div>
                  <CollapsibleContent>
                    <ul className="flex flex-col pb-1">
                      {group.rows.map((row) => (
                        <Row key={row.prop} row={row} {...props} />
                      ))}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        ) : (
          <ul className="flex flex-col">
            {rows.map((row) => (
              <Row key={row.prop} row={row} {...props} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
