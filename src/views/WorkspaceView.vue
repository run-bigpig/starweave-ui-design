<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useHead } from '@unhead/vue'
import { useRoute } from 'vue-router'

import { exposeCollaborationActions } from '@/app/browser-bridge'
import { appRuntimeConfig } from '@/app/runtime/config'
import { connectStarWeaveAutomation } from '@/app/automation/bridge/server'
import { COLLAB_KEY, useCollab } from '@/app/collab/use'
import { createDemoShapes } from '@/app/demo/document'
import { useKeyboard } from '@/app/shell/keyboard/use'
import { openFileFromPath, useEditorMenu } from '@/app/shell/menu/use'
import {
  activeTab,
  createDocumentInCurrentTab,
  createHomeTab,
  createTab,
  getActiveStore,
  getTabsSnapshot,
  tabCount
} from '@/app/tabs'
import { isTauri } from '@/app/tauri/env'
import FontStatusBanner from '@/components/font-status/FontStatusBanner.vue'
import CommandPalette from '@/components/commands/CommandPalette.vue'
import SafariBanner from '@/components/SafariBanner.vue'
import TabBar from '@/components/TabBar.vue'
import RenameSelectionDialog from '@/components/selection/RenameSelectionDialog.vue'
import EditorWorkspace from '@/components/editor/EditorWorkspace.vue'
import HomeWorkspace from '@/components/home/HomeWorkspace.vue'

const route = useRoute()
const workspaceFile = computed(() => activeTab.value?.store.getWorkspaceBinding())
const workspaceSaveStatus = computed(() => {
  const file = workspaceFile.value
  if (!file) return ''
  if (file.error) return file.error
  if (file.saving) return '正在保存…'
  return (file.savedVersion ?? -1) < (activeTab.value?.store.state.sceneVersion ?? 0) ? '有未保存更改' : '已保存到工作区'
})

function retryWorkspaceSave() {
  void activeTab.value?.store.saveFigFile().catch(() => undefined)
}
const createdInitialTab = tabCount() === 0
const shouldCreateHome =
  route.path === '/' &&
  !appRuntimeConfig.test &&
  !route.meta.demo &&
  (isTauri() || appRuntimeConfig.recentFiles)
let firstTab = activeTab.value
if (!firstTab) firstTab = shouldCreateHome ? createHomeTab() : createTab()

if (createdInitialTab && route.meta.demo && !appRuntimeConfig.test) {
  void createDemoShapes(firstTab.store)
}

useHead({ title: route.meta.demo ? 'Demo' : undefined })
useKeyboard()
useEditorMenu()

useEventListener(window, 'beforeunload', (event: BeforeUnloadEvent) => {
  const unsaved = getTabsSnapshot().some(tab => {
    const binding = tab.store.getWorkspaceBinding()
    return binding && (binding.error || binding.saving || (binding.savedVersion ?? -1) < tab.store.state.sceneVersion)
  })
  if (unsaved) {
    event.preventDefault()
    event.returnValue = ''
  }
})

const collab = useCollab(getActiveStore)
provide(COLLAB_KEY, collab)
exposeCollaborationActions(collab)

useEventListener(
  document,
  'wheel',
  (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault()
  },
  { passive: false }
)

const fileAssociationCleanup = ref<(() => void) | null>(null)
let disconnectAutomation: (() => void) | undefined

interface PendingOpenFile {
  path: string
}

async function openPendingAssociatedFiles(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  const files = await invoke<PendingOpenFile[]>('take_pending_open')
  for (const file of files) await openFileFromPath(file.path)
}

async function bindAssociatedFileOpen(): Promise<void> {
  if (!isTauri()) return
  const { listen } = await import('@tauri-apps/api/event')
  fileAssociationCleanup.value = await listen('open-associated-files', () => {
    void openPendingAssociatedFiles().catch((error) => console.error('[Open With]', error))
  })
  await openPendingAssociatedFiles()
}

onMounted(async () => {
  disconnectAutomation = connectStarWeaveAutomation(getActiveStore)

  try {
    await bindAssociatedFileOpen()
  } catch (error) {
    console.error('[Open With]', error)
  }
})

onUnmounted(() => {
  disconnectAutomation?.()
  fileAssociationCleanup.value?.()
})
</script>

<template>
  <div data-test-id="editor-root" class="flex h-screen w-screen flex-col">
    <SafariBanner />
    <FontStatusBanner />
    <RenameSelectionDialog />
    <CommandPalette />
    <TabBar />
    <div v-if="workspaceFile" class="flex items-center gap-2 px-3 py-1 text-xs" role="status" aria-live="polite">
      <span>{{ workspaceFile.path }} · {{ workspaceSaveStatus }}</span>
      <button v-if="workspaceFile.error" type="button" class="underline" @click="retryWorkspaceSave">重试保存</button>
    </div>
    <HomeWorkspace v-show="activeTab?.kind === 'home'" @new-document="createDocumentInCurrentTab" />
    <EditorWorkspace v-if="activeTab?.kind !== 'home'" />
  </div>
</template>
