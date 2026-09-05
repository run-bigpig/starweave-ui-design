import type { Editor, EditorState } from '@open-pencil/core/editor'
import { exportFigFile } from '@open-pencil/core/io/formats/fig'

import { createAutosave } from '@/app/document/autosave'
import {
  documentNameFromFigPath,
  downloadNameFromPath,
  figDownloadName
} from '@/app/document/io/names'
import { createSaveActions } from '@/app/document/io/save'
import { createDocumentSourceState } from '@/app/document/io/source-state'
import type { DocumentSourceAccess } from '@/app/document/io/types'
import { createDocumentRecovery } from '@/app/document/recovery'
import { recoveryEnabled } from '@/app/document/recovery/preferences'
import type { StorageDocumentBinding } from '@/app/integrations/storage/types'
import { workspaceWriteURL, type WorkspaceFileBinding } from '@/app/document/io/workspace'

type DocumentSourceState = EditorState & {
  documentName: string
  autosaveEnabled: boolean
}

export { createDocumentSourceState }

type DocumentSourceOptions = DocumentSourceAccess & {
  editor: Editor
  state: DocumentSourceState
  stopWatchingFile: () => void
  startWatchingFile: () => Promise<void>
  getRenderer: () => Editor['renderer']
}

export function createDocumentSourceActions({
  getWorkspaceBinding,
  setWorkspaceBinding,
  editor,
  state,
  stopWatchingFile,
  startWatchingFile,
  getFileHandle,
  setFileHandle,
  getFilePath,
  setFilePath,
  getDownloadName,
  setDownloadName,
  getStorageBinding,
  setStorageBinding,
  setSourceIdentity,
  getSavedVersion,
  setSavedVersion,
  setLastWriteTime,
  getRenderer
}: DocumentSourceOptions) {
  function buildFigFile() {
    const renderer = getRenderer()
    return exportFigFile(editor.graph, renderer?.ck, renderer ?? undefined, state.currentPageId)
  }

  function buildRecoveryFigFile() {
    return exportFigFile(editor.graph, undefined, undefined, state.currentPageId)
  }

  const recovery = createDocumentRecovery({
    state,
    isEnabled: () => recoveryEnabled.value,
    buildFigFile: buildRecoveryFigFile,
    hasWritableSource: () => !!getWorkspaceBinding() || !!getFileHandle() || !!getFilePath() || !!getStorageBinding()
  })

  const { saveFigFile, saveFigFileAs, writeFile } = createSaveActions({
    getWorkspaceBinding,
    setWorkspaceBinding,
    state,
    buildFigFile,
    getFilePath,
    setFilePath,
    getFileHandle,
    setFileHandle,
    getDownloadName,
    setDownloadName,
    getStorageBinding,
    setStorageBinding,
    setSourceIdentity,
    setSavedVersion,
    setLastWriteTime,
    startWatchingFile: () => {
      void startWatchingFile()
    },
    onWriteSuccess: (version) => recovery.markProtectedVersion(version),
    onDownloadSuccess: (version) => recovery.markProtectedVersion(version)
  })

  let workspaceSaveTail = Promise.resolve()
  let createPendingWorkspace: (() => Promise<WorkspaceFileBinding>) | undefined
  let workspaceGeneration = 0
  function saveCurrentFigFile(): Promise<void> {
    if (!getWorkspaceBinding()) return saveFigFile()
    const generation = workspaceGeneration
    const operation = workspaceSaveTail.catch(() => undefined).then(async () => {
      if (generation !== workspaceGeneration || !getWorkspaceBinding()) return
      if (createPendingWorkspace) {
        try {
          const binding = await createPendingWorkspace()
          if (generation !== workspaceGeneration || !getWorkspaceBinding()) return
          setWorkspaceBinding(binding)
          createPendingWorkspace = undefined
        } catch (error) {
          const binding = getWorkspaceBinding()
          if (binding) binding.error = error instanceof Error ? error.message : String(error)
          throw error
        }
      }
      await saveFigFile()
    })
    workspaceSaveTail = operation
    return operation
  }

  async function saveFigFileToURL(uploadURL: string) {
    const version = state.sceneVersion
    const data = await buildFigFile()
    const response = await fetch(uploadURL, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: data
    })
    if (!response.ok) {
      const message = await response.text()
      throw new Error(`StarWeave desktop save failed (${response.status}): ${message}`)
    }
    setLastWriteTime(Date.now())
    setSavedVersion(version)
    await recovery.markProtectedVersion(version)
  }

  const autosave = createAutosave({
    state,
    getSavedVersion,
    hasWritableSource: () => !!getWorkspaceBinding() || !!getFileHandle() || !!getFilePath() || !!getStorageBinding(),
    saveCurrentDocument: async (version) => {
      if (getWorkspaceBinding()) { await saveCurrentFigFile(); return }
      const data = await buildFigFile()
      await writeFile(data, version)
    }
  })

  function setDocumentSource(
    fileName: string,
    sourceFormat: string,
    handle?: FileSystemFileHandle,
    path?: string
  ) {
    workspaceGeneration++
    createPendingWorkspace = undefined
    stopWatchingFile()
    setWorkspaceBinding(null)
    setStorageBinding(null)
    const isFig = sourceFormat === 'fig'
    setFileHandle(isFig ? (handle ?? null) : null)
    setFilePath(isFig ? (path ?? null) : null)
    setDownloadName(figDownloadName(fileName, sourceFormat))
    setSourceIdentity({ handle: handle ?? null, path: path ?? null })
    setSavedVersion(state.sceneVersion)
    void recovery.markProtectedVersion(state.sceneVersion)
    if (isFig && (handle || path)) {
      void startWatchingFile()
    }
  }

  function setStorageDocumentSource(binding: StorageDocumentBinding, documentName: string) {
    workspaceGeneration++
    createPendingWorkspace = undefined
    setWorkspaceBinding(null)
    stopWatchingFile()
    setFileHandle(null)
    setFilePath(null)
    setDownloadName(`${documentName}.fig`)
    setSourceIdentity({ handle: null, path: null })
    setStorageBinding(binding)
    state.documentName = documentName
    state.autosaveEnabled = true
    setSavedVersion(state.sceneVersion)
    void recovery.markProtectedVersion(state.sceneVersion)
  }

  function setPlannedFilePath(path: string) {
    workspaceGeneration++
    createPendingWorkspace = undefined
    setWorkspaceBinding(null)
    stopWatchingFile()
    setStorageBinding(null)
    setFileHandle(null)
    setFilePath(path)
    const downloadName = downloadNameFromPath(path)
    setDownloadName(downloadName)
    state.documentName = documentNameFromFigPath(downloadName)
  }

  function startWatchingCurrentFile() {
    void startWatchingFile()
  }

  async function setWorkspaceDocumentSource(binding: WorkspaceFileBinding, create = false) {
    await workspaceSaveTail.catch(() => undefined)
    workspaceGeneration++
    createPendingWorkspace = undefined
    workspaceWriteURL(binding.writeURL)
    stopWatchingFile()
    setFileHandle(null)
    setFilePath(null)
    setStorageBinding(null)
    setWorkspaceBinding({ ...binding, savedVersion: getSavedVersion() })
    setSourceIdentity({ handle: null, path: null })
    state.documentName = documentNameFromFigPath(binding.path.split('/').pop() ?? 'Untitled.fig')
    state.autosaveEnabled = true
    // Materialize a new empty document immediately; later edits use normal autosave.
    if (create) await saveCurrentFigFile()
  }

  async function createWorkspaceDocumentSource(create: () => Promise<WorkspaceFileBinding>) {
    workspaceGeneration++
    createPendingWorkspace = create
    setWorkspaceBinding({ documentId: '', path: '新建工作区文档', writeURL: '', savedVersion: -1 })
    state.autosaveEnabled = true
    await saveCurrentFigFile()
  }

  function disposeDocumentIO() {
    workspaceGeneration++
    stopWatchingFile()
    autosave.disposeAutosave()
    recovery.disposeRecovery()
  }

  return {
    setWorkspaceDocumentSource,
    createWorkspaceDocumentSource,
    setDocumentSource,
    setStorageDocumentSource,
    setPlannedFilePath,
    startWatchingCurrentFile,
    disposeDocumentIO,
    saveFigFile: saveCurrentFigFile,
    saveFigFileAs,
    saveFigFileToURL,
    getStorageBinding,
    getRecoveryId: () => recovery.getRecoveryId(),
    adoptRecoverySnapshot: (id: string, version: number) =>
      recovery.adoptRecoverySnapshot(id, version),
    persistRecoveryNow: () => recovery.persistNow(),
    discardRecovery: () => recovery.discardRecovery()
  }
}
