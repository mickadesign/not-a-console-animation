import { defineConfig } from 'wxt'
import react from '@vitejs/plugin-react'

export default defineConfig({
  vite: () => ({
    plugins: [react()],
  }),
  manifest: {
    name: 'SlowMo',
    description: 'Slow down web animations in real time. For designers.',
    version: '1.0.0',
    permissions: ['scripting', 'activeTab'],
    // No host_permissions for MVP — activeTab only, lower CWS review friction.
    // Upgrade to host_permissions: ['<all_urls>'] in v1.1 if rAF pre-patching is needed.
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Toggle SlowMo toolbar',
      },
    },
  },
})
