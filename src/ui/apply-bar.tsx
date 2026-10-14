import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTranslate } from "@/ui/i18n"
import type { Phase } from "@/ui/review-view"

type ApplyBarProps = {
  /** Whether the review view is open; the editor shows theme counts instead. */
  reviewing: boolean
  phase: Phase
  /** Theme entries that differ from Tailwind's defaults. */
  changed: number
  /** Variables and styles checked for this apply. */
  selected: number
  error: string | null
  /** Name of what was just removed, while undo is still on offer. */
  removed: string | null
  onUndo: () => void
  onReview: () => void
  onCompare: () => void
  onBack: () => void
  onApply: () => void
  onDone: () => void
}

/** Always-visible footer: where the theme stands and the next sync step. */
export function ApplyBar({
  reviewing,
  phase,
  changed,
  selected,
  error,
  removed,
  onUndo,
  onReview,
  onCompare,
  onBack,
  onApply,
  onDone,
}: ApplyBarProps) {
  const t = useTranslate()
  const busy = phase.kind === "working"
  const compared = phase.kind !== "select" && phase.summary !== undefined

  return (
    <footer className="flex h-11 shrink-0 items-center justify-between gap-3 border-t px-3">
      <p
        className="flex min-w-0 items-center gap-1.5 text-muted-foreground"
        role="status"
      >
        {error ? (
          <span className="truncate text-destructive">{error}</span>
        ) : !reviewing ? (
          removed ? (
            <>
              <span className="truncate">
                {t("removedNote", { name: removed })}
              </span>
              <Button
                variant="link"
                size="xs"
                className="px-0"
                onClick={onUndo}
              >
                {t("undo")}
              </Button>
            </>
          ) : (
            <span className="truncate tabular-nums">
              <span className={changed > 0 ? "text-foreground" : undefined}>
                {changed > 0
                  ? t("changedCount", { n: changed })
                  : t("defaultTheme")}
              </span>
              {" · "}
              {t("selectedShort", { n: selected })}
            </span>
          )
        ) : (
          <span className="truncate tabular-nums">
            {phase.kind === "working"
              ? t(phase.label)
              : phase.kind === "applied"
                ? t("appliedNote")
                : phase.kind === "review"
                  ? t("notChangedYet")
                  : t("selected", { n: selected })}
          </span>
        )}
      </p>
      <div className="flex shrink-0 gap-2">
        {!reviewing ? (
          <Button size="sm" disabled={selected === 0} onClick={onReview}>
            {t("review")}
            <ArrowRight />
          </Button>
        ) : phase.kind === "applied" ? (
          <Button size="sm" onClick={onDone}>
            {t("done")}
          </Button>
        ) : compared ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onBack}
            >
              {t("back")}
            </Button>
            <Button size="sm" disabled={busy} onClick={onApply}>
              {t("apply")}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            disabled={busy || selected === 0}
            onClick={onCompare}
          >
            {t("compare")}
          </Button>
        )}
      </div>
    </footer>
  )
}
