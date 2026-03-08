import { defineConfig } from 'wxt'
import react from '@vitejs/plugin-react'

export default defineConfig({
  vite: () => ({
    plugins: [react()],
  }),
  manifest: {
    name: 'Slooow',
    description: 'Slow down web animations in real time. For designers.',
    version: '1.0.0',
    permissions: ['activeTab'],
    icons: {
      16:  'icons/icon16.png',
      48:  'icons/icon48.png',
      128: 'icons/icon128.png',
    },
    action: {
      default_title: 'Toggle Slooow toolbar',
      default_icon: {
        16:  'icons/icon16.png',
        48:  'icons/icon48.png',
        128: 'icons/icon128.png',
      },
    },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Toggle Slooow toolbar',
      },
    },
  },
})
