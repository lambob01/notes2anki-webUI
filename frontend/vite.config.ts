import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    // FastAPI serves this directory as the SPA in the single-container image.
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    // Dev only. In production the SPA and API are same-origin on 8080, so
    // lib/api.ts uses relative paths and no proxy exists.
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})
