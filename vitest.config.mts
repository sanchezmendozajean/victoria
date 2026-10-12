import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so tests never start Electron.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts', 'tests/unit/**/*.test.ts'],
  },
});
