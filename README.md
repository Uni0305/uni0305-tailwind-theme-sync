# Tailwind Theme Sync

Turn a Tailwind CSS v4 theme into Figma variables, text styles, and effect
styles.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Figma plugin](https://img.shields.io/badge/Figma-plugin-F24E1E?logo=figma&logoColor=white)
![Tailwind CSS v4](https://img.shields.io/badge/Tailwind%20CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)

Edit the theme in the plugin, or paste a stylesheet. Preview what would change in
your file, then apply it. Running it again updates what it created instead of
duplicating it.

## Features

- **Tailwind defaults built in.** The starting theme is read from the installed
  `tailwindcss` package, so it follows the version in `package.json`.
- **Variables and styles.** Writes three variable collections (Color,
  Typography, Size), text styles, and effect styles for shadows and blurs.
- **Dark values.** Colors can carry a Dark value, written as a second mode.
  Colors are converted to the document's profile (sRGB or Display P3).
- **CSS in and out.** Imports `@theme`, `:root`, and `.dark` blocks, follows
  `var()` chains, and honors `initial` resets. Exports only what differs from
  Tailwind's defaults.
- **Review before applying.** Shows what will be created, updated, deleted, or
  overwritten. Items edited by hand in Figma since the last apply are flagged.
- **Apply by group.** Uncheck a group, such as `red` colors, and its variables
  and styles stay untouched in the file.
- **Shared theme.** The theme is saved in the Figma file, so everyone editing it
  sees the same one. The UI is available in English and Korean.

## Getting started

The plugin is not published to the Figma Community, so you build it and import it
in development mode.

You need the [Figma desktop app](https://www.figma.com/downloads/) and
[Bun](https://bun.sh).

```bash
git clone https://github.com/Uni0305/uni0305-tailwind-theme-sync.git
cd uni0305-tailwind-theme-sync
bun install
bun run build
```

Then in Figma, choose **Plugins → Development → Import plugin from manifest…**
and select `manifest.json`.

> [!NOTE]
> There is no watch build. Run `bun run build` again after each change.

## Usage

1. Open **Plugins → Development → Tailwind Theme Sync**.
2. Edit tokens in the Color, Typography, Size, and Effects tabs. Or paste a
   Tailwind v4 stylesheet in the CSS tab and choose **Replace theme** or
   **Merge into theme**.
3. Pick a font family for each font slot in Typography. Text styles need a family
   that is available in Figma.
4. Choose the groups to apply, then **Compare**.
5. Review the changes and press **Apply**. One undo in Figma reverts the whole
   apply.

> [!TIP]
> The CSS tab also exports your theme. The output contains only your changes, so
> paste it after `@import "tailwindcss"` in your stylesheet.

## How it works

The plugin is two programs that talk through `postMessage`. The UI does the
thinking: it applies your changes to the default theme and converts the result
into a spec of Figma variables and styles. The sandbox, which is the only code
that touches the `figma` global, compares that spec with the document and writes
the difference.

```text
theme + your changes  →  Figma spec  →  sandbox diff  →  variables and styles
        (UI)               (UI)           (preview)            (apply)
```

Every variable and style the plugin writes is tagged with the token it came from.
That tag is how it finds its own items on later runs. Items without a tag are
never touched.

> [!WARNING]
> A token that is no longer in the theme has its variable or style deleted on the
> next apply, and layers bound to it lose the binding. Uncheck its group to keep
> it in the file.

## Development

| Command             | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `bun run build`     | Type-checks, then builds `dist/index.html` and `dist/code.js` |
| `bun run dev`       | Serves the UI in a browser, without Figma                     |
| `bun run test`      | Runs the unit tests with Vitest                               |
| `bun run typecheck` | Type-checks all four tsconfig projects                        |
| `bun run lint`      | Runs ESLint                                                   |
| `bun run format`    | Formats with Prettier                                         |

> [!IMPORTANT]
> Use `bun run test`, not `bun test`. Bun's own runner bypasses Vite and cannot
> resolve the bundled Tailwind theme.

```text
src/core/    Pure TypeScript shared by both sides: parsing, conversion, Figma spec
src/plugin/  Sandbox code, the only place that calls the Figma API
src/ui/      Plugin UI (React 19, Tailwind v4, shadcn on Base UI)
```

See [CLAUDE.md](CLAUDE.md) for the architecture notes and constraints.

## Credits

The UI bundles two fonts, both licensed under the SIL Open Font License 1.1:

- [Pretendard](https://github.com/orioncactus/pretendard) — Copyright (c) 2021
  Kil Hyung-jin, with Reserved Font Name 'Pretendard'. See
  [licenses/Pretendard-OFL.txt](licenses/Pretendard-OFL.txt).
- [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) — Copyright 2020
  The JetBrains Mono Project Authors. See
  [licenses/JetBrainsMono-OFL.txt](licenses/JetBrainsMono-OFL.txt).
