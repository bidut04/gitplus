import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@gitpulse/shared': path.resolve(__dirname, './packages/shared/src/index.ts')
    }
  },
  test: {
    globals: true,
    environment: 'node'
  }
});

