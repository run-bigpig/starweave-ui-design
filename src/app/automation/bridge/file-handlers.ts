import {
  resolveAutomationTarget,
  responseWithTarget,
  type AutomationTarget
} from '@/app/automation/bridge/target'
import { resolveBrowserFileURL } from '@/app/document/io/browser'
import { openFileFromPath } from '@/app/shell/menu/use'
import { createTab, getActiveStore, openFileInNewTab } from '@/app/tabs'
import { isTauri } from '@/app/tauri/env'

export async function handleSaveFile(target: AutomationTarget, args: unknown): Promise<unknown> {
  const store = target.store
  // Workspace saves always target the trusted binding. A tool-supplied path
  // must not detach autosave or turn a successful save into a browser download.
  if (store.getWorkspaceBinding()) {
    await store.saveFigFile()
    return { ok: true }
  }
  const { path, starweave_upload_url: uploadURL } = args as {
    path?: string
    starweave_upload_url?: string
  }
  if (uploadURL) {
    const targetURL = new URL(uploadURL, window.location.origin)
    if (
      targetURL.origin !== window.location.origin ||
      !/^\/design-save\/[-_A-Za-z0-9]{43}$/u.test(targetURL.pathname) ||
      targetURL.search ||
      targetURL.hash
    ) {
      throw new Error('Invalid StarWeave desktop save upload URL')
    }
    await store.saveFigFileToURL(targetURL.href)
    return { ok: true }
  }
  if (path) {
    store.setPlannedFilePath(path)
    await ensureTauriParentDirectory(path)
  }
  await store.saveFigFile()
  if (path) store.startWatchingCurrentFile()
  return { ok: true }
}

export async function ensureTauriParentDirectory(path: string): Promise<void> {
  if (!isTauri()) return
  const [{ dirname }, { mkdir }] = await Promise.all([
    import('@tauri-apps/api/path'),
    import('@tauri-apps/plugin-fs')
  ])
  const dir = await dirname(path)
  if (dir === path) return
  await mkdir(dir, { recursive: true })
}

export async function handleNewDocument(
  _target: AutomationTarget,
  args: unknown
): Promise<unknown> {
  const path = (args as { path?: string }).path
  const tab = createTab()
  if (path) {
    tab.store.setPlannedFilePath(path)
    await ensureTauriParentDirectory(path)
    await tab.store.saveFigFile()
    tab.store.startWatchingCurrentFile()
  }
  const target = resolveAutomationTarget(tab.store, { document_id: tab.id })
  return responseWithTarget({ ok: true, result: { created: true } }, target)
}

export async function handleOpenFile(target: AutomationTarget, args: unknown): Promise<unknown> {
  const {
    path,
    name,
    starweave_download_url: downloadURL
  } = args as {
    path?: string
    name?: string
    starweave_download_url?: string
  }
  if (downloadURL) {
    const targetURL = new URL(downloadURL, window.location.origin)
    if (
      targetURL.origin !== window.location.origin ||
      !/^\/design-open\/[-_A-Za-z0-9]{43}$/u.test(targetURL.pathname) ||
      targetURL.search ||
      targetURL.hash
    ) {
      throw new Error('Invalid StarWeave desktop design URL')
    }
    const response = await fetch(targetURL, { method: 'POST' })
    if (!response.ok) throw new Error(`Failed to restore design file: ${response.statusText}`)
    const fileName = name?.toLowerCase().endsWith('.fig') ? name : 'Recovered.fig'
    await openFileInNewTab(new File([await response.blob()], fileName), undefined, undefined, target.store)
    const openedTarget = resolveAutomationTarget(target.store, undefined)
    return responseWithTarget(
      { ok: true, result: { opened: true, restored: true } },
      openedTarget
    )
  }
  if (!path) throw new Error('Missing "path" in args')
  let openedStore = target.store
  if (isTauri()) {
    await openFileFromPath(path)
    openedStore = getActiveStore()
  } else {
    const resourceURL = resolveBrowserFileURL(path)
    const response = await fetch(resourceURL)
    if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`)
    const name = resourceURL.pathname.split('/').pop() ?? 'file.fig'
    const file = new File([await response.blob()], name)
    await openFileInNewTab(file, undefined, resourceURL.href, target.store)
  }
  const openedTarget = resolveAutomationTarget(openedStore, undefined)
  return responseWithTarget({ ok: true, result: { opened: true } }, openedTarget)
}
