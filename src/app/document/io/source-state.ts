import type { DocumentSourceIdentity } from '@/app/document/io/types'
import type { StorageDocumentBinding } from '@/app/integrations/storage/types'
import type { WorkspaceFileBinding } from '@/app/document/io/workspace'
import { ref } from 'vue'

export function createDocumentSourceState() {
  let fileHandle: FileSystemFileHandle | null = null
  const workspaceBinding = ref<WorkspaceFileBinding | null>(null)
  let filePath: string | null = null
  let downloadName: string | null = null
  let sourceIdentity: DocumentSourceIdentity = { handle: null, path: null }
  let storageBinding: StorageDocumentBinding | null = null
  let savedVersion = 0
  let lastWriteTime = 0

  return {
    getWorkspaceBinding: () => workspaceBinding.value,
    setWorkspaceBinding: (binding: WorkspaceFileBinding | null) => { workspaceBinding.value = binding },
    getFileHandle: () => fileHandle,
    setFileHandle: (handle: FileSystemFileHandle | null) => {
      fileHandle = handle
    },
    getFilePath: () => filePath,
    setFilePath: (path: string | null) => {
      filePath = path
    },
    getDownloadName: () => downloadName,
    setDownloadName: (name: string | null) => {
      downloadName = name
    },
    getSourceIdentity: () => sourceIdentity,
    setSourceIdentity: (identity: DocumentSourceIdentity) => {
      sourceIdentity = identity
    },
    getStorageBinding: () => storageBinding,
    setStorageBinding: (binding: StorageDocumentBinding | null) => {
      storageBinding = binding
    },
    getSavedVersion: () => savedVersion,
    setSavedVersion: (version: number) => {
      savedVersion = version
    },
    getLastWriteTime: () => lastWriteTime,
    setLastWriteTime: (time: number) => {
      lastWriteTime = time
    }
  }
}
