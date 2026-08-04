import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// Stockfish's multi-threaded WASM build needs SharedArrayBuffer, which browsers
// only hand out to cross-origin-isolated pages. These headers provide that; the
// engine wrapper falls back to the single-threaded build when they're missing.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react()],
  // package.json is the single source of the version the app displays.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    headers: crossOriginIsolation,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  preview: { headers: crossOriginIsolation },
})
