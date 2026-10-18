# Card Enrichment Specs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users request per-generation card enrichment (explanations, derivations, common mistakes, real-world applications, plus free text) that is folded into the answer/back field with outside knowledge marked `(not in slides)`.

**Architecture:** The frontend sends `card_specs` keys with the existing `custom_prompt`. A new pure backend helper expands and composes them into a single instruction block, which both generate endpoints store in `Generation.custom_prompt`. The prompt builders append that block under an `ADDITIONAL REQUIREMENTS` header instead of prefixing it. No schema or database change.

**Tech Stack:** FastAPI + Pydantic + SQLAlchemy, pytest, React + TypeScript (Vite), Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-19-card-enrichment-specs-design.md`

## Global Constraints

- Added depth goes in the template's answer/back field; never create extra cards for it.
- Every added passage must end with `(not in slides)`.
- No new DB column, no migration; store the composed block in the existing `Generation.custom_prompt`.
- No specs and no free text → prompt is identical to current behaviour.
- Unknown preset keys are ignored.
- `max_tokens` stays unchanged.
- Backend commands run from `backend/`: `python -m pytest`, `ruff check .`.
- Frontend check: `cd frontend && npm run build`.

---

### Task 1: Compose enrichment instructions (pure helper)

**Files:**
- Create: `backend/app/services/card_specs.py`
- Test: `backend/tests/test_card_specs.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PRESETS: dict[str, str]` with keys `explanations`, `derivations`, `common_mistakes`, `real_world_applications`.
  - `resolve_target_field(fields: list[dict] | None) -> str`
  - `compose_enrichment(specs: list[str] | None, custom_text: str | None, fields: list[dict] | None) -> str` — returns `""` when there is nothing to add, otherwise the block body without the `ADDITIONAL REQUIREMENTS` header.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_card_specs.py`:

```python
"""Composition of per-generation card enrichment instructions.

Pure string logic: the UI sends preset keys, the server expands them into
prompt instructions and resolves which field receives the added depth.
"""

from app.services.card_specs import PRESETS, compose_enrichment, resolve_target_field

FIELDS = [
    {"name": "prompt", "label": "Front / Prompt"},
    {"name": "answer", "label": "Back / Answer"},
    {"name": "extra", "label": "Extra"},
]


def test_all_preset_keys_have_instructions() -> None:
    assert set(PRESETS) == {
        "explanations",
        "derivations",
        "common_mistakes",
        "real_world_applications",
    }
    assert all(instruction.strip() for instruction in PRESETS.values())


def test_resolve_prefers_exact_answer_field() -> None:
    assert resolve_target_field(FIELDS) == "answer"


def test_resolve_matches_back_label() -> None:
    fields = [
        {"name": "front", "label": "Front"},
        {"name": "definition", "label": "Back / Answer"},
    ]
    assert resolve_target_field(fields) == "definition"


def test_resolve_falls_back_to_second_field() -> None:
    fields = [{"name": "one"}, {"name": "two"}]
    assert resolve_target_field(fields) == "two"


def test_resolve_falls_back_to_only_field() -> None:
    assert resolve_target_field([{"name": "text"}]) == "text"


def test_resolve_handles_no_fields() -> None:
    assert resolve_target_field(None) == "answer"
    assert resolve_target_field([]) == "answer"


def test_compose_with_nothing_returns_empty() -> None:
    assert compose_enrichment([], "", FIELDS) == ""
    assert compose_enrichment(None, "   ", FIELDS) == ""


def test_compose_ignores_unknown_keys() -> None:
    assert compose_enrichment(["does_not_exist"], "", FIELDS) == ""


def test_compose_expands_presets_in_order() -> None:
    text = compose_enrichment(["explanations", "derivations"], "", FIELDS)
    assert text.index(PRESETS["explanations"]) < text.index(PRESETS["derivations"])


def test_compose_appends_free_text_last() -> None:
    text = compose_enrichment(["explanations"], "Mention Bernoulli.", FIELDS)
    assert text.rstrip().endswith("Mention Bernoulli.")


def test_compose_names_target_field_and_grounding_rule() -> None:
    text = compose_enrichment(["common_mistakes"], "", FIELDS)
    assert '"answer"' in text
    assert "(not in slides)" in text
    assert "Do not create extra" in text
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_card_specs.py -v`

Expected: FAIL at import with `ModuleNotFoundError: No module named 'app.services.card_specs'`.

- [ ] **Step 3: Write the minimal implementation**

Create `backend/app/services/card_specs.py`:

```python
from __future__ import annotations

import re

PRESETS: dict[str, str] = {
    "explanations": (
        "Explain the why behind each fact: add a concise explanation of the "
        "underlying mechanism or reasoning, not just a restatement."
    ),
    "derivations": (
        "For every card involving a formula or equation, add a step-by-step "
        "derivation: state the starting principle and each algebraic step, "
        "using LaTeX (\\(...\\) inline, \\[...\\] display). Skip cards that "
        "contain no formula."
    ),
    "common_mistakes": (
        'Where a common misconception exists, add a brief "Common mistake:" '
        "note describing the wrong intuition and why it is wrong."
    ),
    "real_world_applications": (
        "Where natural, add one sentence connecting the idea to a real-world "
        "system, physical example, or practical application."
    ),
}

_ANSWER_NAMES = {"answer", "back"}
_ANSWER_LABEL_PARTS = tuple(_ANSWER_NAMES)


def _tokens(value: object) -> set[str]:
    """Lowercase the value and split it on anything non-alphanumeric."""
    return set(re.findall(r"[a-z0-9]+", str(value).lower()))


def resolve_target_field(fields: list[dict] | None) -> str:
    """Pick the field that receives added depth.

    Prefer an exact answer/back name, then a field whose name or label
    mentions one, then the template's second field, then its only field.
    """
    usable = [f for f in (fields or []) if f.get("name")]

    for field in usable:
        if str(field["name"]).strip().lower() in _ANSWER_NAMES:
            return field["name"]

    for field in usable:
        tokens = _tokens(field["name"]) | _tokens(field.get("label") or "")
        if tokens.intersection(_ANSWER_LABEL_PARTS):
            return field["name"]

    if len(usable) >= 2:
        return usable[1]["name"]
    if usable:
        return usable[0]["name"]
    return "answer"


def compose_enrichment(
    specs: list[str] | None,
    custom_text: str | None,
    fields: list[dict] | None,
) -> str:
    """Expand preset keys and free text into the enrichment block body.

    Returns an empty string when there is nothing to add, so callers can leave
    the prompt untouched.
    """
    lines: list[str] = []
    for key in dict.fromkeys(specs or []):
        instruction = PRESETS.get(key)
        if instruction:
            lines.append(f"- {instruction}")

    extra = (custom_text or "").strip()
    if extra:
        lines.append(extra)

    if not lines:
        return ""

    target = resolve_target_field(fields)
    preamble = (
        "These extend the rules above. They are the explicit exception to two of them:\n"
        "the rule against leaving a field empty when the content does not supply it,\n"
        "and the rule against adding facts that are not in the content (provided every\n"
        'addition is marked "(not in slides)").\n'
        "- You MAY supplement sparse slide content with established knowledge.\n"
        "  Mark every explanation/derivation/application not present in the\n"
        '  provided content by ending that passage with "(not in slides)".\n'
        f'- Put all added depth in the "{target}" field. Do not create extra\n'
        "  cards to hold it.\n"
        "- Apply a requirement only where relevant to that card's idea; leave\n"
        "  cards alone where it would be forced.\n"
        "- Keep ordinary additions to 2-4 sentences; derivations may be longer."
    )
    return preamble + "\n\n" + "\n".join(lines)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_card_specs.py -v`

Expected: all tests PASS.

- [ ] **Step 5: Run the full backend suite and lint**

Run: `cd backend && python -m pytest && ruff check .`

Expected: PASS, no ruff errors.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/card_specs.py backend/tests/test_card_specs.py
git commit -m "feat: compose card enrichment instructions from presets"
```

---

### Task 2: Accept `card_specs` on both generate endpoints

**Files:**
- Modify: `backend/app/schemas/__init__.py:105-116`
- Modify: `backend/app/routers/generate.py` (`start_generation` and `generate_from_file`)
- Test: `backend/tests/test_generate_enrichment.py`

**Interfaces:**
- Consumes: `compose_enrichment`, `resolve_target_field` from Task 1.
- Produces: `GenerateRequest.card_specs: list[str]`; both endpoints store the composed block in `Generation.custom_prompt`.

- [ ] **Step 1: Write the failing route tests**

Create `backend/tests/test_generate_enrichment.py`:

```python
"""Generate endpoints must expand preset keys before persisting the run."""

import os
import uuid

from fastapi.testclient import TestClient

from app.config import UPLOAD_DIR
from app.database import SessionLocal
from app.main import app
from app.models import CardTemplate, Provider


def _seed(db):
    tag = uuid.uuid4().hex[:8]
    provider = Provider(
        name=f"probe-{tag}",
        provider_type="openai",
        base_url="http://x.invalid",
    )
    template = CardTemplate(
        name=f"probe-tpl-{tag}",
        note_type="Basic",
        fields=[
            {"name": "prompt", "label": "Front"},
            {"name": "answer", "label": "Back"},
        ],
    )
    db.add_all([provider, template])
    db.commit()
    return provider, template


def _payload(provider, template, **overrides):
    payload = {
        "provider_id": provider.id,
        "model_name": "gpt-4o",
        "template_id": template.id,
        "deck_name": "Default",
        "card_specs": ["explanations"],
        "custom_prompt": "Mention units.",
    }
    payload.update(overrides)
    return payload


def test_text_generation_stores_composed_enrichment(monkeypatch) -> None:
    import app.routers.generate as generate_router

    monkeypatch.setattr(generate_router, "_run_generation", lambda *args, **kwargs: None)

    db = SessionLocal()
    provider, template = _seed(db)

    with TestClient(app) as client:
        response = client.post(
            "/api/generate",
            json=_payload(provider, template, source_text="Bernoulli's equation"),
        )

    db.close()

    assert response.status_code == 200
    stored = response.json()["custom_prompt"]
    assert "underlying mechanism" in stored
    assert '"answer"' in stored
    assert stored.rstrip().endswith("Mention units.")


def test_from_file_generation_stores_composed_enrichment(monkeypatch) -> None:
    import app.routers.generate as generate_router

    monkeypatch.setattr(generate_router, "_run_generation", lambda *args, **kwargs: None)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex[:16]}.txt"
    with open(os.path.join(UPLOAD_DIR, stored_name), "w", encoding="utf-8") as f:
        f.write("Bernoulli's equation")

    db = SessionLocal()
    provider, template = _seed(db)

    with TestClient(app) as client:
        response = client.post(
            "/api/generate/from-file",
            json=_payload(
                provider,
                template,
                source_filename=stored_name,
                source_title="Fluid mechanics",
            ),
        )

    db.close()

    assert response.status_code == 200
    stored = response.json()["custom_prompt"]
    assert "underlying mechanism" in stored
    assert '"answer"' in stored
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_generate_enrichment.py -v`

Expected: FAIL — `custom_prompt` is `"Mention units."` (not composed), so `"underlying mechanism"` is absent.

- [ ] **Step 3: Add the request field**

In `backend/app/schemas/__init__.py`, inside `GenerateRequest` (after `subject_context`):

```python
    card_specs: list[str] = []
```

- [ ] **Step 4: Compose in both endpoints**

In `backend/app/routers/generate.py`, add the import next to the other service imports:

```python
from app.services.card_specs import compose_enrichment
```

In `start_generation`, replace:

```python
        custom_prompt=data.custom_prompt,
```

with:

```python
        custom_prompt=compose_enrichment(
            data.card_specs, data.custom_prompt, template.fields
        ),
```

In `generate_from_file`, replace:

```python
        custom_prompt=data.custom_prompt,
```

with:

```python
        custom_prompt=compose_enrichment(
            data.card_specs, data.custom_prompt, template.fields
        ),
```

- [ ] **Step 5: Run the new tests**

Run: `cd backend && python -m pytest tests/test_generate_enrichment.py -v`

Expected: both tests PASS.

- [ ] **Step 6: Run the full backend suite and lint**

Run: `cd backend && python -m pytest && ruff check .`

Expected: PASS, no ruff errors.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/__init__.py backend/app/routers/generate.py backend/tests/test_generate_enrichment.py
git commit -m "feat: persist composed card enrichment on generation requests"
```

---

### Task 3: Append enrichment block to generation prompts

**Files:**
- Modify: `backend/app/services/ai_generator.py` (`generate_cards_text`, `generate_cards_vision`)
- Test: `backend/tests/test_ai_enrichment.py`

**Interfaces:**
- Consumes: the composed block stored in `Generation.custom_prompt` (Task 2).
- Produces: `ENRICHMENT_HEADER: str` and `_append_enrichment(prompt: str, custom_prompt: str | None) -> str`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_ai_enrichment.py`:

```python
"""Enrichment instructions are appended, never prefixed."""

from app.services.ai_generator import ENRICHMENT_HEADER, _append_enrichment


def test_append_enrichment_adds_header_and_strips_text() -> None:
    assert _append_enrichment("BASE", "  Do X.  ") == (
        f"BASE\n\n{ENRICHMENT_HEADER}\nDo X."
    )


def test_append_enrichment_is_noop_when_empty() -> None:
    assert _append_enrichment("BASE", None) == "BASE"
    assert _append_enrichment("BASE", "   ") == "BASE"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_ai_enrichment.py -v`

Expected: FAIL at import — `ENRICHMENT_HEADER` does not exist.

- [ ] **Step 3: Implement the helper and use it**

In `backend/app/services/ai_generator.py`, after `CARD_COUNT_HINT`, add:

```python
ENRICHMENT_HEADER = "ADDITIONAL REQUIREMENTS (from the user):"


def _append_enrichment(prompt: str, custom_prompt: str | None) -> str:
    """Append user enrichment below the built-in rules, never above them."""
    if not custom_prompt or not custom_prompt.strip():
        return prompt
    return f"{prompt}\n\n{ENRICHMENT_HEADER}\n{custom_prompt.strip()}"
```

In `generate_cards_text`, replace:

```python
    if custom_prompt:
        prompt = custom_prompt + "\n\n" + prompt
```

with:

```python
    prompt = _append_enrichment(prompt, custom_prompt)
```

In `generate_cards_vision`, make the same replacement.

- [ ] **Step 4: Run the new tests**

Run: `cd backend && python -m pytest tests/test_ai_enrichment.py -v`

Expected: both tests PASS.

- [ ] **Step 5: Run the full backend suite and lint**

Run: `cd backend && python -m pytest && ruff check .`

Expected: PASS, no ruff errors.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ai_generator.py backend/tests/test_ai_enrichment.py
git commit -m "feat: append enrichment requirements to card prompts"
```

---

### Task 4: Frontend enrichment controls

**Files:**
- Modify: `frontend/src/lib/types.ts` (`GenerateRequest`)
- Modify: `frontend/src/pages/Dashboard.tsx` (`DEFAULT_CONFIG`)
- Modify: `frontend/src/components/GenerationConfig.tsx` (new Enrichment section)

**Interfaces:**
- Consumes: backend `card_specs: string[]` from Task 2.
- Produces: per-generation `config.card_specs`, persisted automatically in `localStorage` with the rest of the config.

- [ ] **Step 1: Add the request type**

In `frontend/src/lib/types.ts`, add to `GenerateRequest` after `subject_context`:

```ts
  card_specs?: string[]
```

- [ ] **Step 2: Add the config default**

In `frontend/src/pages/Dashboard.tsx`, add to `DEFAULT_CONFIG` after `subject_context`:

```ts
  card_specs: [],
```

(`loadConfig` already merges saved configs over these defaults, so older saved configs get `[]`.)

- [ ] **Step 3: Add preset definitions and toggle logic**

At the top of `frontend/src/components/GenerationConfig.tsx`, after the imports, add:

```tsx
const ENRICHMENT_PRESETS = [
  { key: 'explanations', label: 'Explanations', hint: 'Explain the why, not just the what' },
  { key: 'derivations', label: 'Derivations', hint: 'Step-by-step math for formulas' },
  { key: 'common_mistakes', label: 'Common mistakes', hint: 'Call out misconceptions' },
  { key: 'real_world_applications', label: 'Real-world uses', hint: 'Connect ideas to physical examples' },
] as const
```

Inside the component, after `activeProviders`, add:

```tsx
  const cardSpecs: string[] = config.card_specs || []

  const toggleCardSpec = (key: string) => {
    const next = cardSpecs.includes(key)
      ? cardSpecs.filter((k: string) => k !== key)
      : [...cardSpecs, key]
    onChange({ ...config, card_specs: next })
  }
```

- [ ] **Step 4: Render the Enrichment section**

In the same file, replace the existing Custom Prompt block:

```tsx
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-gray-400">
          Custom Prompt (optional)
        </label>
        <textarea
          value={config.custom_prompt}
          onChange={(e) => onChange({ ...config, custom_prompt: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          placeholder="Custom system prompt for the AI..."
        />
      </div>
```

with:

```tsx
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2 dark:text-gray-400">Enrichment</label>
        <div className="grid grid-cols-2 gap-2">
          {ENRICHMENT_PRESETS.map((preset) => {
            const active = cardSpecs.includes(preset.key)
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => toggleCardSpec(preset.key)}
                className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                  active
                    ? 'border-red-500 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-900/30 dark:text-red-300'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300'
                }`}
              >
                <span className="font-medium">{preset.label}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{preset.hint}</span>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
          Added depth goes in the template&apos;s answer/back (or main content) field and is marked &quot;(not in slides)&quot;.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-gray-400">
          Additional instructions (optional)
        </label>
        <textarea
          value={config.custom_prompt}
          onChange={(e) => onChange({ ...config, custom_prompt: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          placeholder="e.g. connect each formula to the physical meaning of each term"
        />
      </div>
```

- [ ] **Step 5: Build the frontend**

Run: `cd frontend && npm run build`

Expected: `tsc --noEmit` and `vite build` both succeed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/pages/Dashboard.tsx frontend/src/components/GenerationConfig.tsx
git commit -m "feat: add card enrichment controls to generation settings"
```

---

### Task 5: Manual end-to-end verification

**Files:** none.

**Interfaces:**
- Consumes: all previous tasks.

- [ ] **Step 1: Start the backend**

Run from `backend/`: `uvicorn app.main:app --port 8080`

Expected: server boots and `curl http://127.0.0.1:8080/api/health` returns `{"status":"ok"}`.

- [ ] **Step 2: Run a real fluid-mechanics generation**

In the UI, upload a fluid-mechanics deck (or paste a short excerpt), select a provider/model/template, enable **Explanations** + **Derivations**, and generate.

Expected:
- Cards still use the template's existing field set (no new field, no extra cards for derivations).
- Added depth appears in the answer/back field.
- Added passages end with `(not in slides)`.
- Formula cards show LaTeX in `\(...\)` / `\[...\]` form.
- Cards for definition-only slides are not forced to include a derivation.

- [ ] **Step 3: Confirm the empty case is unchanged**

Start a generation with no presets and an empty Additional instructions box for the same content.

Expected: the stored `custom_prompt` is `null`, and the prompt contains no `ADDITIONAL REQUIREMENTS` block.
