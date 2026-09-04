<script setup lang="ts">
import { computed } from 'vue'

import { starWeaveBridgeState } from '@/app/automation/bridge/server'
import Tip from '@/components/ui/Tip.vue'

const connected = computed(() => starWeaveBridgeState.phase.value === 'connected')
const standalone = computed(() => starWeaveBridgeState.phase.value === 'standalone')
</script>

<template>
  <Tip :label="starWeaveBridgeState.detail.value" side="bottom">
    <span
      class="flex size-6 shrink-0 items-center justify-center rounded outline-none transition-colors hover:bg-hover focus-visible:ring-1 focus-visible:ring-accent"
      role="status"
      tabindex="0"
      aria-live="polite"
    >
      <span
        class="size-2 rounded-full shadow-[0_0_0_2px_rgb(255_255_255/0.06)]"
        :class="
          connected ? 'bg-emerald-500' : standalone ? 'bg-muted' : 'animate-pulse bg-amber-500'
        "
        aria-hidden="true"
      />
      <span class="sr-only">{{ starWeaveBridgeState.detail.value }}</span>
    </span>
  </Tip>
</template>
