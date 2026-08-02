export interface Provider {
  id: string
  name: string
  provider_type: string
  base_url: string | null
  key_set: boolean
  key_hint: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  models: ProviderModel[]
}

export interface ProviderModel {
  id: string
  model_id: string
  display_name: string | null
  is_custom: boolean
  supports_vision: boolean
}

export interface CardTemplate {
  id: string
  name: string
  note_type: string
  fields: FieldDef[]
  css: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface FieldDef {
  name: string
  label: string
  visible: boolean
}

export interface Generation {
  id: string
  title: string | null
  source_type: string
  source_filename: string | null
  source_text: string | null
  provider_id: string
  model_name: string
  template_id: string
  deck_name: string
  custom_prompt: string | null
  subject_context: string | null
  status: string
  phase: string | null
  total_slides: number
  completed_slides: number
  cards_generated: number
  error_message: string | null
  created_at: string
  completed_at: string | null
  cards: Card[]
}

export interface Card {
  id: string
  generation_id: string
  slide_index: number | null
  fields: Record<string, string>
  selected: boolean
  user_edited: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface UploadResult {
  filename: string
  stored_filename: string
  filepath: string
  size_bytes: number
  extension: string
  is_text_file: boolean
  already_processed: boolean
  processed_slides: number
}

export interface GenerateRequest {
  provider_id: string
  model_name: string
  template_id: string
  deck_name: string
  custom_prompt?: string
  subject_context?: string
  source_text?: string
  source_title?: string
  source_filename?: string
  dpi?: number
  max_workers?: number
  force?: boolean
}
