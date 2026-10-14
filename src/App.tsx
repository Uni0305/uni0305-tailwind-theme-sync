import { useEffect, useMemo, useState } from "react"

import { Tabs, TabsContent } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { exportCss } from "@/core/css/export"
import { buildFigmaSpec } from "@/core/figma-spec/build"
import { filterSpec, listGroups, retainedKeys } from "@/core/figma-spec/select"
import type { Language } from "@/core/messages"
import {
  applyOverrides,
  EMPTY_OVERRIDES,
  hasThemeChanges,
  parseOverrides,
} from "@/core/theme/model"
import type { Overrides } from "@/core/theme/model"
import { ApplyBar } from "@/ui/apply-bar"
import { onPluginMessage, postToPlugin } from "@/ui/bridge"
import { ConfirmDialog } from "@/ui/confirm-dialog"
import { CssPanel } from "@/ui/css-panels"
import { FontSlots } from "@/ui/font-slots"
import { createTranslate, detectLanguage, TranslateContext } from "@/ui/i18n"
import type { MessageKey } from "@/ui/i18n"
import { ReviewView } from "@/ui/review-view"
import type { Phase } from "@/ui/review-view"
import { TabBar } from "@/ui/tab-bar"
import type { Tab } from "@/ui/tab-bar"
import { countThemeChanges } from "@/ui/theme-changes"
import { defaultTokens } from "@/ui/theme-default"
import { createTokenPreview } from "@/ui/token-preview"
import { TokenTable } from "@/ui/token-table"

/** How long a removal can be taken back from the apply bar. */
const UNDO_MS = 6000

type Undo = { previous: Overrides; label: string }

export function App() {
  const [overrides, setOverrides] = useState<Overrides>(EMPTY_OVERRIDES)
  const [language, setLanguage] = useState<Language>(detectLanguage)
  const [families, setFamilies] = useState<ReadonlySet<string>>(new Set())
  const [tab, setTab] = useState<Tab>("Color")
  const [phase, setPhase] = useState<Phase>({ kind: "select" })
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [undo, setUndo] = useState<Undo | null>(null)

  useEffect(() => {
    const unsubscribe = onPluginMessage((message) => {
      if (message.type === "init") {
        setOverrides(parseOverrides(message.overrides))
        if (message.language) {
          setLanguage(message.language)
        }
      }
      if (message.type === "fonts") {
        setFamilies(new Set(message.families))
      }
      if (message.type === "preview") {
        setPhase({ kind: "review", summary: message.summary })
      }
      if (message.type === "applied") {
        setPhase({ kind: "applied", summary: message.summary })
      }
      if (message.type === "error") {
        setError(message.message)
        setPhase({ kind: "select" })
      }
    })
    postToPlugin({ type: "ready" })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!undo) {
      return
    }
    const timer = setTimeout(() => setUndo(null), UNDO_MS)

    return () => clearTimeout(timer)
  }, [undo])

  const t = useMemo(() => createTranslate(language), [language])
  const tokens = useMemo(
    () => applyOverrides(defaultTokens, overrides),
    [overrides]
  )
  const spec = useMemo(
    () =>
      buildFigmaSpec(tokens, {
        fontFamilies: overrides.fontFamilies,
        textStyleSlots: overrides.textStyleSlots,
        dark: overrides.darkEnabled ? overrides.dark : undefined,
      }),
    [tokens, overrides]
  )
  const css = useMemo(() => exportCss(defaultTokens, overrides), [overrides])
  const preview = useMemo(() => createTokenPreview(spec), [spec])
  const groups = useMemo(() => listGroups(spec), [spec])
  const excluded = useMemo(
    () => new Set(overrides.excludedGroups),
    [overrides.excludedGroups]
  )
  const selected = useMemo(() => filterSpec(spec, excluded), [spec, excluded])
  const swatches = useMemo(() => {
    const colors = new Map<string, string[]>()
    const palette = spec.collections.find((c) => c.name === "Color")
    for (const variable of palette?.variables ?? []) {
      const segments = variable.name.split("/")
      const id = `Color/${segments.length > 1 ? segments[0] : "other"}`
      const css = tokens.get(variable.key)
      if (css) {
        colors.set(id, [...(colors.get(id) ?? []), css])
      }
    }

    return colors
  }, [spec, tokens])

  const selectedCount = groups
    .filter((group) => !excluded.has(group.id))
    .reduce((sum, group) => sum + group.count, 0)

  /** `removed` names what a deletion took out; it can be undone for a while. */
  function update(next: Overrides, removed?: string) {
    setUndo(removed ? { previous: overrides, label: removed } : null)
    setOverrides(next)
    setError(null)
    setPhase({ kind: "select" })
    postToPlugin({ type: "save", overrides: next })
  }

  function toggle(ids: string[], included: boolean) {
    const next = new Set(excluded)
    for (const id of ids) {
      if (included) {
        next.delete(id)
      } else {
        next.add(id)
      }
    }
    update({ ...overrides, excludedGroups: [...next] })
  }

  function send(type: "preview" | "apply", label: MessageKey) {
    setError(null)
    setPhase({
      kind: "working",
      label,
      summary: phase.kind === "review" ? phase.summary : undefined,
    })
    postToPlugin({
      type,
      spec: selected,
      retained: retainedKeys(spec, excluded),
    })
  }

  function switchLanguage() {
    const next = language === "en" ? "ko" : "en"
    setLanguage(next)
    postToPlugin({ type: "language", language: next })
  }

  function closeReview() {
    setReviewing(false)
    setPhase({ kind: "select" })
  }

  return (
    <TranslateContext value={t}>
      <TooltipProvider delay={300}>
        <div className="flex h-svh flex-col">
          {reviewing ? (
            <ReviewView
              phase={phase}
              groups={groups}
              excluded={excluded}
              swatches={swatches}
              unconverted={spec.skipped}
              onToggle={toggle}
              onClose={closeReview}
            />
          ) : (
            <Tabs
              value={tab}
              className="min-h-0 flex-1 gap-0"
              onValueChange={(value) => setTab(value as Tab)}
            >
              <TabBar
                language={language}
                canReset={hasThemeChanges(overrides)}
                onSwitchLanguage={switchLanguage}
                onReset={() => setResetting(true)}
              />
              <TabsContent
                key={tab}
                value={tab}
                className="flex min-h-0 flex-col"
              >
                {tab === "CSS" ? (
                  <CssPanel
                    css={css}
                    defaults={defaultTokens}
                    overrides={overrides}
                    families={families}
                    onChange={update}
                  />
                ) : (
                  <TokenTable
                    tab={tab}
                    defaults={defaultTokens}
                    overrides={overrides}
                    preview={preview}
                    onChange={update}
                  >
                    {tab === "Typography" && (
                      <FontSlots
                        defaults={defaultTokens}
                        overrides={overrides}
                        families={families}
                        onChange={update}
                      />
                    )}
                  </TokenTable>
                )}
              </TabsContent>
            </Tabs>
          )}
          <ApplyBar
            reviewing={reviewing}
            phase={phase}
            changed={countThemeChanges(overrides)}
            selected={selectedCount}
            error={error}
            removed={undo?.label ?? null}
            onUndo={() => undo && update(undo.previous)}
            onReview={() => {
              setPhase({ kind: "select" })
              setReviewing(true)
            }}
            onCompare={() => send("preview", "comparing")}
            onBack={() => setPhase({ kind: "select" })}
            onApply={() => send("apply", "applying")}
            onDone={closeReview}
          />
          <ConfirmDialog
            open={resetting}
            title={t("resetTheme")}
            description={t("resetConfirm")}
            confirmLabel={t("resetYes")}
            onOpenChange={setResetting}
            onConfirm={() => update(EMPTY_OVERRIDES)}
          />
        </div>
      </TooltipProvider>
    </TranslateContext>
  )
}

export default App
