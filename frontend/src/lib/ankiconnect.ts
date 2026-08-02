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

export class AnkiConnectError extends Error {}

async function invoke<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(ANKI_CONNECT_URL, {
      method: 'POST',
      // No custom headers: adding any would trigger a CORS preflight that
      // AnkiConnect does not answer.
      body: JSON.stringify({ action, version: ANKI_CONNECT_VERSION, params }),
    })
  } catch {
    throw new AnkiConnectError(
      'Could not reach Anki. Make sure Anki is running with the AnkiConnect ' +
        'add-on installed, and that this page\'s address is listed in ' +
        'AnkiConnect\'s webCorsOriginList setting.'
    )
  }

  const payload = await res.json()
  if (payload.error) throw new AnkiConnectError(payload.error)
  return payload.result as T
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
  isCloze: boolean
): Promise<void> {
  const existing = await anki.modelNames()
  if (existing.includes(modelName)) return

  const [first, ...rest] = fieldNames
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
}): Promise<SyncResult> {
  const {
    cards,
    generationId,
    deckName,
    modelName,
    fieldNames,
    css = '',
    isCloze = false,
  } = opts
  const selected = cards.filter((c) => c.selected)
  if (selected.length === 0) throw new AnkiConnectError('No cards are selected.')

  await ensureModel(modelName, fieldNames, css, isCloze)
  await anki.createDeck(deckName)
  const mediaFiles = await storeSlideMedia(selected, generationId)

  const frontIndex = Math.max(
    0,
    fieldNames.findIndex((f) => f.toLowerCase() === 'prompt')
  )

  const notes: AnkiNote[] = selected.map((card) => {
    const fields: Record<string, string> = {}
    for (const name of fieldNames) {
      // Anki requires every field present, even when empty.
      fields[name] = String(card.fields?.[name] ?? '')
    }
    const filename =
      card.slide_index != null
        ? slideMediaFilename(generationId, card.slide_index)
        : null
    if (filename && mediaFiles.has(filename)) {
      fields[fieldNames[frontIndex]] =
        `<img src="${filename}" style="max-width:100%; margin-bottom:8px">` +
        fields[fieldNames[frontIndex]]
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
