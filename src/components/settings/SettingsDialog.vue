<script setup lang="ts">
import { DialogClose } from 'reka-ui'
import { useI18n } from '@open-pencil/vue'

import { settingsDialogOpen, settingsDialogSection } from '@/app/settings/dialog'
import DiagnosticsSettingsPanel from '@/components/settings/diagnostics/DiagnosticsSettingsPanel.vue'
import GeneralSettingsPanel from '@/components/settings/general/GeneralSettingsPanel.vue'
import StorageSettingsPanel from '@/components/settings/storage/StorageSettingsPanel.vue'
import { AppDialogFooter, AppDialogHeader, AppDialogRoot } from '@/components/ui/dialog'

const { settings, common } = useI18n()
const navigationClass =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted transition-colors hover:bg-hover hover:text-surface data-[state=active]:bg-hover data-[state=active]:text-surface'
</script>

<template>
  <AppDialogRoot
    :open="settingsDialogOpen"
    size="lg"
    height="tall"
    data-test-id="app-settings-dialog"
    @update:open="settingsDialogOpen = $event"
  >
    <AppDialogHeader
      :heading="settings.title"
      :description="settings.description"
      :close-label="common.close"
    />

    <div class="flex min-h-0 flex-1">
      <nav class="w-40 shrink-0 border-r border-border p-2" :aria-label="settings.title">
        <button
          type="button"
          :class="navigationClass"
          :data-state="settingsDialogSection === 'general' ? 'active' : 'inactive'"
          @click="settingsDialogSection = 'general'"
        >
          <icon-lucide-settings class="size-3.5" />
          {{ settings.general }}
        </button>
        <button
          type="button"
          :class="navigationClass"
          :data-state="settingsDialogSection === 'diagnostics' ? 'active' : 'inactive'"
          @click="settingsDialogSection = 'diagnostics'"
        >
          <icon-lucide-activity class="size-3.5" />
          {{ settings.diagnostics }}
        </button>
        <button
          type="button"
          :class="navigationClass"
          :data-state="settingsDialogSection === 'storage' ? 'active' : 'inactive'"
          @click="settingsDialogSection = 'storage'"
        >
          <icon-lucide-cloud class="size-3.5" />
          {{ settings.storage }}
        </button>
      </nav>

      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <GeneralSettingsPanel v-if="settingsDialogSection === 'general'" />
        <DiagnosticsSettingsPanel v-else-if="settingsDialogSection === 'diagnostics'" />
        <StorageSettingsPanel v-else />
      </div>
    </div>

    <AppDialogFooter>
      <DialogClose as-child>
        <button
          type="button"
          class="rounded bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-accent/90"
        >
          {{ common.done }}
        </button>
      </DialogClose>
    </AppDialogFooter>
  </AppDialogRoot>
</template>
