import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    // Com o emulador do Storage no ar (suite de regras), os arquivos rodam em
    // sequência: storage.rules.test.ts precisa do Firestore do MESMO projeto
    // que firestore.rules.test.ts limpa a cada teste (ver o comentário lá).
    fileParallelism: !process.env.FIREBASE_STORAGE_EMULATOR_HOST,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
