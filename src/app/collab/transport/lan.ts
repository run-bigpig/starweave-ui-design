import type { CollabAction, CollabActionReceiver, JoinCollabRoom } from './types'

const ACTION_MESSAGE = 1
const encoder = new TextEncoder()
const decoder = new TextDecoder()

type ControlMessage =
  | { type: 'welcome'; peerId: string; peers: string[] }
  | { type: 'peer-join'; peerId: string }
  | { type: 'peer-leave'; peerId: string }

function collaborationOrigin(): URL {
  const configured = new URLSearchParams(window.location.search).get('lan')
  const origin = new URL(configured ?? window.location.origin)
  if (!isPrivateHost(origin.hostname)) {
    throw new Error('局域网协作仅允许私有网络或本机地址')
  }
  return origin
}

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1' || hostname.startsWith('127.')) return true
  const octets = hostname.split('.').map(Number)
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) return false
  const [first, second] = octets
  return (
    first === 10 ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    (first === 100 && second !== undefined && second >= 64 && second <= 127)
  )
}

function encodeAction(namespace: string, target: string | undefined, data: Uint8Array): Uint8Array {
  const namespaceBytes = encoder.encode(namespace)
  const targetBytes = encoder.encode(target ?? '')
  if (namespaceBytes.byteLength > 255 || targetBytes.byteLength > 255) {
    throw new Error('协作消息标识过长')
  }
  const result = new Uint8Array(3 + namespaceBytes.byteLength + targetBytes.byteLength + data.byteLength)
  result[0] = ACTION_MESSAGE
  result[1] = namespaceBytes.byteLength
  result[2] = targetBytes.byteLength
  result.set(namespaceBytes, 3)
  result.set(targetBytes, 3 + namespaceBytes.byteLength)
  result.set(data, 3 + namespaceBytes.byteLength + targetBytes.byteLength)
  return result
}

function decodeAction(data: Uint8Array): { namespace: string; peerId: string; payload: Uint8Array } | null {
  if (data.byteLength < 3 || data[0] !== ACTION_MESSAGE) return null
  const namespaceLength = data[1] ?? 0
  const targetLength = data[2] ?? 0
  const payloadStart = 3 + namespaceLength + targetLength
  if (payloadStart > data.byteLength) return null
  return {
    namespace: decoder.decode(data.subarray(3, 3 + namespaceLength)),
    peerId: decoder.decode(data.subarray(3 + namespaceLength, payloadStart)),
    payload: data.subarray(payloadStart)
  }
}

export const joinLanCollabRoom: JoinCollabRoom = (roomId) => {
  if (!/^[a-z0-9]{24}$/u.test(roomId)) throw new Error('无效的局域网协作会话')
  const origin = collaborationOrigin()
  origin.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:'
  origin.pathname = `/collaboration/${roomId}`
  origin.search = ''
  origin.hash = ''

  const socket = new WebSocket(origin)
  socket.binaryType = 'arraybuffer'
  const receivers = new Map<string, Set<CollabActionReceiver>>()
  const joinHandlers = new Set<(peerId: string) => void>()
  const leaveHandlers = new Set<(peerId: string) => void>()

  socket.onmessage = (event) => {
    if (typeof event.data === 'string') {
      let message: ControlMessage
      try {
        message = JSON.parse(event.data) as ControlMessage
      } catch {
        return
      }
      if (message.type === 'welcome') {
        for (const peerId of message.peers) for (const handler of joinHandlers) handler(peerId)
      } else if (message.type === 'peer-join') {
        for (const handler of joinHandlers) handler(message.peerId)
      } else if (message.type === 'peer-leave') {
        for (const handler of leaveHandlers) handler(message.peerId)
      }
      return
    }
    const message = decodeAction(new Uint8Array(event.data as ArrayBuffer))
    if (!message) return
    for (const handler of receivers.get(message.namespace) ?? []) {
      handler(message.payload, message.peerId)
    }
  }

  return {
    makeAction(namespace): CollabAction {
      return [
        (data, peerId) => {
          if (socket.readyState === WebSocket.OPEN) socket.send(encodeAction(namespace, peerId, data))
        },
        (handler) => {
          const handlers = receivers.get(namespace) ?? new Set<CollabActionReceiver>()
          handlers.add(handler)
          receivers.set(namespace, handlers)
        }
      ]
    },
    onPeerJoin: (handler) => joinHandlers.add(handler),
    onPeerLeave: (handler) => leaveHandlers.add(handler),
    leave: async () => {
      if (socket.readyState < WebSocket.CLOSING) socket.close(1000, 'left room')
    }
  }
}
