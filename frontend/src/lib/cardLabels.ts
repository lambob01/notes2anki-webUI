export const CARD_FIELD_LABELS: Record<string, string> = {
  prompt: 'Front / Prompt',
  answer: 'Back / Answer',
  formula: 'Formula',
  'example question': 'Example Question',
  solution: 'Solution',
  topic: 'Topic',
  extra: 'Extra',
}

export function cardFieldLabel(key: string): string {
  return CARD_FIELD_LABELS[key] ?? key
}
