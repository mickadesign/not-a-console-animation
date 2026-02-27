import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node', // pure logic tests — no DOM needed
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
