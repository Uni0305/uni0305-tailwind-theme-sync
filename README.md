# Tailwind Theme Sync

A Figma plugin that brings the Tailwind CSS v4 design system into Figma as
variables and styles.

## Development

```bash
bun install
bun run build      # dist/index.html (UI) and dist/code.js (sandbox)
bun run test       # core unit tests
bun run typecheck
bun run lint
```

Load the plugin in the Figma desktop app with **Plugins → Development → Import
plugin from manifest…** and pick `manifest.json`. Rebuild after each change.

## Layout

- `src/core/` — pure TypeScript shared by the UI and the sandbox: theme
  parsing, value conversion, and the Figma spec.
- `src/plugin/` — Figma sandbox code. The only place that calls the Figma API.
- `src/` (`App.tsx`, `ui/`, `components/`) — the plugin UI, built into a single
  HTML file.

The default theme comes from the installed `tailwindcss` package, so bumping
that dependency updates the bundled theme.

## Fonts

The UI bundles two fonts, both licensed under the SIL Open Font License 1.1:

- [Pretendard](https://github.com/orioncactus/pretendard) — Copyright (c) 2021
  Kil Hyung-jin, with Reserved Font Name 'Pretendard'. See
  [licenses/Pretendard-OFL.txt](licenses/Pretendard-OFL.txt).
- [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) — Copyright 2020
  The JetBrains Mono Project Authors. See
  [licenses/JetBrainsMono-OFL.txt](licenses/JetBrainsMono-OFL.txt).
