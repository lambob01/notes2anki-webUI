# Polished Black UI — Implementation Plan

> **For agentic workers:** Execute inline in order. Every task ends with a
> typechecked frontend build or a passing backend test. Do not commit unless
> the user explicitly asks.

**Goal:** Ship a polished, monochrome near-black UI with keyboard/command-driven
workflows, searchable history, replayable generations, and a restructured
settings area.

**Architecture:** Semantic design tokens feed small UI primitives and a new app
shell. Existing pages are refactored in place onto those primitives; shared
queries cover active runs, history, and dashboard stats. One backend endpoint
adds exact generation replay.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind 3, TanStack Query,
react-router, lucide-react, FastAPI, SQLAlchemy, pytest.

## Global Constraints

- No new npm dependencies.
- Desktop-only; do not add mobile-specific navigation.
- Dark is the default theme; light mode remains supported.
- Do not commit unless the user explicitly asks.
- Preserve every existing API contract except the additive rerun endpoint.
- All frontend changes must pass `npm run build` and `npm run lint`.
- All backend changes must pass `python -m pytest` and `ruff check .`.

---

## Task 1: Design tokens, primitives, and app shell

**Files**
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/src/globals.css`
- Modify: `frontend/index.html`
- Modify: `frontend/src/lib/theme.ts`
- Create: `frontend/src/lib/cn.ts`
- Create: `frontend/src/components/ui/{Button,Input,Panel,Badge,Dialog,EmptyState,Skeleton,PageHeader,Kbd,Tabs}.tsx`
- Create: `frontend/src/components/ui/index.ts`
- Create: `frontend/src/components/layout/{AppShell,Sidebar,TopBar,Logo}.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`
- Create: `frontend/public/favicon.svg`

**Interfaces**
- `cn(...classes: ClassValue[]): string`
- `Button({ variant?: 'primary'|'secondary'|'ghost'|'danger'; size?: 'sm'|'md'|'lg'|'icon'; loading?: boolean })`
- `Panel({ as?, className?, children })`
- `Input`/`Textarea`/`Select` forward native props.
- `Field({ label, hint, error, children })`
- `Badge({ tone?: 'neutral'|'success'|'warning'|'danger' })`
- `Dialog({ open, onOpenChange, title, description?, children, footer?, width? })`
- `ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, destructive? })`
- `EmptyState({ icon, title, description, action? })`
- `PageHeader({ eyebrow?, title, description?, actions? })`
- `AppShell` renders sidebar + context bar + `<main>` and hosts the command
  palette + shortcuts dialog.

**Steps**
- [ ] Add semantic CSS variables and base styles; map Tailwind colors/fonts.
- [ ] Default the theme to dark when no stored preference exists; keep toggle.
- [ ] Build primitives with accessible focus styles and a focus-trapped dialog.
- [ ] Build sidebar, context bar, logo, and `PageHeader`.
- [ ] Wire `AppShell` into `App.tsx`; add a 404 route.
- [ ] Configure the Toaster with the new panel styling.
- [ ] Verify: `npm run build`.

**Acceptance:** All existing routes render inside the new shell; dark is
default; primitives are reusable and typed.

## Task 2: Global productivity

**Files**
- Create: `frontend/src/hooks/useHotkeys.ts`
- Create: `frontend/src/hooks/useActiveGeneration.ts`
- Create: `frontend/src/hooks/useAnkiStatus.ts`
- Create: `frontend/src/hooks/usePersistentState.ts`
- Create: `frontend/src/components/CommandPalette.tsx`
- Create: `frontend/src/components/ShortcutsDialog.tsx`
- Create: `frontend/src/components/ErrorBoundary.tsx`
- Create: `frontend/src/components/layout/ActiveRunChip.tsx`
- Create: `frontend/src/lib/format.ts`
- Modify: `frontend/src/components/layout/AppShell.tsx`

**Interfaces**
- `useGenerations()` in `useActiveGeneration.ts` returns the shared
  `['generations']` query with polling while any run is active.
- `useHotkeys(bindings: Record<string, () => void>)` ignores typing targets.
- `formatRelativeTime(iso: string): string`, `formatBytes(n: number): string`,
  `pluralize(n, singular, plural?)`.
- Command palette supports arrows, Enter, Escape, grouped results, and recent
  generations.

**Steps**
- [ ] Add shared generation query + active run hook.
- [ ] Add global hotkeys and shortcut reference dialog.
- [ ] Add command palette with navigation/actions/recent runs.
- [ ] Add active-run chip and document title updates.
- [ ] Add error boundary fallback.
- [ ] Verify: `npm run build`.

**Acceptance:** `⌘K`, `?`, `g d/h/s`, and `n` work; the active run survives
navigation; overlays close with Escape.

## Task 3: Dashboard

**Files**
- Rewrite: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/components/FileDropZone.tsx`
- Rewrite: `frontend/src/components/GenerationConfig.tsx`
- Create: `frontend/src/components/SetupChecklist.tsx`
- Create: `frontend/src/components/RecentRuns.tsx`
- Create: `frontend/src/components/LibraryStats.tsx`
- Modify: `frontend/src/components/ModelCombobox.tsx`

**Steps**
- [ ] Restyle the source picker with a file/text segmented control and title
      field; keep upload/dedup warnings.
- [ ] Restyle generation settings for a narrow right column; keep enrichment,
      advanced controls, and custom instructions.
- [ ] Add auto-selection of the first active provider, first model, and default
      template when config is empty.
- [ ] Add setup checklist with persisted dismissal.
- [ ] Add stats and recent runs from the shared generations query.
- [ ] Add a sticky readiness/generate footer with inline validation.
- [ ] Verify: `npm run build`.

**Acceptance:** A first-time user can go from upload to generation without
touching Settings; all previous controls still work.

## Task 4: History and exact replay

**Files**
- Modify: `backend/app/routers/generate.py`
- Create: `backend/tests/test_generation_rerun.py`
- Rewrite: `frontend/src/pages/History.tsx`
- Create: `frontend/src/components/HistoryToolbar.tsx`
- Create: `frontend/src/components/HistoryTable.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/types.ts`

**Interfaces**
- `POST /api/generate/{generation_id}/rerun` → `GenerationSchema`.
- `api.generate.rerun(id)`.
- `rerunGeneration` helper returns the new generation id.

**Steps**
- [ ] Add the rerun endpoint copying stored config and source; force file
      reprocessing.
- [ ] Add a route test covering text replay, file replay, and missing source.
- [ ] Add search/status/sort toolbar with `/` focus.
- [ ] Replace list rows with a table; add replay, delete, and clear-all
      confirmations.
- [ ] Add loading skeleton and filtered empty state.
- [ ] Verify: `python -m pytest tests/test_generation_rerun.py`, `npm run build`.

**Acceptance:** A past run replays exactly, lands in Review, and preserves the
existing delete/clear behavior.

## Task 5: Review

**Files**
- Rewrite: `frontend/src/pages/Review.tsx`
- Rewrite: `frontend/src/components/CardReviewGrid.tsx`
- Modify: `frontend/src/components/CardViewer.tsx`
- Modify: `frontend/src/components/ExportPanel.tsx`
- Modify: `frontend/src/components/GenerationProgress.tsx`
- Create: `frontend/src/components/ReviewToolbar.tsx`
- Create: `frontend/src/components/SlideLightbox.tsx`

**Steps**
- [ ] Restyle the status header, progress panel, and terminal states.
- [ ] Add sticky toolbar with search, filters, select all/none, selected count,
      and grouped export actions.
- [ ] Restyle the card grid and editor; add save/cancel and keyboard save.
- [ ] Add slide lightbox and viewer keyboard navigation.
- [ ] Add failed/cancelled/empty recovery states.
- [ ] Verify: `npm run build`.

**Acceptance:** Reviewing, editing, selecting, exporting, and canceling all
remain functional; searching/filtering never mutates data.

## Task 6: Settings tabs

**Files**
- Rewrite: `frontend/src/pages/Settings.tsx`
- Create: `frontend/src/pages/settings/ProvidersTab.tsx`
- Create: `frontend/src/pages/settings/TemplatesTab.tsx`
- Create: `frontend/src/pages/settings/AnkiTab.tsx`
- Create: `frontend/src/pages/settings/AppearanceTab.tsx`
- Create: `frontend/src/components/TemplatePreview.tsx`
- Modify: `frontend/src/components/AnkiConnectPanel.tsx`

**Steps**
- [ ] Split the page into tabs while preserving all provider/template logic.
- [ ] Add provider edit, active toggle, preset base URL hints, and model counts.
- [ ] Add template duplicate, set-default, and sandboxed preview.
- [ ] Persist Anki connection status per origin and restyle setup steps.
- [ ] Add appearance/about tab with theme control.
- [ ] Verify: `npm run build`.

**Acceptance:** Every operation previously available in Settings still works;
new actions use existing endpoints.

## Task 7: Final pass and verification

**Files**
- Modify any remaining legacy styles or copy.
- Modify: `README.md` only if behavior descriptions changed.

**Steps**
- [ ] Grep for `window.confirm`, legacy `red-` accents in page surfaces, and
      dark-mode duplicate classes.
- [ ] Run `npm run lint` and `npm run build`.
- [ ] Run `python -m pytest` and `ruff check .`.
- [ ] Boot backend + frontend, curl `/api/health`, and smoke-test all routes.
- [ ] Fix anything found; re-run the failing command.

**Acceptance:** Clean build, clean lint, passing backend suite, working smoke
test. No claims without command output.
