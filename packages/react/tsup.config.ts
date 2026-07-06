import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    '@mindmaplib/core',
    '@tiptap/core',
    '@tiptap/pm',
    '@tiptap/react',
    '@tiptap/starter-kit',
    '@tiptap/extension-link',
    'dompurify',
    'd3-hierarchy',
  ],
  loader: {
    '.css': 'copy',
  },
  // Copy styles.css to dist so host can import @mindmaplib/react/styles.css
  onSuccess: 'cp src/styles/styles.css dist/styles.css 2>/dev/null || true',
})
