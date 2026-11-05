import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: Number(env.PORT || 5173),
      host: env.HOST || true,
      open: true,
      hmr: true,
      proxy: {
        '/api/v1': {
          target: env.VITE_API_URL || 'http://localhost:8080',
          changeOrigin: true,
          // Guided publication and replay re-check Core with the browser's put_session cookie.
          // Locally there is no Core login, and backend/scripts/local-core.mjs accepts exactly
          // this dev value. Only active when scripts/dev.mjs sets VITE_DEV_SESSION_COOKIE.
          configure: (proxy) => {
            const devSession = env.VITE_DEV_SESSION_COOKIE;
            if (!devSession) return;
            proxy.on('proxyReq', (proxyReq) => {
              const cookie = proxyReq.getHeader('cookie');
              const existing = Array.isArray(cookie) ? cookie.join('; ') : String(cookie ?? '');
              if (/(^|;\s*)put_session=/.test(existing)) return;
              const session = `put_session=${devSession}`;
              proxyReq.setHeader('cookie', existing ? `${existing}; ${session}` : session);
            });
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
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
      global: 'globalThis',
      'process.env.PUBLIC_PATH': JSON.stringify(env.PUBLIC_PATH || ''),
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        '@mui/material',
        '@emotion/react',
        '@emotion/styled',
      ],
      force: true,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            mui: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          },
        },
      },
    },
  };
});
