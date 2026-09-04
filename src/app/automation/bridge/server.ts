/** Browser-side StarWeave automation bridge. */
import { readonly, ref } from 'vue'

import { makeFigmaFromStore } from '@/app/automation/bridge/figma-factory'
import { createAutomationCommandHandlers } from '@/app/automation/bridge/handlers'
import type { EditorStore } from '@/app/editor/active-store'

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

function connectionParameters(): { sessionId: string; token: string } | null {
  const url = new URL(window.location.href)
  const sessionId = url.searchParams.get('session')
  const token = url.searchParams.get('token')
  if (!sessionId || !token) return null
  url.searchParams.delete('token')
  window.history.replaceState(null, '', url)
  return { sessionId, token }
}

export function connectStarWeaveAutomation(getStore: () => EditorStore): () => void {
  const connection = connectionParameters()
  if (!connection) return () => undefined

  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const { handleRequest } = createAutomationCommandHandlers(makeFigmaFromStore)

  const scheduleReconnect = () => {
    if (stopped) return
    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, 1500)
  }

  const connect = () => {
    phase.value = 'connecting'
    detail.value = '正在连接 StarWeave Agent…'
    const bridgeURL = new URL('/bridge', window.location.origin)
    bridgeURL.protocol = bridgeURL.protocol === 'https:' ? 'wss:' : 'ws:'
    const current = new WebSocket(bridgeURL)
    socket = current

    current.onopen = () => {
      current.send(
        JSON.stringify({
          type: 'register',
          sessionId: connection.sessionId,
          token: connection.token
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
      }
      try {
        message = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (message.type === 'registered') {
        phase.value = 'connected'
        detail.value = 'Agent 实时设计已连接'
        return
      }
      if (message.type !== 'request' || !message.id || !message.command) return
      try {
        const result = await handleRequest(getStore(), message.command, message.args)
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
      if (socket === current) socket = null
      if (stopped || event.code === 1000) return
      phase.value = 'disconnected'
      detail.value = '连接已断开，正在重试…'
      scheduleReconnect()
    }

    current.onerror = () => {
      phase.value = 'error'
      detail.value = '无法连接 StarWeave，正在重试…'
      current.close()
    }
  }

  connect()
  return () => {
    stopped = true
    clearTimeout(reconnectTimer)
    socket?.close(1000, 'workspace closed')
    socket = null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
