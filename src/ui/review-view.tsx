import { ArrowLeft, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { SpecGroup } from "@/core/figma-spec/select"
import type { SyncSummary } from "@/core/messages"
import { GroupList } from "@/ui/group-list"
import { useTranslate } from "@/ui/i18n"
import type { MessageKey } from "@/ui/i18n"
import { SummaryView } from "@/ui/summary-view"

export type Phase =
  | { kind: "select" }
  /** Carries the summary while applying, so the comparison stays on screen. */
  | { kind: "working"; label: MessageKey; summary?: SyncSummary }
  | { kind: "review"; summary: SyncSummary }
  | { kind: "applied"; summary: SyncSummary }

const STEPS: MessageKey[] = ["stepScope", "stepCompare", "done"]

type ReviewViewProps = {
  phase: Phase
  groups: SpecGroup[]
  excluded: ReadonlySet<string>
  swatches: ReadonlyMap<string, string[]>
  /** Tokens the spec could not convert, by CSS custom property. */
  unconverted: string[]
  onToggle: (ids: string[], included: boolean) => void
  onClose: () => void
}

/** Scope, comparison and result of an apply, in place of the editor. */
export function ReviewView({
  phase,
  groups,
  excluded,
  swatches,
  unconverted,
  onToggle,
  onClose,
}: ReviewViewProps) {
  const t = useTranslate()
  const busy = phase.kind === "working"
  const summary = phase.kind === "select" ? undefined : phase.summary
  const step = phase.kind === "applied" ? 2 : summary ? 1 : 0

  return (
    <>
      <header className="flex h-8 shrink-0 items-center gap-2 border-b px-1">
        <Button variant="ghost" size="xs" disabled={busy} onClick={onClose}>
          <ArrowLeft />
          {t("backToEdit")}
        </Button>
        <ol className="ml-auto flex items-center gap-3 pr-2">
          {STEPS.map((key, index) => (
            <li
              key={key}
              aria-current={index === step ? "step" : undefined}
              className="flex items-center gap-1.5 text-muted-foreground aria-[current=step]:font-medium aria-[current=step]:text-foreground"
            >
              <span
                className={`flex size-4 items-center justify-center rounded-full border tabular-nums ${
                  index === step
                    ? "border-primary bg-primary text-primary-foreground"
                    : index < step
                      ? "border-transparent bg-muted"
                      : ""
                }`}
              >
                {index < step ? <Check className="size-3" /> : index + 1}
              </span>
              {t(key)}
            </li>
          ))}
        </ol>
      </header>
      <main
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        aria-busy={busy}
      >
        {summary ? (
          <SummaryView
            summary={summary}
            applied={phase.kind === "applied"}
            unconverted={unconverted}
          />
        ) : (
          <GroupList
            groups={groups}
            excluded={excluded}
            swatches={swatches}
            disabled={busy}
            onToggle={onToggle}
          />
        )}
      </main>
    </>
  )
}
