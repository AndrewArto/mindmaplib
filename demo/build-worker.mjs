// Build script: compile worker.ts → dist/_worker.js for CF Pages
// Runs from the demo/ directory (pnpm --filter demo)
import { build } from 'esbuild'

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

console.log('_worker.js built → dist/_worker.js')
