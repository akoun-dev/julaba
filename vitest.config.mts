import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Garde « server-only » (DET-008) : no-op en test — le vrai garde est
      // une erreur de build Next côté client (alias webpack interne à next).
      'server-only': path.resolve(__dirname, 'src/lib/server-only-stub.js'),
    },
  },
})
