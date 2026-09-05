export type WorkspaceFileBinding = {
  documentId: string
  path: string
  writeURL: string
  savedVersion?: number
  saving?: boolean
  error?: string
}

type WorkspaceCreator = (parent: WorkspaceFileBinding, tabId: string) => Promise<WorkspaceFileBinding>
let createDocument: WorkspaceCreator | undefined
export function setWorkspaceDocumentCreator(creator: WorkspaceCreator | undefined) { createDocument = creator }
export async function createWorkspaceDocument(parent: WorkspaceFileBinding, tabId: string) {
  if (!createDocument) throw new Error('工作区连接不可用，请重新打开设计窗口')
  return createDocument(parent, tabId)
}

export function workspaceWriteURL(value: string): string {
  const url = new URL(value, window.location.origin)
  if (url.origin !== window.location.origin || !/^\/design-workspace\/[-_A-Za-z0-9]{43}$/u.test(url.pathname) || url.search || url.hash) {
    throw new Error('Invalid StarWeave workspace write URL')
  }
  return url.href
}

export async function writeWorkspaceFile(binding: WorkspaceFileBinding, data: Uint8Array) {
  binding.saving = true
  binding.error = undefined
  try {
    const response = await fetch(workspaceWriteURL(binding.writeURL), {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: new Uint8Array(data)
    })
    if (!response.ok) throw new Error(`工作区文件保存失败 (${response.status}): ${await response.text()}`)
  } catch (error) {
    binding.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    binding.saving = false
  }
}
