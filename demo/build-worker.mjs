// Build script: compile worker.ts → dist/_worker.js for CF Pages
// Also copies _routes.json to dist/
import { build } from 'esbuild'
import { copyFileSync } from 'fs'

await build({
  entryPoints: ['worker.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: 'dist/_worker.js',
  target: 'es2022',
  legalComments: 'none',
  banner: {
    js: '// CF Pages advanced mode worker — D1 session API for mindmaplib demo',
  },
})

// Copy _routes.json to dist so CF knows which paths go to the worker
copyFileSync('_routes.json', 'dist/_routes.json')

console.log('_worker.js + _routes.json built → dist/')
