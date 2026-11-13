import { defineConfig, loadEnv } from 'vite'

// The Skytime .NET backend listens on 5012 (see API_CONTRACT.md). Override with
// VITE_BACKEND_URL if it runs elsewhere. The browser only ever talks to the
// backend, never to the Python image service directly.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_BACKEND_URL || 'http://localhost:5012'
  // The first image for a new patch can take over a minute while IRSA responds.
  const proxy = { target: backend, changeOrigin: true, timeout: 180000, proxyTimeout: 180000 }
  return {
    esbuild: { jsx: 'automatic' },
    server: {
      port: 5173,
      proxy: { '/api': proxy, '/images': proxy },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
