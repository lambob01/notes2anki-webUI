# Clear History — Design

Date: 2026-08-06
Status: Approved

## Problem

The History page ("Generation History") offers no way to remove generations.
The backend has a working `DELETE /api/generate/{id}` endpoint and full
cleanup logic (rows, cards, slides, exports, refcounted uploads), but no UI
calls it, and there is no bulk "clear" at all. Two related defects surface as
soon as delete affordances exist:

1. Deleting a generation leaves that file's `ProcessedSlide` rows behind, so
   re-uploading the same lecture after a delete silently produces zero cards
   (`skipped_all_duplicates`).
2. There is no way to wipe everything at once, and no handling of the
   in-flight-generation case (deleting a running job's row orphans the
   background task, which keeps calling the LLM until it finishes).

## Decisions (confirmed with user)

- **Scope:** Clear All deletes *every* generation.
- **Running jobs:** Clear All is refused while any generation is
  `running`/`pending` (409 + count), so no in-flight task is orphaned.
- **Dedup reset:** Clear All also wipes the `ProcessedSlide` dedup set — a
  true clean slate, so re-uploading the same file regenerates everything.
- **Per-item delete:** Also added, wiring up the existing
  `DELETE /api/generate/{id}` endpoint.

## Design

### Backend

**New endpoint `DELETE /api/generate`** (clear-all), parallel to the existing
per-id delete:

1. If any generation has `status` in (`running`, `pending`) → `409` via
   `HTTPException` (so the body is the standard `{"detail": ...}` the frontend
   `request()` already parses), delete nothing.
2. Otherwise:
   - Delete all `Generation` rows (cascade removes cards).
   - Remove every `SLIDES_DIR/{id}/` directory and `EXPORT_DIR/{id}.apkg/.csv`
     (best-effort, reusing `_rmtree_quietly`/`_unlink_quietly`).
   - Remove all files in `UPLOAD_DIR` (all generations are gone, so every
     upload is orphaned — including any that never started a generation).
   - Delete all `ProcessedSlide` rows.
3. Return `{"deleted": N}`.

**Per-item delete fix** in `delete_generation`: after the row is gone, also
delete `ProcessedSlide` rows where `source_filename == gen.source_filename`.
The same digest always produces the same hash-named upload, so matching on
the stored upload name is exact.

### Frontend — History page

- **Clear All button** in the page header, disabled when the list is empty.
  Click → confirm dialog → `DELETE /api/generate` → invalidate
  `['generations']` query → toast. A `409` surfaces the
  "still running" message.
- **Per-row delete button** (trash icon) on each generation row. The row
  stays a `<Link>` to Review; the button is a sibling that
  `preventDefault`s. Click → confirm → `api.generate.delete(id)` → invalidate
  `['generations']` query → toast.
- New `api.generate.clear()` method in `lib/api.ts`.

### Testing

- Backend (route tests via TestClient, matching `tests/test_generation_cleanup.py`):
  - clear-all with generations removes rows, cards, slide dirs, exports,
    uploads, and ProcessedSlide;
  - clear-all with a `running`/`pending` generation → 409 and deletes nothing;
  - clear-all with no generations → 200 `{"deleted": 0}`;
  - per-item delete removes that file's ProcessedSlide rows (regression for
    the re-upload-zero-cards trap).
- Frontend: no test framework exists (TODO #18); verify via
  `npm run build` (`tsc --noEmit && vite build`).

## Out of scope

- Age-based retention sweeps.
- Cancelling in-flight generations (TODO #18).
- Deleting individual cards/uploads outside the generation lifecycle.
