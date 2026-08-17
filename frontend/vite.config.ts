import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { APP_VERSION } from './src/changelog.js'

export default defineConfig({
  plugins: [react()],
  // The newest changelog entry is the single source of the version the app displays.
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  server: {
    // Stockfish's wasm uses a SharedArrayBuffer, which browsers only grant
    // under cross-origin isolation. The app proxies /api to the Maia server,
    // so nothing cross-origin needs loosening.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
