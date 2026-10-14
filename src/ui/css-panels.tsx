import { Check, Copy } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { applyImport, importCss } from "@/core/css/import"
import type { ThemeTokens } from "@/core/css/parse"
import type { Overrides } from "@/core/theme/model"
import { CodeEditor } from "@/ui/code-editor"
import { ConfirmDialog } from "@/ui/confirm-dialog"
import { useTranslate } from "@/ui/i18n"

type CssPanelProps = {
  /** The current overrides as CSS; empty when the theme is the default. */
  css: string
  defaults: ThemeTokens
  overrides: Overrides
  families: ReadonlySet<string>
  onChange: (overrides: Overrides) => void
}

type Mode = "import" | "export"

type Notice = { tone: "info" | "error"; lines: string[] }

function copyText(text: string) {
  // The async clipboard API is blocked inside Figma's plugin iframe, so copy
  // from a temporary selection instead.
  const field = document.createElement("textarea")
  field.value = text
  field.style.position = "fixed"
  field.style.opacity = "0"
  document.body.appendChild(field)
  field.select()
  document.execCommand("copy")
  field.remove()
}

/** The theme as CSS: paste a stylesheet in, or copy the overrides out. */
export function CssPanel({
  css,
  defaults,
  overrides,
  families,
  onChange,
}: CssPanelProps) {
  const t = useTranslate()
  const [mode, setMode] = useState<Mode>("import")
  const [source, setSource] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [copied, setCopied] = useState(false)
  const hasChanges = css !== ""

  function runImport(kind: "replace" | "merge") {
    try {
      const result = importCss(source, defaults)
      const next = applyImport(overrides, result, families, kind)
      const missingFonts = [
        ...new Set(
          Object.keys(result.fonts)
            .map((slot) => next.fontFamilies[slot])
            .filter((family) => families.size > 0 && !families.has(family))
        ),
      ]
      const lines = [
        t("importDone", {
          values: Object.keys(result.values).length,
          removed: result.removed.length,
          dark: Object.keys(result.dark).length,
        }),
      ]
      if (result.unresolved.length > 0) {
        lines.push(
          t("importUnresolved", { names: result.unresolved.join(", ") })
        )
      }
      if (missingFonts.length > 0) {
        lines.push(t("importFonts", { names: missingFonts.join(", ") }))
      }

      onChange(next)
      setSource("")
      setNotice({ tone: "info", lines })
    } catch (error) {
      setNotice({
        tone: "error",
        lines: [error instanceof Error ? error.message : String(error)],
      })
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <ToggleGroup
          value={[mode]}
          variant="outline"
          size="sm"
          spacing={0}
          onValueChange={(value) => {
            const next = value[0] as Mode | undefined
            if (next) {
              setMode(next)
            }
          }}
        >
          <ToggleGroupItem value="import" className="h-6 px-2.5">
            {t("importTitle")}
          </ToggleGroupItem>
          <ToggleGroupItem value="export" className="h-6 px-2.5">
            {t("exportTitle")}
          </ToggleGroupItem>
        </ToggleGroup>
        {mode === "export" && (
          <Button
            size="xs"
            variant="outline"
            disabled={!hasChanges}
            onClick={() => {
              copyText(css)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? t("copied") : t("copy")}
          </Button>
        )}
      </div>
      {mode === "import" ? (
        <>
          <p className="text-muted-foreground">{t("importHint")}</p>
          <CodeEditor
            value={source}
            label={t("importTitle")}
            placeholder={t("importPlaceholder")}
            onChange={setSource}
          />
          <div className="flex items-start justify-between gap-3">
            <ul
              role="status"
              className={`flex min-w-0 flex-col gap-0.5 ${notice?.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
            >
              {notice?.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="flex shrink-0 gap-2">
              <Button
                size="xs"
                variant="outline"
                disabled={!source.trim()}
                onClick={() => runImport("merge")}
              >
                {t("importMerge")}
              </Button>
              <Button
                size="xs"
                disabled={!source.trim()}
                onClick={() =>
                  hasChanges ? setConfirming(true) : runImport("replace")
                }
              >
                {t("importReplace")}
              </Button>
            </div>
          </div>
          <ConfirmDialog
            open={confirming}
            title={t("importReplace")}
            description={t("importConfirm")}
            confirmLabel={t("importConfirmYes")}
            onOpenChange={setConfirming}
            onConfirm={() => runImport("replace")}
          />
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            {hasChanges ? t("exportHint") : t("exportEmpty")}
          </p>
          {hasChanges && <CodeEditor value={css} label={t("exportTitle")} />}
        </>
      )}
    </section>
  )
}
