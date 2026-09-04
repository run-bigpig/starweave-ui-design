<script setup lang="ts">
import { computed } from 'vue'

import { starWeaveBridgeState } from '@/app/automation/bridge/server'

const connected = computed(() => starWeaveBridgeState.phase.value === 'connected')
const standalone = computed(() => starWeaveBridgeState.phase.value === 'standalone')
</script>

<template>
  <div
    class="pointer-events-none fixed top-3 left-3 z-50 flex items-center gap-2 rounded-md border border-border bg-panel/95 px-2.5 py-1.5 text-[10px] text-muted shadow-sm backdrop-blur"
    role="status"
    aria-live="polite"
  >
    <span
      class="size-1.5 rounded-full"
      :class="connected ? 'bg-emerald-500' : standalone ? 'bg-muted' : 'animate-pulse bg-amber-500'"
      aria-hidden="true"
    />
    {{ starWeaveBridgeState.detail.value }}
  </div>
</template>
