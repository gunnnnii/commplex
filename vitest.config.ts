import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig({
  ...viteConfig,
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/helpers/setup.ts']
  }
});