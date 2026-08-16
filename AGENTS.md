# AGENTS.md - epub-moe

React + TypeScript + Vite + Tailwind SPA for fine-tuning synchronized text/audio in EPUB3 media overlays (SMIL). Single-page app, no backend.

## Commands

```bash
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # production build to dist/ (passes; typecheck is NOT run)
npm run preview  # serve the production build
npm test         # full gate: lint → build → fixture check/download → Vitest unit tests → Playwright smoke tests
npm run test:unit  # Vitest unit tests for pure utils (smilBuilder, time, epubParser)
npm run lint     # ESLint - works; see notes below
```

- **`npm test` runs the full gate** (`lint`, `build`, `test:fixture`, `test:playwright`). The fixture EPUB is auto-downloaded on the fly, so you don't need to fetch it manually. Use `npm run test:playwright` to run just the smoke tests.
- **`npm run lint` works.** ESLint 9 + `typescript-eslint` 8.x. The `brace-expansion`/`minimatch` overrides in `package.json` exist so ESLint's config matcher doesn't resolve an incompatible dependency — don't remove them or lint breaks.
- **Playwright smoke tests** live in `e2e/smoke.spec.ts` and cover the critical paths: EPUB opens, waveform renders + region mapping, region drag with neighbour snapping, HTML editor open/save/cancel, fragment selection, cut-tool split, split-at-time, timing edits, deletion, apply time offset, force align, and EPUB exports. The export test is the centerpiece: it makes a split + retime + delete, then unzips the downloaded EPUB (JSZip) and verifies all three edits landed in the SMIL, chapter HTML, and OPF. They run against `npm run preview` (production build) via `playwright.config.ts` — build before testing if you changed code. Note: WaveSurfer renders regions in a shadow DOM as `[part~="region"]` and virtualizes them (only visible ones exist), so assert regions by fragment id, not count.
- **No typecheck script.** `tsc --noEmit` is enabled via `tsconfig.app.json` (strict, `noUnusedLocals`, `noUnusedParameters`), but nothing invokes it. To typecheck manually: `npx tsc -b`.
- **Screenshots for visual verification.** `node scripts/screenshot.js /tmp/screenshot.png` opens the app via Playwright, loads the fixture EPUB, and saves a viewport screenshot. Use it when you need to visually verify a UI change — the Read tool can display the resulting PNG.

## Architecture

- `src/hooks/useEPUBEditor.ts` (~750 lines) is the central controller: all EPUB state, all fragment operations (update/delete/split/add/offset/force-align), and `exportEPUB`.
- `src/utils/epubParser.ts` — `EPUBParser` class parses `META-INF/container.xml` → OPF → spine chapters / SMIL fragments / audio blobs into `EPUBData`. Handles nested-directory EPUBs via `calculateBasePath`/`resolvePath`; use these helpers for path math rather than string joins.
- `src/utils/smilBuilder.ts` — `buildSMIL()` regenerates SMIL XML on export.
- `src/types/epub.ts` — `EPUBData`, `SMILFragment`, `AudioFile`, plus structured xml2js tree types (`OPFPackage`, `ContainerXML`, `SMILFile`, `SMILPar`, `OPFManifestItem`).
- `src/App.tsx` composes the 4-panel layout: `ChapterList` (left) / `ContentViewer` (center) / `FragmentEditor` (right) / `WaveformViewer` (bottom, shown only when audio exists).

## Gotchas

- **Export never re-encodes audio.** `exportEPUB` reuses the original zip and only rewrites SMIL, chapter XHTML, and OPF `media:duration` values. Don't build features around decoding/re-encoding audio.
- **Fragment IDs are namespaced** as `${smilId}::${parId}` internally; `smilBuilder` strips the prefix on export. Keep this invariant when adding fragment operations.
- **Dark mode is forced on** in `src/main.tsx` via `document.documentElement.classList.add('dark')`, so Tailwind `dark:` variants are always active. Don't add light-mode styling; don't remove the class.
- `vite.config.ts` sets `define: { global: 'window' }` and aliases `events: 'events'` — browser polyfills for xml2js/jszip. Keep them.
- VBR MP3s cause waveform drift over time (readme documents this); assume CBR audio.
- Undo/redo is implemented with a ~100-step history tracked in `useEPUBEditor` and exposed as Undo/Redo buttons in the top bar. It captures fragment timing changes, splits, deletes, force-align, apply-time-offset, and HTML edits. The oldest entry is dropped when the stack exceeds the limit. Waveform boundary drags are batched into a single history entry while dragging.
- The tool fine-tunes existing media overlays only — it does not auto-sync audio or create overlays from scratch.

## Conventions

- **No code comments** unless required for genuinely complex logic (self-documenting code + types preferred). Existing comments are the exception, not the rule.
- Import ordering: React → third-party → local (`./` or `src/` paths).
- Functional components with hooks; `useCallback`/`useMemo` for handlers and derived data; `useRef` for imperative handles (e.g. `WaveformViewerHandles`).
- Error handling: try/catch async, user-facing message in UI, `console.error` for details.
- **Styling is dark-only.** The `dark` class is still forced in `main.tsx`, but components no longer carry `dark:` variants or light-mode base classes — write new styles dark-first, no `dark:` prefix.
- **Use the shared primitives** in `src/components/ui.tsx` (`Button`, `IconButton`, `PanelHeader`, `SectionLabel`, `FieldLabel`, `TextInput`, `Select`, `ToolbarDivider`, `Modal`) instead of hand-rolling button/input/modal classes.
- **Surface tokens** are defined in `tailwind.config.js`: `base` (app canvas), `panel` (chrome surfaces), `raised` (hover fills/chips on panels), `line` (dividers). Use them (`bg-panel`, `border-line`, ...) rather than raw `gray-*` for surfaces; raw grays are fine for text (`gray-100`/`400`/`500`). Blue-500/600 is the single accent; don't introduce new accent colors. Panel headers are `h-11` everywhere to keep column chrome aligned.

## Docs

- `readme.md` and `CONTRIBUTING.md` contain the product/usage philosophy (personal tool, writer-maintained, PRs welcome but slow). `CONTRIBUTING.md` says to run `npm run lint` before PRs — it now works.
