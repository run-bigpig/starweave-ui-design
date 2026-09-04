/** Browser-side StarWeave automation bridge. */
import { readonly, ref } from 'vue'

import { makeFigmaFromStore } from '@/app/automation/bridge/figma-factory'
import { createAutomationCommandHandlers } from '@/app/automation/bridge/handlers'
import type { EditorStore } from '@/app/editor/active-store'
import { createTab, getTabById, getTabForStore, switchTab } from '@/app/tabs'

export type StarWeaveBridgePhase =
  | 'standalone'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

const phase = ref<StarWeaveBridgePhase>('standalone')
const detail = ref('本地独立模式')

export const starWeaveBridgeState = {
  phase: readonly(phase),
  detail: readonly(detail)
}

type ConnectionParameters = { sessionId: string; token: string }

type SessionConnection = ConnectionParameters & {
  store: EditorStore
  socket: WebSocket | null
  reconnectTimer?: ReturnType<typeof setTimeout>
  registered: boolean
}

function connectionParameters(): ConnectionParameters | null {
  const url = new URL(window.location.href)
  const sessionId = url.searchParams.get('session')
  const token = url.searchParams.get('token')
  if (!sessionId || !token) return null
  url.searchParams.delete('token')
  window.history.replaceState(null, '', url)
  return { sessionId, token }
}

export function connectStarWeaveAutomation(getStore: () => EditorStore): () => void {
  const initialConnection = connectionParameters()
  if (!initialConnection) return () => undefined

  let stopped = false
  const { handleRequest } = createAutomationCommandHandlers(makeFigmaFromStore)
  const sessions = new Map<string, SessionConnection>()

  const refreshStatus = (fallback: StarWeaveBridgePhase = 'disconnected') => {
    if ([...sessions.values()].some((session) => session.registered)) {
      phase.value = 'connected'
      detail.value = 'Agent 实时设计已连接'
      return
    }
    phase.value = fallback
    detail.value = fallback === 'error' ? '无法连接 StarWeave，正在重试…' : '连接已断开，正在重试…'
  }

  const revealSession = (sessionId: string) => {
    const session = sessions.get(sessionId)
    const tab = session ? getTabForStore(session.store) : undefined
    if (tab) switchTab(tab.id)
  }

  const connect = (session: SessionConnection) => {
    if (!sessions.has(session.sessionId) || stopped) return
    if (![...sessions.values()].some((candidate) => candidate.registered)) {
      phase.value = 'connecting'
      detail.value = '正在连接 StarWeave Agent…'
    }
    const bridgeURL = new URL('/bridge', window.location.origin)
    bridgeURL.protocol = bridgeURL.protocol === 'https:' ? 'wss:' : 'ws:'
    const current = new WebSocket(bridgeURL)
    session.socket = current

    current.onopen = () => {
      current.send(
        JSON.stringify({
          type: 'register',
          sessionId: session.sessionId,
          token: session.token
        })
      )
    }

    current.onmessage = async (event) => {
      let message: {
        type?: string
        id?: string
        command?: string
        args?: unknown
        sessionId?: string
        token?: string
      }
      try {
        message = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (message.type === 'registered') {
        session.registered = true
        refreshStatus()
        return
      }
      if (message.type === 'open-session' && message.sessionId && message.token) {
        let target = sessions.get(message.sessionId)
        if (!target) {
          const tab = createTab()
          target = startSession(
            { sessionId: message.sessionId, token: message.token },
            tab.store
          )
        }
        revealSession(target.sessionId)
        return
      }
      if (message.type === 'reveal-session' && message.sessionId) {
        revealSession(message.sessionId)
        return
      }
      if (message.type !== 'request' || !message.id || !message.command) return
      try {
        const result = await handleRequest(session.store, message.command, message.args)
        if ((message.command === 'open_file' || message.command === 'new_document') && isRecord(result)) {
          const target = isRecord(result.target) ? result.target : undefined
          const documentId = typeof target?.documentId === 'string' ? target.documentId : undefined
          const tab = documentId ? getTabById(documentId) : undefined
          if (tab) session.store = tab.store
        }
        const response = isRecord(result) ? result : { ok: true, result }
        if (current.readyState === WebSocket.OPEN) {
          current.send(JSON.stringify({ type: 'response', id: message.id, ...response }))
        }
      } catch (error) {
        if (current.readyState === WebSocket.OPEN) {
          current.send(
            JSON.stringify({
              type: 'response',
              id: message.id,
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            })
          )
        }
      }
    }

    current.onclose = (event) => {
      if (session.socket === current) session.socket = null
      session.registered = false
      if (stopped || event.code === 1000) return
      refreshStatus()
      clearTimeout(session.reconnectTimer)
      session.reconnectTimer = setTimeout(() => connect(session), 1500)
    }

    current.onerror = () => {
      refreshStatus('error')
      current.close()
    }
  }

  const startSession = (connection: ConnectionParameters, store: EditorStore): SessionConnection => {
    const existing = sessions.get(connection.sessionId)
    if (existing) return existing
    const session: SessionConnection = {
      ...connection,
      store,
      socket: null,
      registered: false
    }
    sessions.set(session.sessionId, session)
    connect(session)
    return session
  }

  startSession(initialConnection, getStore())
  return () => {
    stopped = true
    for (const session of sessions.values()) {
      clearTimeout(session.reconnectTimer)
      session.socket?.close(1000, 'workspace closed')
      session.socket = null
    }
    sessions.clear()
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
