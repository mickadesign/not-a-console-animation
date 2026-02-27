import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    headless: false, // Chrome extensions require headed mode
  },
  projects: [
    {
      name: 'chrome-extension',
      use: {
        // Context is created per-suite inside the spec; no browser config here
      },
    },
  ],
})
