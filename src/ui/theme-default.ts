import themeCss from "virtual:tailwind-theme"

import { parseThemeTokens } from "@/core/css/parse"

export const defaultTokens = parseThemeTokens(themeCss, {
  skipReference: true,
})
