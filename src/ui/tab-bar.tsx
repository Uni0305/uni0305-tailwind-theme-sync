import { Ellipsis, Languages, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Language } from "@/core/messages"
import type { TokenTab } from "@/core/theme/model"
import { useTranslate } from "@/ui/i18n"
import type { MessageKey } from "@/ui/i18n"

export type Tab = TokenTab | "CSS"

const TOKEN_TABS: [TokenTab, MessageKey][] = [
  ["Color", "tabColor"],
  ["Typography", "tabTypography"],
  ["Size", "tabSize"],
  ["Effects", "tabEffects"],
]

// The underline sits on the bar's bottom border instead of below the list.
const TAB_CLASS =
  "h-full flex-none rounded-none px-2 after:-bottom-px! after:bg-primary!"

type TabBarProps = {
  language: Language
  canReset: boolean
  onSwitchLanguage: () => void
  onReset: () => void
}

/** Token tabs on the left, CSS in and out set apart, file info and menu last. */
export function TabBar({
  language,
  canReset,
  onSwitchLanguage,
  onReset,
}: TabBarProps) {
  const t = useTranslate()

  return (
    <header className="flex h-8 shrink-0 items-center gap-2 border-b px-1">
      <TabsList variant="line" className="h-full gap-0 p-0">
        {TOKEN_TABS.map(([id, label]) => (
          <TabsTrigger key={id} value={id} className={TAB_CLASS}>
            {t(label)}
          </TabsTrigger>
        ))}
        <span role="presentation" className="mx-1.5 h-3.5 w-px bg-border" />
        <TabsTrigger value="CSS" className={TAB_CLASS}>
          {t("tabCss")}
        </TabsTrigger>
      </TabsList>
      <div className="ml-auto flex items-center gap-1.5 pr-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-xs" aria-label={t("menu")} />
            }
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-40">
            <DropdownMenuItem onClick={onSwitchLanguage}>
              <Languages />
              {language === "en" ? "한국어" : "English"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={!canReset}
              onClick={onReset}
            >
              <RotateCcw />
              {t("resetTheme")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
