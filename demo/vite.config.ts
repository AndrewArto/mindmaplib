import { defineConfig } from 'vite'

const BUILD_TIME = new Date().toISOString()

export default defineConfig({
  root: '.',
  base: './',
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
})
