# AGENTS.md - epub-moe

React + TypeScript + Vite + Tailwind SPA for fine-tuning synchronized text/audio in EPUB3 media overlays (SMIL). Single-page app, no backend, no tests.

## Commands

```bash
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # production build to dist/ (passes; typecheck is NOT run)
npm run preview  # serve the production build
npm run lint     # BROKEN - see below
```

- **`npm run lint` fails** with `TypeError: ... '@typescript-eslint/no-unused-expressions': Cannot read properties of undefined (reading 'allowShortCircuit')` — ESLint 9.x is incompatible with the pinned typescript-eslint 8.3.0. Do not attempt to "fix" lint errors by editing source; it fails at config load. The real verification is `npm run build`.
- **No tests** exist and **no test runner is configured** (no vitest in package.json, no `vitest.config.*`, no `.vscode/`). Do not add a test script or config without checking with the user first.
- **No typecheck script.** `tsc --noEmit` is enabled via `tsconfig.app.json` (strict, `noUnusedLocals`, `noUnusedParameters`), but nothing invokes it. To typecheck manually: `npx tsc -b`.

## Architecture

- `src/hooks/useEPUBEditor.ts` (773 lines) is the central controller: all EPUB state, all fragment operations (update/delete/split/add/offset/force-align), and `exportEPUB`.
- `src/utils/epubParser.ts` — `EPUBParser` class parses `META-INF/container.xml` → OPF → spine chapters / SMIL fragments / audio blobs into `EPUBData`. Handles nested-directory EPUBs via `calculateBasePath`/`resolvePath`; use these helpers for path math rather than string joins.
- `src/utils/smilBuilder.ts` — `buildSMIL()` regenerates SMIL XML on export.
- `src/types/epub.ts` — `EPUBData`, `SMILFragment`, `AudioFile`. Note `EPUBData.manifest` and most parser outputs are typed `any` (raw xml2js trees) — that loose typing is intentional; keep it when extending.
- `src/App.tsx` composes the 4-panel layout: `ChapterList` (left) / `ContentViewer` (center) / `FragmentEditor` (right) / `WaveformViewer` (bottom, shown only when audio exists).

## Gotchas

- **Export never re-encodes audio.** `exportEPUB` reuses the original zip and only rewrites SMIL, chapter XHTML, and OPF `media:duration` values. Don't build features around decoding/re-encoding audio.
- **Fragment IDs are namespaced** as `${smilId}::${parId}` internally; `smilBuilder` strips the prefix on export. Keep this invariant when adding fragment operations.
- **Dark mode is forced on** in `src/main.tsx` via `document.documentElement.classList.add('dark')`, so Tailwind `dark:` variants are always active. Don't add light-mode styling; don't remove the class.
- `vite.config.ts` sets `define: { global: 'window' }` and aliases `events: 'events'` — browser polyfills for xml2js/jszip. Keep them.
- VBR MP3s cause waveform drift over time (readme documents this); assume CBR audio.
- Known limitation: no undo. UI work shouldn't assume one exists.
- The tool fine-tunes existing media overlays only — it does not auto-sync audio or create overlays from scratch.

## Conventions

- **No code comments** unless required for genuinely complex logic (self-documenting code + types preferred). Existing comments are the exception, not the rule.
- Import ordering: React → third-party → local (`./` or `src/` paths).
- Functional components with hooks; `useCallback`/`useMemo` for handlers and derived data; `useRef` for imperative handles (e.g. `WaveformViewerHandles`).
- Error handling: try/catch async, user-facing message in UI, `console.error` for details.

## Docs

- `readme.md` and `CONTRIBUTING.md` contain the product/usage philosophy (personal tool, writer-maintained, PRs welcome but slow). `CONTRIBUTING.md` says to run `npm run lint` before PRs — know it's currently broken.
