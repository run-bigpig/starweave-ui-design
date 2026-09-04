import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import IconsResolver from 'unplugin-icons/resolver'
import Icons from 'unplugin-icons/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'

import { createOpenPencilAliases } from './vite/aliases'
import { copyCanvasKitAssetsPlugin } from './vite/canvaskit-assets'
import { rawMarkdownPlugin } from './vite/raw-markdown'

export default defineConfig({
  resolve: {
    alias: createOpenPencilAliases(__dirname)
  },
  plugins: [
    rawMarkdownPlugin(),
    copyCanvasKitAssetsPlugin(),
    tailwindcss(),
    Icons({ compiler: 'vue3' }),
    Components({ resolvers: [IconsResolver({ prefix: 'icon' })] }),
    vue()
  ],
  clearScreen: false,
  build: {
    chunkSizeWarningLimit: 2500
  }
})
