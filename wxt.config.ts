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
    permissions: ['scripting', 'activeTab', 'storage'],
    // No host_permissions for MVP — activeTab only, lower CWS review friction.
    // Upgrade to host_permissions: ['<all_urls>'] in v1.1 if rAF pre-patching is needed.
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
