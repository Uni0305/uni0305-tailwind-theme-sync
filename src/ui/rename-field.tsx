import { Pencil } from "lucide-react"
import { useState } from "react"

import type { RenameIssue } from "@/core/theme/model"
import { cn } from "@/lib/utils"
import { useTranslate } from "@/ui/i18n"

type RenameInputProps = {
  /** The fixed part in front of the name, e.g. `--color-`. */
  prefix: string
  name: string
  check: (name: string) => RenameIssue | null
  onRename: (name: string) => void
  /** Called once editing ends, whether or not the name changed. */
  onDone: () => void
  className?: string
}

/**
 * Edits a name in place. Enter or leaving the field commits a valid name,
 * Escape gives up; an invalid name is never committed.
 */
export function RenameInput({
  prefix,
  name,
  check,
  onRename,
  onDone,
  className,
}: RenameInputProps) {
  const t = useTranslate()
  const [draft, setDraft] = useState(name)
  const issue = draft === name ? null : check(draft)
  const error =
    issue === "taken"
      ? t("duplicateName")
      : issue === "invalid"
        ? t("invalidName")
        : null

  function finish(commit: boolean) {
    if (commit && !issue && draft !== name) {
      onRename(draft)
    }
    onDone()
  }

  return (
    <span className={cn("flex min-w-0 flex-col", className)}>
      <span className="flex h-6 min-w-0 items-center rounded-md border border-input px-1.5 font-mono transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive dark:bg-input/30">
        <span className="shrink-0 text-muted-foreground">{prefix}</span>
        <input
          autoFocus
          value={draft}
          aria-label={`${t("rename")}: ${prefix}${name}`}
          aria-invalid={error ? true : undefined}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent outline-none"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !issue) {
              finish(true)
            }
            if (event.key === "Escape") {
              event.stopPropagation()
              finish(false)
            }
          }}
        />
      </span>
      {error && <span className="text-destructive">{error}</span>}
    </span>
  )
}

/** A name that turns into a `RenameInput` when clicked. */
export function RenameField({
  prefix,
  name,
  check,
  onRename,
  className,
}: Omit<RenameInputProps, "onDone">) {
  const t = useTranslate()
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <RenameInput
        prefix={prefix}
        name={name}
        check={check}
        onRename={onRename}
        onDone={() => setEditing(false)}
        className={className}
      />
    )
  }

  return (
    <button
      type="button"
      title={`${t("rename")}: ${prefix}${name}`}
      className={cn(
        "group/rename flex h-6 min-w-0 items-center gap-1 rounded-md text-left font-mono outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
      onClick={() => setEditing(true)}
    >
      <span className="truncate">
        {prefix}
        {name}
      </span>
      <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/rename:opacity-100 group-focus-visible/rename:opacity-100" />
    </button>
  )
}
