import { defineConfig } from 'vitest/config'

// Security rules tests: run inside the Firestore emulator via `npm run test:rules`.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
