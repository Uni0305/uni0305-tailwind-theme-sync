# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tailwind Theme Sync: a Figma plugin that turns a Tailwind CSS v4 theme into Figma variables, text styles, and effect styles. The user edits the theme in the plugin UI (or imports a stylesheet), previews the diff against the file, and applies it.

## Commands

The package manager is Bun.

```bash
bun install
bun run build        # tsc -b, then dist/index.html (UI) and dist/code.js (sandbox)
bun run dev          # UI only in a browser; no Figma, so no plugin messages arrive
bun run test         # vitest run
bun run typecheck    # tsc -b across all four tsconfig projects
bun run lint
bun run format       # prettier, with the Tailwind class sorter
```

Single test file or test name:

```bash
bun run test src/core/css/import.test.ts
bun run test -t "reads the default theme"
```

Use `bun run test`, not `bun test`. The latter runs Bun's own runner, which bypasses Vite and cannot resolve `virtual:tailwind-theme`.

To try the plugin, import `manifest.json` in the Figma desktop app (Plugins → Development → Import plugin from manifest…). There is no watch build; run `bun run build` after each change.

## Architecture

Two programs are built from one source tree, and they only talk through `postMessage`:

- **UI** (`src/App.tsx`, `src/ui/`, `src/components/ui/`): React 19 + Tailwind v4 + shadcn (`base-nova` style on Base UI). `vite.config.ts` inlines everything into one `dist/index.html` via `vite-plugin-singlefile`, because Figma loads the UI from a single file.
- **Sandbox** (`src/plugin/`): built by `vite.plugin.config.ts` as an IIFE `dist/code.js` targeting ES2017. It is the only code that touches the `figma` global.
- **Core** (`src/core/`): pure TypeScript imported by both.

`src/core/messages.ts` defines the whole protocol (`UiMessage`, `PluginMessage`, `SyncSummary`). `src/ui/bridge.ts` and `src/plugin/code.ts` are the two ends. A new message type must be added to the union and handled on both sides.

### Data flow

The UI does all the thinking; the sandbox only reconciles.

1. `virtual:tailwind-theme` (a Vite plugin in `vite.config.ts`) exposes the installed `tailwindcss/theme.css` as a string. `src/ui/theme-default.ts` parses it into `defaultTokens`, a `Map` of CSS custom property to value. Bumping the `tailwindcss` dependency changes the bundled defaults.
2. `Overrides` (`src/core/theme/model.ts`) is the only persisted state: everything the user changed relative to the defaults, plus apply settings such as `excludedGroups`. Every edit in the UI goes through `update()` in `App.tsx`, which sends a `save` message. All mutations are pure functions in `model.ts` that return a new `Overrides`.
3. `applyOverrides(defaultTokens, overrides)` gives the effective tokens. `buildFigmaSpec` (`src/core/figma-spec/build.ts`) converts them into a `FigmaSpec`: three variable collections (Color, Typography, Size), text styles, effect styles, and a `skipped` list of tokens whose values could not be converted.
4. `filterSpec` and `retainedKeys` (`figma-spec/select.ts`) narrow the spec by the groups the user unchecked. The UI posts the filtered spec plus the retained keys as `preview` or `apply`.
5. `syncSpec` (`src/plugin/apply.ts`, `styles.ts`) diffs the spec against the document and returns a `SyncSummary`. `preview` and `apply` run the same code with `write` false or true, so the preview counts must be computed without mutating anything.

The CSS tab is a second path into and out of `Overrides`: `core/css/import.ts` reads a pasted v4 stylesheet (`@theme`, `:root`, `.dark`, `var()` chains, `initial` resets), and `core/css/export.ts` writes only what differs from the defaults.

### How the sandbox identifies what it owns

Every variable and style the plugin writes carries plugin data (`src/plugin/keys.ts`):

- `TOKEN_KEY` holds the spec `key` (usually the CSS custom property, e.g. `--color-red-500`; spacing steps use `--spacing*4`, blurs use `--blur-sm@layer` / `@backdrop`, text styles use `text:sans/sm/bold`). Items are matched by this key first, then by name, so renames in the spec carry over.
- `APPLIED_KEY` holds a signature of the values last written. If the current value differs from it, someone edited the item by hand and the item is reported in `overwritten`.
- `VariableSpec.scopes` narrows the fields a Size or Typography variable is offered in (`build.ts`: spacing is `GAP` + `WIDTH_HEIGHT`, radius `CORNER_RADIUS`, and so on; Color has none). Scopes are not part of the `APPLIED_KEY` signature. An existing variable is rescoped, and counted as `updated`, only while it is still on `ALL_SCOPES`, so a scope set by hand survives.

`sweep()` handles items that have a `TOKEN_KEY` but are absent from the spec: keys in `retained` (unchecked groups) are left as `orphans`, everything else is deleted. Items without a `TOKEN_KEY` are never touched. Passing the wrong `retained` set therefore deletes user content.

### Storage

`Overrides` are stored as JSON in `figma.root` plugin data, so everyone editing the file shares them. The UI language lives in `figma.clientStorage`, per user. `parseOverrides` falls back to `EMPTY_OVERRIDES` unless `version === 1`; a change to the shape of `Overrides` needs a migration there.

## Constraints

- `src/core/` is typechecked twice: by `tsconfig.app.json` (DOM, ES2023) and by `tsconfig.plugin.json` (no DOM, `lib: ES2020`, target ES2017). It must stay free of DOM APIs and of anything newer than ES2020, and it must not import from `src/ui/` or use the `@/` alias, which the plugin build does not define. `src/plugin/` and `src/core/` use relative imports; the UI uses `@/`.
- `manifest.json` sets `networkAccess` to `none`. The UI cannot fetch anything at runtime; fonts and assets must be bundled.
- `documentAccess` is `dynamic-page`, so the sandbox uses the async Figma APIs (`getLocalVariablesAsync`, `getLocalTextStylesAsync`, …).
- Colors are converted by `core/convert/color.ts` through an 8-digit hex round-trip, always in sRGB; out-of-range channels are clipped, not gamut-mapped.
- A text style can only be edited while both its current and its next font are loaded, and a style bound to a font variable switches font as soon as the variable changes. `apply.ts` loads the families up front for this reason.
- Adding a Dark mode can throw on plans without multiple modes; that is caught and surfaced as `darkUnavailable`, not treated as an error.
- UI strings go through `src/ui/i18n.tsx`, which has an `en` and a `ko` table. Add every new key to both.

## Conventions

- Prettier: no semicolons, double quotes, 80 columns, `es5` trailing commas.
- Tests sit next to the code as `*.test.ts` and cover `src/core/` only. `src/plugin/` has no tests because it needs the Figma runtime.
- `src/components/ui/` holds shadcn-generated components; add more with the shadcn CLI (`components.json`) and keep app-specific components in `src/ui/`.
