# Polished Black UI — Design Spec

**Date:** 2026-10-25
**Status:** Approved

## Goal

Turn the current functional-but-generic interface into a finished product: a
minimal near-black, monochrome UI in the spirit of opencode, backed by a small
set of shared components and high-impact workflow features. The backend keeps
its current behavior; one small rerun endpoint is added so replaying a
generation is exact rather than approximate.

## Experience principles

- **Quiet chrome, clear content.** Thin borders, flat surfaces, no heavy
  shadows. The interface recedes; cards and documents are the focus.
- **Monochrome by default.** White is the primary action color. Color is
  reserved for semantic status only.
- **Keyboard-first, mouse-friendly.** A command palette and route shortcuts
  make the app fast without hiding anything from pointer users.
- **Explain state.** Every loading, empty, failed, cancelled, and filtered state
  says what happened and what to do next.
- **No dead ends.** Past generations can be reopened or replayed; setup gaps
  link directly to the fix.

## Non-goals

- No mobile-first redesign. The app remains a desktop product.
- No new state library, component library, or animation dependency.
- No authentication, sync, or client-side architecture change.
- No template-editor rewrite beyond layout and added convenience actions.

## Visual system

### Palette

| Token | Dark | Light |
|---|---|---|
| canvas | `#08080a` | `#fafafa` |
| panel | `#0f0f11` | `#ffffff` |
| raised | `#17171a` | `#f1f1f2` |
| line | `#26262a` | `#e4e4e7` |
| line-strong | `#38383d` | `#d4d4d8` |
| ink | `#ededed` | `#111113` |
| muted | `#8b8b93` | `#6b6b74` |
| faint | `#5f5f67` | `#9a9aa2` |
| success | `#5fbf8a` | `#226e4f` |
| warning | `#d6a75c` | `#8a5c16` |
| danger | `#d97a7a` | `#b23333` |

Primary buttons use `bg-ink text-canvas`. Semantic colors are used at low
opacity for backgrounds and full strength for icons/text.

### Type

- Sans: system UI stack; body 14px, page title 26–28px semibold.
- Mono: system monospace; used for the brand, eyebrows, metadata, table headers,
  counts, keyboard hints, and status labels.
- Eyebrows: 11px mono uppercase, `tracking-[0.14em]`, muted.

### Shape and motion

- Panels: 10px radius, 1px border, flat fill.
- Inputs/buttons: 8px radius, 36px default height.
- Transitions: 150ms ease; transform/opacity only; respect
  `prefers-reduced-motion`.
- Focus: 1px ink outline with 2px offset; never removed.
- Custom scrollbars and monochrome selection color.

### Components

`Button`, `IconButton`, `Panel`, `Input`, `Textarea`, `Select`, `Field`,
`Badge`, `StatusBadge`, `Dialog`, `ConfirmDialog`, `EmptyState`, `Skeleton`,
`PageHeader`, `Kbd`, `Tabs`.

## App shell

- 240px sidebar: logo/brand, grouped nav (Workspace: New generation, History,
  Settings), active item with raised surface and 2px ink rail.
- Sidebar footer: active-generation chip, theme toggle, version label.
- 48px context bar: breadcrumb on the left, `⌘K` search/command trigger on the
  right. Sticky with a subtle backdrop blur.
- Main content: max-width 1200px, generous padding, per-page `PageHeader`.
- Dialogs/palette use the same panel language; backdrop is canvas at 75% with a
  small blur.

## Workflow features

### Global

- Command palette (`⌘K` / `Ctrl+K`): navigation, new generation, recent runs,
  theme toggle, shortcuts.
- Shortcuts: `g d` / `g h` / `g s` navigation, `n` new generation, `/` focus
  search, `?` shortcut reference, `Esc` close overlays.
- Active-run chip polls only while a run is active; browser title reflects
  progress; click opens the review.
- Error boundary and a styled 404 route.
- Toasts restyled as dark panels with semantic icons.
- Confirm dialogs replace every `window.confirm`.

### Dashboard

- Dismissible setup checklist until provider + model + template + Anki test
  exist.
- Two-column workspace: source picker (file/text) on the left; generation
  settings on the right; sticky action footer with readiness summary and
  Generate button.
- Library stats strip and three recent runs.
- Auto-fill empty provider/template selections from the first/default option.
- Inline validation for missing selections and already-processed files.

### History

- Search by title/model/deck; status filter; sort by newest, oldest, or cards.
- Table-style rows with status, title, model, card count, relative time.
- Replay a generation with the same provider/model/template/source and enrichment
  via `POST /api/generate/{id}/rerun`; file runs reprocess slides.
- Delete and clear-all use confirm dialogs; filtered empty state.

### Review

- Status header with cancel while running and a clear terminal state.
- Sticky toolbar after completion: card search, all/selected/unselected filters,
  select all/none, selected count, Add to Anki + export menu.
- Card list with source-slide thumbnail, lightbox, selection state, inline
  editor with Save/Cancel.
- Failed/empty states explain the cause and offer a recovery action.

### Settings

- Tabs: Providers, Templates, Anki, Appearance.
- Providers: create/edit/delete, active toggle, preset base URLs, key state,
  model count, connection test.
- Templates: create/edit/delete, duplicate, set default, sandboxed live preview.
- Anki: persisted connection status per origin, setup steps, copyable config.
- Appearance: theme choice, version/about.

## Technical design

### Frontend

- Semantic CSS variables in `globals.css`; Tailwind colors map to those tokens.
- `lib/cn.ts` combines `clsx` and `tailwind-merge`.
- `components/ui/*` holds primitives; `components/layout/*` holds shell pieces.
- Hooks: `useHotkeys`, `useActiveGeneration`, `useDocumentTitle`,
  `useAnkiStatus`, `usePersistentState`.
- Shared generation query (`['generations']`) powers the sidebar chip, history,
  stats, and recent runs; polling is enabled only while a run is active.
- Page refactors keep existing API calls and add no new runtime dependencies.

### Backend

One addition: `POST /api/generate/{id}/rerun`.

- Copies the stored generation config verbatim, including the already-composed
  custom prompt, DPI, workers, and source reference.
- Starts a new generation with the same background pipeline.
- Uses `force=True` for file sources so replaying is not silently skipped by
  `ProcessedSlide` dedup.
- Returns the new generation (201-style response body is the existing
  `GenerationSchema`).

Reason: replaying by re-posting the stored composed prompt would wrap the
enrichment preamble a second time. Copying the row is exact and small.

## Verification

- `cd frontend && npm run build` and `npm run lint`.
- `cd backend && python -m pytest` and `ruff check .`.
- Boot backend and frontend; smoke-test dashboard, history, review, settings,
  command palette, and rerun.
- Grep for legacy `red-*`/`dark:` surface classes left in page components and
  for `window.confirm`.
- Confirm dialogs close on Escape and restore focus.

## Accepted tradeoffs

- Desktop-only layout; small screens are not a target.
- Monochrome means less visual differentiation; hierarchy comes from spacing,
  border weight, and type, not color.
- Rerun intentionally duplicates API spend and will be confirmed before it runs.
