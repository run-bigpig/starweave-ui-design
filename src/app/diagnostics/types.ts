export type DiagnosticCategory =
  | 'document'
  | 'renderer'
  | 'storage'
  | 'sync'
  | 'recovery'
  | 'performance'
  | 'runtime'

export type DiagnosticLevel = 'debug' | 'info' | 'warning' | 'error'
export type DiagnosticValue = string | number | boolean | null
export type DiagnosticAttributes = Readonly<Record<string, DiagnosticValue>>

export type DiagnosticEvent = {
  id: string
  timestamp: number
  category: DiagnosticCategory
  level: DiagnosticLevel
  name: string
  sessionId?: string
  runId?: string
  durationMs?: number
  attributes: DiagnosticAttributes
}

export type DiagnosticEventInput = Omit<DiagnosticEvent, 'id' | 'timestamp'> & {
  timestamp?: number
}
