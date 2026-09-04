import type { DiagnosticEvent } from './types'

export type DiagnosticEventSummary = {
  category: string
  label: string
  level: DiagnosticEvent['level']
  timestamp: number
}

const labelKeys: Record<string, string> = {
  'storage.operation.failed': 'diagnosticsStorageFailed',
  'document.operation.failed': 'diagnosticsDocumentFailed'
}

export function summarizeDiagnosticEvent(
  event: DiagnosticEvent,
  labels: Partial<Record<string, unknown>>
): DiagnosticEventSummary {
  const labelKey = labelKeys[event.name]
  const localizedLabel = labelKey ? labels[labelKey] : undefined
  const fallback = labels.diagnosticsTechnicalEvent
  let label = 'Technical event'
  if (typeof fallback === 'string') label = fallback
  if (typeof localizedLabel === 'string') label = localizedLabel
  return { category: event.category, label, level: event.level, timestamp: event.timestamp }
}
