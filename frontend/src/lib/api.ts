// The SPA is served by the same FastAPI process that serves /api, so every
// request is same-origin and needs no host prefix. In dev, vite proxies /api.
const BASE_URL = ''

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || err.message || 'Request failed')
  }
  return res.json()
}

export const api = {
  providers: {
    list: () => request<any[]>('/api/providers'),
    create: (data: any) => request<any>('/api/providers', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => request<any>(`/api/providers/${id}`),
    update: (id: string, data: any) => request<any>(`/api/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/api/providers/${id}`, { method: 'DELETE' }),
    test: (data: any) => request<any>('/api/providers/test', { method: 'POST', body: JSON.stringify(data) }),
    // Saved providers: the key never leaves the server, so the test runs there.
    testSaved: (id: string) => request<any>(`/api/providers/${id}/test`, { method: 'POST' }),
    fetchModels: (id: string) => request<any>(`/api/providers/${id}/models`, { method: 'POST' }),
    listModels: (id: string) => request<any[]>(`/api/providers/${id}/models`),
    addCustomModel: (id: string, data: any) => request<any>(`/api/providers/${id}/models/custom`, { method: 'POST', body: JSON.stringify(data) }),
    deleteModel: (providerId: string, modelId: string) => request<any>(`/api/providers/${providerId}/models/${modelId}`, { method: 'DELETE' }),
    presets: () => request<any>('/api/providers/presets'),
  },
  templates: {
    list: () => request<any[]>('/api/templates'),
    create: (data: any) => request<any>('/api/templates', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => request<any>(`/api/templates/${id}`),
    update: (id: string, data: any) => request<any>(`/api/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/api/templates/${id}`, { method: 'DELETE' }),
    defaults: () => request<any>('/api/templates/defaults'),
  },
  notes: {
    upload: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${BASE_URL}/api/notes/upload`, { method: 'POST', body: form })
      if (!res.ok) throw new Error('Upload failed')
      return res.json()
    },
  },
  generate: {
    start: (data: any) => request<any>('/api/generate', { method: 'POST', body: JSON.stringify(data) }),
    fromFile: (data: any) => request<any>('/api/generate/from-file', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => request<any>(`/api/generate/${id}`),
    list: () => request<any[]>('/api/generate'),
    delete: (id: string) => request<any>(`/api/generate/${id}`, { method: 'DELETE' }),
    clear: () => request<any>('/api/generate', { method: 'DELETE' }),
    // The rendered image of the slide a card was generated from (null
    // slide_index on text generations; may 404 for old jobs).
    slideUrl: (genId: string, slideIndex: number) =>
      `${BASE_URL}/api/generate/${genId}/slides/${slideIndex}`,
  },
  cards: {
    get: (id: string) => request<any>(`/api/cards/${id}`),
    update: (id: string, data: any) => request<any>(`/api/cards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/api/cards/${id}`, { method: 'DELETE' }),
    batchSelect: (cardIds: string[], selected: boolean) => request<any>('/api/cards/batch-select', { method: 'POST', body: JSON.stringify({ card_ids: cardIds, selected }) }),
  },
  export: {
    apkgUrl: (genId: string) => `${BASE_URL}/api/export/${genId}/apkg`,
    csvUrl: (genId: string) => `${BASE_URL}/api/export/${genId}/csv`,
  },
}
