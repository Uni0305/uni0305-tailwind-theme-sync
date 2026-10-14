import type { PluginMessage, UiMessage } from "@/core/messages"

export function postToPlugin(message: UiMessage) {
  parent.postMessage({ pluginMessage: message }, "*")
}

export function onPluginMessage(handler: (message: PluginMessage) => void) {
  const listener = (event: MessageEvent) => {
    const message = event.data?.pluginMessage as PluginMessage | undefined
    if (message) {
      handler(message)
    }
  }

  window.addEventListener("message", listener)

  return () => window.removeEventListener("message", listener)
}
