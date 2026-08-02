/**
 * AnkiConnect client.
 *
 * Calls run from the browser, not the server, because AnkiConnect binds to
 * 127.0.0.1 on the machine running Anki. Going through the backend would mean
 * exposing AnkiConnect on the network; from the browser it stays loopback and
 * the only setup is allowing this app's origin in AnkiConnect's config.
 */

const ANKI_CONNECT_URL = 'http://127.0.0.1:8765'
const ANKI_CONNECT_VERSION = 6

const MAX_ATTEMPTS = 5
const RETRY_DELAY_MS = 1000
const BUSY_RETRY_DELAY_MS = 1500

// AnkiConnect reports "Anki's UI is mid-operation, ask again" by leaking the Qt
// error rather than a status code. Syncing 60 notes while Anki is doing
// anything else hits this routinely, and it clears on its own.
const BUSY_MARKERS = ['QPushButton', 'deleted object']

const UNREACHABLE_MESSAGE =
  'Could not reach Anki. Make sure Anki is running with the AnkiConnect ' +
  "add-on installed, and that this page's address is listed in " +
  "AnkiConnect's webCorsOriginList setting."

export class AnkiConnectError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function invoke<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response
    try {
      res = await fetch(ANKI_CONNECT_URL, {
        method: 'POST',
        // No custom headers: adding any would trigger a CORS preflight that
        // AnkiConnect does not answer.
        body: JSON.stringify({ action, version: ANKI_CONNECT_VERSION, params }),
      })
    } catch {
      // Anki genuinely unreachable, or a blip on the loopback socket. Retrying
      // is safe for every action used here: addNotes runs with
      // allowDuplicate:false so a re-send lands as duplicates rather than
      // doubles, and the rest are idempotent.
      if (attempt === MAX_ATTEMPTS) throw new AnkiConnectError(UNREACHABLE_MESSAGE)
      await sleep(RETRY_DELAY_MS)
      continue
    }

    const payload = await res.json()
    const error = payload.error
    if (error) {
      const text = String(error)
      if (BUSY_MARKERS.some((marker) => text.includes(marker)) && attempt < MAX_ATTEMPTS) {
        await sleep(BUSY_RETRY_DELAY_MS)
        continue
      }
      throw new AnkiConnectError(text)
    }
    return payload.result as T
  }
  // Unreachable: the final attempt always returns or throws. Here to satisfy
  // the return type - the last busy error is what actually surfaces.
  throw new AnkiConnectError('Anki stayed busy after several retries.')
}

/**
 * Model text as an Anki field.
 *
 * Anki renders fields as HTML, so a `<` in model output silently swallows
 * everything after it - and a hostile or confused model could inject markup
 * into the collection. Escapes the same three characters as Python's
 * `html.escape(quote=False)`, which is what the .apkg export path uses, so
 * both routes write identical cards. LaTeX delimiters are untouched.
 */
function escapeField(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export const anki = {
  /** AnkiConnect API version; the cheapest reachability probe. */
  version: () => invoke<number>('version'),
  deckNames: () => invoke<string[]>('deckNames'),
  modelNames: () => invoke<string[]>('modelNames'),
  modelFieldNames: (modelName: string) =>
    invoke<string[]>('modelFieldNames', { modelName }),
  createDeck: (deck: string) => invoke<number>('createDeck', { deck }),
  storeMediaFile: (filename: string, data: string) =>
    invoke<string>('storeMediaFile', { filename, data }),
  addNotes: (notes: unknown[]) => invoke<(number | null)[]>('addNotes', { notes }),
  guiBrowse: (query: string) => invoke<number[]>('guiBrowse', { query }),
}

/** Anki's filename for a slide image; must match the .apkg export's. */
export function slideMediaFilename(genId: string, slideIndex: number): string {
  return `notes2anki_${genId.slice(0, 8)}_${slideIndex}.jpg`
}

/** The `<img>` HTML for a card's slide, or '' when none was stored. */
function slideImageHtml(card: any, genId: string, stored: Set<string>): string {
  if (card.slide_index == null) return ''
  const filename = slideMediaFilename(genId, card.slide_index)
  if (!stored.has(filename)) return ''
  return `<img src="${filename}" style="max-width:100%; margin-bottom:8px">`
}

/** base64 of a fetch() response body, chunked to survive large slides. */
async function blobToBase64(res: Response): Promise<string> {
  const bytes = new Uint8Array(await res.arrayBuffer())
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** Upload every selected card's source slide into Anki's media folder. */
async function storeSlideMedia(cards: any[], genId: string): Promise<Set<string>> {
  const stored = new Set<string>()
  for (const card of cards) {
    if (!card.selected || card.slide_index == null) continue
    const filename = slideMediaFilename(genId, card.slide_index)
    if (stored.has(filename)) continue
    const res = await fetch(`/api/generate/${genId}/slides/${card.slide_index}`)
    if (!res.ok) continue
    try {
      await anki.storeMediaFile(filename, await blobToBase64(res))
      stored.add(filename)
    } catch {
      // A failed media upload is not worth failing the whole sync over.
    }
  }
  return stored
}

export interface AnkiNote {
  deckName: string
  modelName: string
  fields: Record<string, string>
  tags: string[]
  options: { allowDuplicate: boolean }
}

/** Create the note type in Anki if it doesn't exist yet. */
async function ensureModel(
  modelName: string,
  fieldNames: string[],
  css: string,
  isCloze: boolean,
  frontField?: string
): Promise<void> {
  const existing = await anki.modelNames()
  if (existing.includes(modelName)) return

  const first = frontField ?? fieldNames[0]
  const rest = fieldNames.filter((f) => f !== first)
  // Back shows every field except the one on the front.
  const back = ['{{FrontSide}}', '<hr id=answer>', ...rest.map((f) => `{{${f}}}`)].join(
    '<br>'
  )

  await invoke('createModel', {
    modelName,
    inOrderFields: fieldNames,
    css,
    isCloze,
    cardTemplates: [
      {
        Name: 'Card 1',
        Front: isCloze ? `{{cloze:${first}}}` : `{{${first}}}`,
        Back: isCloze ? `{{cloze:${first}}}<hr id=answer>{{${rest[0] ?? first}}}` : back,
      },
    ],
  })
}

export interface SyncResult {
  added: number
  duplicates: number
  total: number
  deckName: string
}

/**
 * Push selected cards into Anki.
 *
 * Notes that already exist come back as null ids rather than erroring, so a
 * partial re-sync adds only what's new instead of failing outright.
 *
 * When `mapping` is present (template built from an existing Anki note type)
 * each Anki field is composed from its mapped sources - a field can hold
 * several, e.g. ["prompt", "image"] for a front that shows both. The slide
 * image goes to any field mapped to "image", else the back field. Without a
 * mapping, fields are filled by name from card.fields and the slide image is
 * prepended to the front.
 */
export async function syncToAnki(opts: {
  cards: any[]
  generationId: string
  deckName: string
  modelName: string
  fieldNames: string[]
  css?: string
  isCloze?: boolean
  tags?: string[]
  mapping?: Record<string, string | string[]>
  ankiFields?: string[]
}): Promise<SyncResult> {
  const {
    cards,
    generationId,
    deckName,
    modelName,
    fieldNames,
    css = '',
    isCloze = false,
    mapping,
    ankiFields,
  } = opts
  const selected = cards.filter((c) => c.selected)
  if (selected.length === 0) throw new AnkiConnectError('No cards are selected.')

  // Canonical form: {anki field: [source, ...]}; also accepts the older
  // single-source {source: field} shape.
  const norm: Record<string, string[]> = {}
  if (mapping) {
    for (const [key, value] of Object.entries(mapping)) {
      if (Array.isArray(value) && value.length) norm[key] = value
      else if (value) norm[value as string] = [key]
    }
  }
  const mapped = Object.keys(norm).length > 0
  const fieldsInOrder = mapped
    ? ankiFields?.length
      ? ankiFields
      : Object.keys(norm)
    : fieldNames

  // Sources render in display order: the slide image first, then canonical.
  const SOURCE_ORDER = ['prompt', 'answer', 'formula', 'example question', 'solution', 'topic', 'extra']
  const orderedSources = (sources: string[]) => {
    const nonImage = sources.filter((s) => s !== 'image')
    nonImage.sort((a, b) => SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b))
    return sources.includes('image') ? ['image', ...nonImage] : nonImage
  }

  // Front field: one mapped to "prompt", else the note type's first field.
  const frontField = mapped
    ? Object.keys(norm).find((f) => norm[f].includes('prompt')) ?? fieldsInOrder[0]
    : fieldsInOrder.find((f) => f.toLowerCase() === 'prompt') ?? fieldsInOrder[0]
  // Slide image lands on a field mapped to "image", else the back.
  const imageField = mapped
    ? Object.keys(norm).find((f) => norm[f].includes('image')) ??
      Object.keys(norm).find((f) => norm[f].includes('answer') && f !== frontField) ??
      Object.keys(norm).find((f) => f !== frontField && norm[f].length) ??
      frontField
    : null

  await ensureModel(modelName, mapped ? fieldsInOrder : fieldNames, css, isCloze, mapped ? frontField : undefined)
  await anki.createDeck(deckName)
  const mediaFiles = await storeSlideMedia(selected, generationId)

  const notes: AnkiNote[] = selected.map((card) => {
    const fields: Record<string, string> = {}
    if (mapped) {
      for (const name of fieldsInOrder) {
        const parts: string[] = []
        for (const source of orderedSources(norm[name] ?? [])) {
          if (source === 'image') {
            const img = slideImageHtml(card, generationId, mediaFiles)
            if (img) parts.push(img)
          } else {
            // Escaped, unlike the <img> above, which is markup we author.
            const text = escapeField(card.fields?.[source])
            if (text) parts.push(text)
          }
        }
        // Unmapped image: still attach the slide, on the back field.
        if (
          imageField &&
          name === imageField &&
          !(norm[name] ?? []).includes('image')
        ) {
          const img = slideImageHtml(card, generationId, mediaFiles)
          if (img) parts.unshift(img)
        }
        fields[name] = parts.length > 1 ? parts.join('<br>') : (parts[0] ?? '')
      }
    } else {
      for (const name of fieldNames) {
        // Anki requires every field present, even when empty.
        fields[name] = escapeField(card.fields?.[name])
      }
      const filename =
        card.slide_index != null
          ? slideMediaFilename(generationId, card.slide_index)
          : null
      if (filename && mediaFiles.has(filename)) {
        fields[frontField] =
          `<img src="${filename}" style="max-width:100%; margin-bottom:8px">` +
          fields[frontField]
      }
    }
    return {
      deckName,
      modelName,
      fields,
      tags: opts.tags ?? ['notes2anki'],
      options: { allowDuplicate: false },
    }
  })

  const ids = await anki.addNotes(notes)
  const added = ids.filter((id) => id !== null).length
  return {
    added,
    duplicates: ids.length - added,
    total: ids.length,
    deckName,
  }
}
