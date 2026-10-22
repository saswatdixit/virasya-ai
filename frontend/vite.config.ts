import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            console.error('[vite-proxy] Backend proxy error:', err.message);
            if ('writeHead' in res && typeof res.writeHead === 'function' && !res.headersSent) {
              res.writeHead(502, {
                'Content-Type': 'application/json',
              });
              res.end(
                JSON.stringify({
                  error: 'Backend service unavailable on port 5000. Please ensure the Virasya AI backend is running.',
                  code: 'BACKEND_UNAVAILABLE',
                  details: err.message,
                })
              );
            }
          });
        },
      },
    },
  },
})
