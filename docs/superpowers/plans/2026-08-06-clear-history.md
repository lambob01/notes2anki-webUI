# Clear History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Clear All button on the History page, a per-row delete button, and the backend endpoint/logic that both need — with a full disk + dedup reset.

**Architecture:** A new unauthenticated `DELETE /api/generate` endpoint deletes every `Generation` row (cards cascade via DB-level `ondelete="CASCADE"`), wipes `ProcessedSlide`, and empties `UPLOAD_DIR`/`SLIDES_DIR`/`EXPORT_DIR`. It is refused with 409 while any generation is `running`/`pending`. The existing `DELETE /api/generate/{id}` also gains a dedup fix: deleting a generation that was the last referrer of its upload clears that file's `ProcessedSlide` rows, so re-uploading the same lecture regenerates instead of hitting `skipped_all_duplicates`. The History page wires both endpoints with confirm dialogs and react-query invalidation.

**Tech Stack:** FastAPI + SQLAlchemy (SQLite, `PRAGMA foreign_keys=ON`), React 18 + Vite + TanStack Query + `react-hot-toast`.

## Global Constraints

- Frontend fetches use **relative** URLs only; never add a host prefix.
- No authentication by design; keep destructive endpoints cheap and explicit (409 on running jobs).
- Uploads are content-hash named and shared across generations — the per-item dedup wipe only fires when the upload has **no remaining referrer**.
- Confirm dialogs use `window.confirm` (matches `Dashboard.tsx`); toasts use `react-hot-toast`; icon-only buttons need an `aria-label`.
- Error bodies from FastAPI are `{"detail": ...}`; `api.ts` already throws `Error(detail)`.
- Backend tests run from `backend/`: `python -m pytest tests/<file> -q`. Lint: `ruff check .`.

---
### Task 1: Backend — per-item delete clears that file's dedup set

**Files:**
- Modify: `backend/app/routers/generate.py` (`delete_generation`, lines 519-552)
- Test: `backend/tests/test_clear_history.py` (new)

**Interfaces:**
- Consumes: `ProcessedSlide` model (already imported in `generate.py`), `UPLOAD_DIR`, `_unlink_quietly`.
- Produces: behavior — `DELETE /api/generate/{id}` on the last referrer of an upload removes `ProcessedSlide` rows for that upload name.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_clear_history.py`:

```python
"""Clear-history behaviour: per-item delete must forget a file's dedup rows.

`ProcessedSlide` rows survive generation deletion, so deleting the only
generation for a lecture and re-uploading the same file silently produced
zero cards (`skipped_all_duplicates`). The dedup set must be reset when the
generation being deleted was the last referrer of its upload.
"""

import os
import uuid

from fastapi.testclient import TestClient

from app.config import SLIDES_DIR, UPLOAD_DIR
from app.database import SessionLocal
from app.main import app
from app.models import CardTemplate, Generation, ProcessedSlide, Provider


def _seed(tag, statuses):
    """A provider/template plus one generation per given status, each with an
    upload, slide dir, and ProcessedSlide row for that upload's name."""
    db = SessionLocal()
    provider = Provider(name=f"prov-{tag}", provider_type="openai", base_url="http://x.invalid")
    template = CardTemplate(name=f"tpl-{tag}", note_type="Basic", fields=[{"name": "prompt"}])
    db.add_all([provider, template])
    db.commit()
    db.refresh(provider)
    db.refresh(template)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(SLIDES_DIR, exist_ok=True)

    gens = []
    for i, status in enumerate(statuses):
        upload = f"{tag}-{i:04d}abcdef00.pptx"
        upload_path = os.path.join(UPLOAD_DIR, upload)
        with open(upload_path, "wb") as f:
            f.write(b"pptx bytes")

        g = Generation(
            source_type="file",
            source_filename=upload,
            provider_id=provider.id,
            model_name="gpt-4o",
            template_id=template.id,
            status=status,
        )
        db.add(g)
        db.commit()
        db.refresh(g)

        slide_dir = os.path.join(SLIDES_DIR, g.id)
        os.makedirs(slide_dir, exist_ok=True)
        with open(os.path.join(slide_dir, "0.jpg"), "wb") as f:
            f.write(b"jpeg")

        db.add(ProcessedSlide(file_digest=f"digest-{tag}-{i}", slide_index=0, source_filename=upload))
        gens.append((g.id, upload))

    db.commit()
    db.close()
    return gens


def test_delete_last_referrer_clears_that_files_dedup():
    tag = uuid.uuid4().hex[:8]
    gen_id, upload = _seed(tag, ["completed"])[0]

    with TestClient(app) as c:
        assert c.delete(f"/api/generate/{gen_id}").status_code == 200

    db = SessionLocal()
    try:
        remaining = db.query(ProcessedSlide).filter(
            ProcessedSlide.source_filename == upload
        ).count()
        assert remaining == 0
    finally:
        db.close()


def test_delete_keeps_dedup_when_upload_still_referenced():
    tag = uuid.uuid4().hex[:8]
    gens = _seed(tag, ["completed", "completed"])
    # Give both generations the same upload so the first delete is not the
    # last referrer.
    db = SessionLocal()
    try:
        second = db.query(Generation).filter(Generation.id == gens[1][0]).first()
        second.source_filename = gens[0][1]
        db.commit()
    finally:
        db.close()

    with TestClient(app) as c:
        assert c.delete(f"/api/generate/{gens[0][0]}").status_code == 200

    db = SessionLocal()
    try:
        remaining = db.query(ProcessedSlide).filter(
            ProcessedSlide.source_filename == gens[0][1]
        ).count()
        assert remaining == 1  # the row for the still-referenced upload's file
    finally:
        db.close()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_clear_history.py -v`
Expected: `test_delete_last_referrer_clears_that_files_dedup` FAILS (`remaining == 1`); `test_delete_keeps_dedup_when_upload_still_referenced` PASSES (it must — it pins current behaviour).

- [ ] **Step 3: Implement the minimal fix**

In `backend/app/routers/generate.py`, inside `delete_generation`, extend the existing `if source_filename:` block so that when the upload has no remaining referrer it is unlinked **and** its dedup rows are dropped:

```python
    if source_filename:
        still_referenced = (
            db.query(Generation)
            .filter(Generation.source_filename == source_filename)
            .first()
        )
        if not still_referenced:
            _unlink_quietly(os.path.join(UPLOAD_DIR, source_filename))
            # The upload is gone; its dedup markers must go too, or the next
            # upload of the same lecture reports every slide as already
            # processed and generates zero cards.
            db.query(ProcessedSlide).filter(
                ProcessedSlide.source_filename == source_filename
            ).delete(synchronize_session=False)
            db.commit()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/test_clear_history.py -v`
Expected: both PASS.

- [ ] **Step 5: Run full suite + lint**

Run: `python -m pytest -q` (expect all pass) then `ruff check .` (expect clean).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/generate.py backend/tests/test_clear_history.py
git commit -m "Clear a file's slide-dedup markers when its last generation is deleted"
```

---
### Task 2: Backend — clear-all endpoint

**Files:**
- Modify: `backend/app/routers/generate.py` (add `@router.delete("")` above `delete_generation`)
- Modify: `backend/tests/test_clear_history.py` (extend)

**Interfaces:**
- Consumes: `ProcessedSlide`, `Generation`, `Card` (already imported in `generate.py`), `UPLOAD_DIR`, `SLIDES_DIR`, `EXPORT_DIR`, `_unlink_quietly`, `_rmtree_quietly`.
- Produces: `DELETE /api/generate` → 200 `{"deleted": N}`; 409 `HTTPException(detail=...)` when any generation is `running`/`pending`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_clear_history.py`:

```python
from app.config import EXPORT_DIR
from app.models import Card


def test_clear_all_removes_rows_cards_files_and_dedup():
    tag = uuid.uuid4().hex[:8]
    gens = _seed(tag, ["completed", "completed"])
    upload_paths = [os.path.join(UPLOAD_DIR, u) for _, u in gens]
    # give the first generation a card + export artifact
    db = SessionLocal()
    try:
        g = db.query(Generation).filter(Generation.id == gens[0][0]).first()
        db.add(Card(generation_id=g.id, slide_index=0, fields={"prompt": "q"}))
        db.commit()
    finally:
        db.close()
    apkg = os.path.join(EXPORT_DIR, f"{gens[0][0]}.apkg")
    with open(apkg, "wb") as f:
        f.write(b"zip")

    with TestClient(app) as c:
        r = c.delete("/api/generate")
        assert r.status_code == 200
        assert r.json()["deleted"] == 2

    db = SessionLocal()
    try:
        assert db.query(Generation).count() == 0
        assert db.query(Card).count() == 0
        assert db.query(ProcessedSlide).count() == 0
    finally:
        db.close()
    for p in upload_paths:
        assert not os.path.exists(p)
    assert not os.path.exists(os.path.join(SLIDES_DIR, gens[0][0]))
    assert not os.path.exists(apkg)


def test_clear_all_blocked_while_any_generation_running():
    tag = uuid.uuid4().hex[:8]
    gens = _seed(tag, ["completed", "running"])

    with TestClient(app) as c:
        r = c.delete("/api/generate")

    assert r.status_code == 409
    db = SessionLocal()
    try:
        assert db.query(Generation).count() == 2
    finally:
        db.close()


def test_clear_all_with_empty_history():
    with TestClient(app) as c:
        r = c.delete("/api/generate")

    assert r.status_code == 200
    assert r.json()["deleted"] == 0
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_clear_history.py -v`
Expected: the three new tests FAIL (404, since `DELETE /api/generate` has no route yet); the Task 1 tests still PASS.

- [ ] **Step 3: Implement the endpoint**

In `backend/app/routers/generate.py`, directly above `@router.delete("/{generation_id}")` (line 519), add:

```python
@router.delete("")
def clear_generations(db: Session = Depends(get_db)):
    """Delete every generation and reset all per-generation state.

    Refused while any job is running or pending: deleting a running job's row
    would orphan its background task, which keeps calling the LLM until it
    finishes. SQLite enforces `ondelete="CASCADE"` on cards, so deleting the
    generation rows also removes their cards.
    """
    running = (
        db.query(Generation)
        .filter(Generation.status.in_(["running", "pending"]))
        .count()
    )
    if running:
        raise HTTPException(
            409,
            f"{running} generation(s) are still running. "
            "Wait for them to finish before clearing history.",
        )

    deleted = db.query(Generation).count()
    db.query(Generation).delete(synchronize_session=False)
    db.query(ProcessedSlide).delete(synchronize_session=False)
    db.commit()

    # Every generation is gone, so every upload, slide dir and export is
    # orphaned (uploads are only shared *between* generations).
    for name in os.listdir(UPLOAD_DIR):
        _unlink_quietly(os.path.join(UPLOAD_DIR, name))
    for name in os.listdir(SLIDES_DIR):
        _rmtree_quietly(os.path.join(SLIDES_DIR, name))
    for name in os.listdir(EXPORT_DIR):
        _unlink_quietly(os.path.join(EXPORT_DIR, name))

    return {"deleted": deleted}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/test_clear_history.py -v`
Expected: all 5 tests PASS.

- [ ] **Step 5: Run full suite + lint**

Run: `python -m pytest -q` then `ruff check .` — expect clean.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/generate.py backend/tests/test_clear_history.py
git commit -m "Add DELETE /api/generate to clear all generations and dedup"
```

---
### Task 3: Frontend — History page clear-all and per-row delete

**Files:**
- Modify: `frontend/src/lib/api.ts` (add `api.generate.clear`)
- Modify: `frontend/src/pages/History.tsx` (buttons + mutations)

**Interfaces:**
- Consumes: `api.generate.delete(id)` (exists), `api.generate.clear()` (added here), `api.generate.list` (exists), query key `['generations']`.
- Produces: Clear All button in the header; per-row delete (trash) button; both invalidate `['generations']`; 409 message surfaced via toast.

- [ ] **Step 1: Add the `clear` method to the API client**

In `frontend/src/lib/api.ts`, in the `generate` block (line 55), after `delete`:

```typescript
    clear: () => request<any>('/api/generate', { method: 'DELETE' }),
```

- [ ] **Step 2: Rewrite the History page**

Replace `frontend/src/pages/History.tsx` with:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { Clock, FileText, CheckCircle, XCircle, Loader2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function HistoryPage() {
  const queryClient = useQueryClient()
  const { data: generations, isLoading } = useQuery({
    queryKey: ['generations'],
    queryFn: api.generate.list,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['generations'] })

  const clearAll = useMutation({
    mutationFn: () => api.generate.clear(),
    onSuccess: () => {
      invalidate()
      toast.success('History cleared')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const deleteOne = useMutation({
    mutationFn: (id: string) => api.generate.delete(id),
    onSuccess: () => {
      invalidate()
      toast.success('Generation deleted')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const handleClearAll = () => {
    if (!window.confirm('Delete all generations and their cards, slides, and uploads? This cannot be undone.')) return
    clearAll.mutate()
  }

  const handleDelete = (g: any) => {
    if (!window.confirm(`Delete "${g.title}" and its cards? This cannot be undone.`)) return
    deleteOne.mutate(g.id)
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading history...
      </div>
    )
  }

  const empty = !generations || generations.length === 0

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Generation History</h1>
          <p className="text-gray-500 mt-1 dark:text-gray-400">View and manage past card generations</p>
        </div>
        <button
          onClick={handleClearAll}
          disabled={empty || clearAll.isPending}
          className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
        >
          {clearAll.isPending ? 'Clearing...' : 'Clear All'}
        </button>
      </div>

      {empty ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <Clock className="w-10 h-10 mx-auto mb-3" />
          <p>No generations yet. Create one from the Dashboard.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {generations.map((g: any) => (
            <div key={g.id} className="flex items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:shadow-sm transition-shadow dark:bg-gray-800 dark:border-gray-700">
              <Link to={`/review/${g.id}`} className="flex flex-1 items-center gap-4">
                {g.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-500" />}
                {g.status === 'failed' && <XCircle className="w-5 h-5 text-red-500" />}
                {g.status === 'running' && <Loader2 className="w-5 h-5 text-red-500 animate-spin" />}
                {g.status === 'pending' && <Clock className="w-5 h-5 text-gray-400" />}

                <div className="flex-1">
                  <p className="text-sm font-medium">{g.title}</p>
                  <p className="text-xs text-gray-400">
                    {g.model_name} &middot; {g.deck_name} &middot; {g.cards?.length || 0} cards
                  </p>
                </div>

                <div className="text-xs text-gray-400">
                  {new Date(g.created_at).toLocaleDateString()}
                </div>

                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  g.status === 'completed' ? 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                  g.status === 'failed' ? 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                  g.status === 'running' ? 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                  {g.status}
                </span>
              </Link>
              <button
                onClick={() => handleDelete(g)}
                disabled={deleteOne.isPending}
                aria-label={`Delete ${g.title}`}
                className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify the frontend builds (typecheck + vite)**

Run: `npm run build` (from `frontend/`)
Expected: `tsc --noEmit && vite build` both pass with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/pages/History.tsx
git commit -m "Add clear-all and per-row delete buttons to the history page"
```

---
## Self-Review

- **Spec coverage:** Clear-all endpoint (Task 2), running-job 409 (Task 2 test), ProcessedSlide reset on clear-all (Task 2), per-item delete wiring + dedup fix (Tasks 1 + 3), Clear All button (Task 3), confirm dialogs + 409 toast (Task 3). All spec sections covered.
- **Placeholders:** none — every step has concrete code/commands.
- **Type consistency:** `api.generate.clear()` defined in Task 3 and used only there; `DELETE /api/generate` returns `{deleted: N}` used in Task 2's test and unused elsewhere; mutation names (`clearAll`, `deleteOne`) consistent.
- **Route conflict:** `@router.delete("")` and `@router.delete("/{generation_id}")` do not collide (empty path vs one segment), same pattern as the existing GET pair.
