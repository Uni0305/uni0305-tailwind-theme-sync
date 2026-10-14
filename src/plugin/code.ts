import type { PluginMessage, UiMessage } from "../core/messages"
import { syncSpec } from "./apply"
import {
  loadLanguage,
  loadOverrides,
  saveLanguage,
  saveOverrides,
} from "./storage"

function post(message: PluginMessage) {
  figma.ui.postMessage(message)
}

function openUi() {
  figma.showUI(__html__, { width: 640, height: 720, themeColors: true })

  figma.ui.onmessage = async (message: UiMessage) => {
    try {
      if (message.type === "ready") {
        const profile = figma.root.documentColorProfile
        post({
          type: "init",
          colorProfile: profile === "DISPLAY_P3" ? "DISPLAY_P3" : "SRGB",
          overrides: loadOverrides(),
          language: await loadLanguage(),
        })

        const fonts = await figma.listAvailableFontsAsync()
        const families = new Set(fonts.map((font) => font.fontName.family))
        post({ type: "fonts", families: [...families].sort() })
      }

      if (message.type === "save") {
        saveOverrides(message.overrides)
      }

      if (message.type === "language") {
        await saveLanguage(message.language)
      }

      if (message.type === "preview") {
        post({
          type: "preview",
          summary: await syncSpec(message.spec, message.retained, false),
        })
      }

      if (message.type === "apply") {
        post({
          type: "applied",
          summary: await syncSpec(message.spec, message.retained, true),
        })
      }
    } catch (error) {
      post({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

openUi()
