import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx'],
      exclude: ['packages/*/src/**/index.ts', '**/*.d.ts'],
      thresholds: {
        lines: 80,
      },
    },
    // React adapter tests need jsdom; core tests work in either environment.
    // Using projects so each package can declare its own environment.
    projects: [
      {
        // Core tests: Node environment
        test: {
          name: 'core',
          include: ['packages/core/tests/**/*.test.ts'],
        },
      },
      {
        // React adapter tests: jsdom environment
        test: {
          name: 'react',
          environment: 'jsdom',
          setupFiles: ['./packages/react/tests/setup.ts'],
          include: ['packages/react/tests/**/*.test.{ts,tsx}'],
          coverage: {
            include: [
              'packages/react/src/**/*.ts',
              'packages/react/src/**/*.tsx',
            ],
          },
        },
      },
      {
        // Demo app shell tests: jsdom environment
        test: {
          name: 'demo',
          environment: 'jsdom',
          include: ['demo/tests/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
