import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VitestReporter } from 'tdd-guard-vitest';

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(configDir, 'src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    reporters: [
      'default',
      // TDD_GUARD_PROJECT_ROOT lets worktree runs record results where the
      // session-level tdd-guard hook reads them (the main checkout).
      new VitestReporter({ projectRoot: process.env.TDD_GUARD_PROJECT_ROOT || path.resolve(configDir, '..') }),
    ],
  },
});
