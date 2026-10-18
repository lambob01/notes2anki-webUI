# Card Enrichment Specs — Design

## Problem

Uploaded lecture slides often name a concept without explaining it (e.g. a
fluid-mechanics slide states Bernoulli's equation but never derives it). The
current generation pipeline can only reorganise what is already on the slides:
prompt rule 8 forbids inferring facts, and the free-text "Custom Prompt" is an
undifferentiated system-prompt prefix that does not explicitly permit — or
scope — supplementation from the model's own knowledge.

Users need to ask, per generation, for added depth such as explanations,
derivations, common mistakes, or real-world applications, and have that depth
folded into the existing cards rather than producing extra cards.

## Decisions

- **Presets plus free text.** Four toggle presets ship (`explanations`,
  `derivations`, `common_mistakes`, `real_world_applications`) and an additional
  free-text box covers anything else.
- **Enrich existing cards.** Added depth goes into the template's answer/back
  field. No additional cards are created for it.
- **Outside knowledge allowed, labelled.** The model may supplement sparse
  slides, but every added passage ends with `(not in slides)`.
- **Approach A — prompt-only, no schema change.** Presets are expanded and
  composed into the existing `Generation.custom_prompt` at request time. No new
  database column, no migration, no history UI.
- **Per generation, local persistence.** The UI config (including
  `card_specs`) is already persisted in `localStorage`; selections survive
  reloads and are not global/template settings.

## Prompt contract

When any preset or free text is present, the system prompt gains a block
appended after the existing rules (replacing today's prefix behaviour):

```
ADDITIONAL REQUIREMENTS (from the user):
These extend the rules above. They are the explicit exception to two of them:
the rule against leaving a field empty when the content does not supply it,
and the rule against adding facts that are not in the content (provided every
addition is marked "(not in slides)").
- You MAY supplement sparse slide content with established knowledge.
  Mark every explanation/derivation/application not present in the
  provided content by ending that passage with "(not in slides)".
- Put all added depth in the "<target>" field. Do not create extra
  cards to hold it.
- Apply a requirement only where relevant to that card's idea; leave
  cards alone where it would be forced.

<expanded preset instructions, then the user's free text>
```

Preset expansions:

| Key | Instruction |
|---|---|
| `explanations` | Explain the *why* behind each fact — mechanism or reasoning, not just restatement. |
| `derivations` | For cards involving a formula, show a step-by-step derivation in LaTeX (`\(...\)` / `\[...\]`); skip cards without a formula. |
| `common_mistakes` | Where a misconception exists, add a brief "Common mistake:" note with the wrong intuition and why it is wrong. |
| `real_world_applications` | Where natural, add a one-sentence real-world/physical example. |

Rules:

- No specs and no free text → no block, prompt unchanged.
- Unknown preset keys are ignored server-side.
- Empty/whitespace free text produces no empty section.
- Rule 8 continues to forbid inventing facts about the slide itself; the
  exception is scoped to the requested added depth, which must be marked.
- Ordinary additions are capped at about 2–4 sentences; derivations may run
  longer. `max_tokens` remains unchanged.

## Target field resolution

For "answer/back", pick the first field that matches, case-insensitively:

1. name is `answer` or `back`;
2. name or label has a whole word `answer` or `back` (e.g. `Back / Answer`);
3. otherwise the template's second field;
4. otherwise its only field.

The resolved field name is embedded in the prompt block. For Cloze templates
without an answer/back field, added prose lands in the second/only field.

## Components

### Backend

- `app/services/card_specs.py` (new, pure logic):
  - `PRESETS`: ordered mapping of key → instruction text.
  - `resolve_target_field(fields) -> str`.
  - `compose_enrichment(specs, custom_text, fields) -> str`, returning `""`
    when there is nothing to add, otherwise the full block body.
- `app/schemas/__init__.py`: `GenerateRequest.card_specs: list[str] = []`.
- `app/routers/generate.py`: both `start_generation` and `generate_from_file`
  call `compose_enrichment(...)` and store the result in
  `Generation.custom_prompt`.
- `app/services/ai_generator.py`: `generate_cards_text` and
  `generate_cards_vision` append the stored block under the
  `ADDITIONAL REQUIREMENTS (from the user):` header instead of prefixing it.
  `compose_enrichment` returns only the block body; a shared helper
  `_append_enrichment(prompt, custom_prompt)` adds the header and is called by
  both generate functions after `build_card_prompt`. This changes
  `custom_prompt` semantics from "prefix / override" to "additional
  requirements", which is the intended contract for this feature.

### Frontend

- `GenerationConfig.tsx`: new **Enrichment** section between Subject Context
  and Custom Prompt — four toggle chips with one-line descriptions, plus the
  existing textarea relabelled "Additional instructions (optional)".
- `Dashboard.tsx`: `DEFAULT_CONFIG.card_specs = []`.
- `lib/types.ts`: add `card_specs?: string[]` to `GenerateRequest`.
- No API client changes: `start` and `fromFile` already forward the config.

## Edge cases

- Enrichment applies to both pasted text and file/slide paths, and to re-runs,
  because the composed block is stored on the generation.
- Title/blank slides that yield no cards are unaffected.
- No specs → identical prompt to current behaviour.
- Existing users' saved configs lack `card_specs`; `loadConfig` merges over
  defaults, so it becomes `[]`.

## Verification

- New `backend/tests/test_card_specs.py`: preset expansion order, free-text
  preservation, unknown-key ignoring, empty input, and target resolution for
  `answer`, a `Back` label, second-field and single-field templates.
- `python -m pytest` and `ruff check .` from `backend/`.
- `npm run build` from `frontend/`.
- Manual fluid-mechanics run with `explanations` + `derivations`: confirm added
  depth lands in the answer field, ends with `(not in slides)`, and creates no
  extra cards.

## Out of scope

- Saved/reusable instruction profiles.
- Structured persistence or history display of selected presets.
- Per-preset choice of "enrich" vs "add card".
- Raising `max_tokens`.
