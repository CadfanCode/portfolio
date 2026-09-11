import { defineConfig } from 'vitest/config'

// Node environment only. Every module under test here is deliberately free of
// three.js scene-graph and React, so no jsdom or WebGL context is needed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
