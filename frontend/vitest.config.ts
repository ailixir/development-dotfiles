import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Story 10.11b, AC-9 / *Open questions* 1.
 *
 * Measured on this worktree, not assumed: **neither** jsdom 23.2.0 **nor** Node v23.10.0 exposes a
 * global `EventSource` by default. Node ships one — the same platform implementation, behind
 * `--experimental-eventsource` — so the real-socket harness runs in the `forks` pool with that flag
 * enabled. This is the platform global @po's ruling calls option (a); it is **not** a polyfill and
 * adds no dependency, which is the decision that ruling reserves for @po.
 *
 * The flag is applied only when the running Node recognises it, so a Node that either predates the
 * flag or has unflagged `EventSource` still starts the pool. If the global is absent anyway, the
 * harness fails loudly on its own guard — it never skips.
 */
const eventSourceExecArgv = process.allowedNodeEnvironmentFlags.has('--experimental-eventsource')
  ? ['--experimental-eventsource']
  : [];

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // `*.node.test.*` files need a real socket and a real `EventSource`; they run in forked
    // processes so the flag above can be passed. Everything else keeps the default pool.
    poolMatchGlobs: [
      ['**/*.node.test.ts', 'forks'],
      ['**/*.node.test.tsx', 'forks'],
    ],
    poolOptions: {
      forks: { execArgv: eventSourceExecArgv },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        'dist/',
        'build/',
        'src/assets/',
        'src/services/mocks/mockData/',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 85,
          statements: 85,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@services': path.resolve(__dirname, './src/services'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@store': path.resolve(__dirname, './src/store'),
      '@assets': path.resolve(__dirname, './src/assets'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
    global: 'globalThis',
  },
});
