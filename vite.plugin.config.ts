import { defineConfig } from "vite"

// Builds the Figma sandbox entry. The UI is built by vite.config.ts.
export default defineConfig({
  build: {
    target: "es2017",
    emptyOutDir: false,
    lib: {
      entry: "src/plugin/code.ts",
      formats: ["iife"],
      name: "plugin",
      fileName: () => "code.js",
    },
  },
})
