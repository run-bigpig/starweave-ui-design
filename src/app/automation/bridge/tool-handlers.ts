import { renderTreeNode } from '@open-pencil/core/design-jsx'
import type { FigmaAPI } from '@open-pencil/core/figma-api'
import { ALL_TOOLS, registerComponentCatalog } from '@open-pencil/core/tools'
import type { JSONObject } from '@open-pencil/scene-graph/primitives'

import type { AutomationTarget } from '@/app/automation/bridge/target'
import { ensureGraphFonts } from '@/app/editor/fonts'
import { useLibraryService } from '@/app/libraries'

type FigmaFactory = (store: AutomationTarget['store'], pageId?: string) => FigmaAPI

export function createAutomationToolHandler(makeFigma: FigmaFactory) {
  async function handleToolRender(
    target: AutomationTarget,
    toolArgs: Record<string, unknown>
  ): Promise<unknown> {
    const store = target.store
    const tree = toolArgs.tree as Parameters<typeof renderTreeNode>[1]
    const activeIds = beginVisibleEdit(store, extractArgumentNodeIds(store, toolArgs))
    let result
    try {
      result = await store.runMutationWithLayout(
        () =>
          renderTreeNode(store.graph, tree, {
            parentId: (toolArgs.parent_id as string | undefined) ?? target.pageId,
            x: toolArgs.x as number | undefined,
            y: toolArgs.y as number | undefined
          }),
        target.pageId,
        async (node) => {
          await ensureGraphFonts(store.graph, [node.id], store.renderer)
        }
      )
    } catch (error) {
      cancelVisibleEdit(store)
      throw error
    }
    finishVisibleEdit(store, activeIds, [result.id])
    return {
      ok: true,
      result: { id: result.id, name: result.name, type: result.type, children: result.childIds }
    }
  }

  return async function handleTool(target: AutomationTarget, args: unknown): Promise<unknown> {
    const toolName = (args as { name?: string }).name
    const toolArgs = (args as { args?: Record<string, unknown> }).args ?? {}
    if (!toolName) throw new Error('Missing "name" in args')

    if (toolName === 'render' && toolArgs.tree) {
      return handleToolRender(target, toolArgs)
    }

    const def = ALL_TOOLS.find((t) => t.name === toolName)
    if (!def) throw new Error(`Unknown tool: ${toolName}`)
    const store = target.store
    const libraryService = useLibraryService()
    libraryService.bindEditor(store)
    registerComponentCatalog(store.graph, libraryService)
    const figma = makeFigma(store, target.pageId)
    const changesDocument = def.changesDocument ?? def.mutates ?? false
    const activeIds = changesDocument
      ? beginVisibleEdit(store, extractArgumentNodeIds(store, toolArgs))
      : []
    let result
    try {
      result = def.mutates
        ? await store.runMutationWithLayout(
            () => def.execute(figma, toolArgs),
            figma.currentPageId,
            async () => {
              const pageNode = store.graph.getNode(figma.currentPageId)
              if (pageNode) await ensureGraphFonts(store.graph, pageNode.childIds, store.renderer)
            }
          )
        : await def.execute(figma, toolArgs)
      await synchronizeViewTool(store, figma, toolName, toolArgs)
    } catch (error) {
      if (changesDocument) cancelVisibleEdit(store)
      throw error
    }

    if (changesDocument) finishVisibleEdit(store, activeIds, extractNodeIds(result))
    return { ok: true, result }
  }
}

type EditorStore = AutomationTarget['store']

function beginVisibleEdit(store: EditorStore, nodeIds: string[]): string[] {
  const ids = existingNodeIds(store, nodeIds)
  if (ids.length === 0) return ids
  store.select(ids)
  store.zoomToSelection()
  store.aiMarkActive(ids)
  store.requestRender()
  return ids
}

function finishVisibleEdit(store: EditorStore, activeIds: string[], resultIds: string[]): void {
  if (activeIds.length > 0) store.aiMarkDone(activeIds)
  const focusIds = existingNodeIds(store, resultIds)
  if (focusIds.length > 0) {
    store.select(focusIds)
    store.zoomToSelection()
    const active = new Set(activeIds)
    store.aiFlashDone(focusIds.filter((id) => !active.has(id)))
    store.flashNodes(focusIds)
  }
  store.requestRender()
}

function cancelVisibleEdit(store: EditorStore): void {
  store.aiClearAll()
  store.requestRender()
}

async function synchronizeViewTool(
  store: EditorStore,
  figma: FigmaAPI,
  toolName: string,
  toolArgs: Record<string, unknown>
): Promise<void> {
  if (toolName === 'switch_page' && figma.currentPageId !== store.state.currentPageId) {
    await store.switchPage(figma.currentPageId)
    return
  }
  if (toolName === 'select_nodes') {
    const ids = existingNodeIds(
      store,
      figma.currentPage.selection.map((node) => node.id)
    )
    store.select(ids)
    if (ids.length > 0) store.zoomToSelection()
    store.requestRender()
    return
  }
  if (toolName === 'viewport_zoom_to_fit') {
    const ids = existingNodeIds(store, Array.isArray(toolArgs.ids) ? toolArgs.ids : [])
    if (ids.length > 0) {
      store.select(ids)
      store.zoomToSelection()
      store.requestRender()
    }
    return
  }
  if (toolName === 'viewport_set') {
    const viewport = figma.viewport
    store.state.zoom = viewport.zoom
    store.state.panX = window.innerWidth / 2 - viewport.center.x * viewport.zoom
    store.state.panY = window.innerHeight / 2 - viewport.center.y * viewport.zoom
    store.requestRender()
  }
}

function extractArgumentNodeIds(store: EditorStore, args: Record<string, unknown>): string[] {
  const ids: string[] = []
  for (const [name, value] of Object.entries(args)) {
    if ((name === 'id' || name.endsWith('_id')) && typeof value === 'string') ids.push(value)
    if ((name === 'ids' || name.endsWith('_ids')) && Array.isArray(value)) {
      ids.push(...value.filter((entry): entry is string => typeof entry === 'string'))
    }
  }
  if (typeof args.operations === 'string') {
    try {
      const operations = JSON.parse(args.operations) as unknown
      if (Array.isArray(operations)) {
        for (const operation of operations) {
          if (operation && typeof operation === 'object' && typeof (operation as JSONObject).id === 'string') {
            ids.push((operation as JSONObject).id as string)
          }
        }
      }
    } catch {
      // The tool returns the validation error; visual targeting is best effort.
    }
  }
  return existingNodeIds(store, ids)
}

function existingNodeIds(store: EditorStore, ids: readonly unknown[]): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string'))].filter((id) => {
    const node = store.graph.getNode(id)
    return node !== undefined && node.type !== 'CANVAS'
  })
}

function extractNodeIds(result: unknown): string[] {
  if (!result || typeof result !== 'object') return []
  const obj = result as JSONObject
  if (typeof obj.deleted === 'string') return []
  const ids: string[] = []
  if (typeof obj.id === 'string') ids.push(obj.id)
  for (const collection of [obj.results, obj.inserted]) {
    if (!Array.isArray(collection)) continue
    for (const item of collection) {
      if (item && typeof item === 'object' && typeof (item as JSONObject).id === 'string')
        ids.push((item as JSONObject).id as string)
    }
  }
  return ids
}
