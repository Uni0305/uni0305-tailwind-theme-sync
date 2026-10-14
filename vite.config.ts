import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import type { Plugin } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

const THEME_MODULE = "virtual:tailwind-theme"

// Exposes Tailwind's default theme source as a string. A plain `?raw` import
// is rewritten by the CSS pipeline, so the file is read directly instead.
function tailwindTheme(): Plugin {
  const require = createRequire(import.meta.url)

  return {
    name: "tailwind-theme",
    resolveId(id) {
      return id === THEME_MODULE ? `\0${THEME_MODULE}` : null
    },
    load(id) {
      if (id !== `\0${THEME_MODULE}`) {
        return null
      }

      const css = readFileSync(require.resolve("tailwindcss/theme.css"), "utf8")
      return `export default ${JSON.stringify(css)}`
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), tailwindTheme(), viteSingleFile()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
})
