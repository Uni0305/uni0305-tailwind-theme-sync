import { ChevronRight } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { SyncSummary } from "@/core/messages"
import { useTranslate } from "@/ui/i18n"

function NameList({
  title,
  hint,
  names,
}: {
  title: string
  hint: string
  names: string[]
}) {
  if (names.length === 0) {
    return null
  }

  return (
    <Collapsible className="rounded-md border">
      <CollapsibleTrigger className="group/trigger flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <ChevronRight className="mt-0.5 size-3 shrink-0 text-muted-foreground transition-transform group-data-panel-open/trigger:rotate-90" />
        <span className="min-w-0">
          <span className="font-medium">
            {title}{" "}
            <span className="font-normal text-muted-foreground tabular-nums">
              {names.length}
            </span>
          </span>
          <span className="block text-muted-foreground">{hint}</span>
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="max-h-40 overflow-y-auto border-t py-1.5 pr-2 pl-6.5 font-mono">
          {names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function SummaryView({
  summary,
  applied,
  unconverted,
}: {
  summary: SyncSummary
  applied: boolean
  /** Tokens the spec could not convert, by CSS custom property. */
  unconverted: string[]
}) {
  const t = useTranslate()
  const counts = [
    [applied ? t("created") : t("toCreate"), summary.created, "text-success"],
    [applied ? t("updated") : t("toUpdate"), summary.updated, "text-warning"],
    [
      applied ? t("deleted") : t("toDelete"),
      summary.deleted.length,
      "text-destructive",
    ],
    [t("unchanged"), summary.unchanged, ""],
  ] as const

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-4 gap-2">
        {counts.map(([label, value, tone]) => (
          <div key={label} className="rounded-md border px-2 py-1.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd
              className={`text-lg font-medium tabular-nums ${value > 0 ? tone : "text-muted-foreground"}`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {summary.darkUnavailable && (
        <p className="rounded-md border border-warning/40 px-2 py-1.5 text-warning">
          {t("darkUnavailable")}
        </p>
      )}
      <NameList
        title={applied ? t("overwritten") : t("willOverwrite")}
        hint={t("overwrittenHint")}
        names={summary.overwritten}
      />
      <NameList
        title={applied ? t("deleted") : t("toDelete")}
        hint={t("deletedHint")}
        names={summary.deleted}
      />
      <NameList
        title={t("orphans")}
        hint={t("orphansHint")}
        names={summary.orphans}
      />
      <NameList
        title={t("skipped")}
        hint={t("skippedHint")}
        names={summary.skipped}
      />
      <NameList
        title={t("unconverted")}
        hint={t("unconvertedHint")}
        names={unconverted}
      />
    </div>
  )
}
