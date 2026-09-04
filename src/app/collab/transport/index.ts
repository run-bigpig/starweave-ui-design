import { appRuntimeConfig } from '@/app/runtime/config'

import { joinLanCollabRoom } from './lan'
import { joinTestCollabRoom } from './test'
import type { JoinCollabRoom } from './types'

function usesTestTransport(): boolean {
  return import.meta.env.DEV && appRuntimeConfig.collaborationTransport === 'test'
}

export const joinCollabRoom: JoinCollabRoom = (roomId) =>
  usesTestTransport() ? joinTestCollabRoom(roomId) : joinLanCollabRoom(roomId)

export type { CollabRoomTransport, JoinCollabRoom } from './types'
