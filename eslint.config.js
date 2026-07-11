import tseslint from 'typescript-eslint'

const restrictedImports = (patterns) => [
  'error',
  {
    patterns: patterns.map(({ regex, message }) => ({ regex, message })),
  },
]

const browserGlobals = [
  'globalThis',
  'self',
  'global',
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'screen',
  'performance',
  'indexedDB',
  'caches',
  'customElements',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'DOMParser',
  'MutationObserver',
  'ResizeObserver',
  'IntersectionObserver',
  'CanvasRenderingContext2D',
  'SVGElement',
  'localStorage',
  'sessionStorage',
  'fetch',
  'Request',
  'Response',
  'WebSocket',
  'Blob',
  'File',
  'URL',
  'URLSearchParams',
  'AbortController',
].map((name) => ({
  name,
  message: 'Core is DOM-free; browser integration belongs in an adapter.',
}))

const coreGlobalsWithoutGlobalThis = browserGlobals.filter(
  ({ name }) => name !== 'globalThis',
)
const browserMemberNames = new Set(
  browserGlobals
    .map(({ name }) => name)
    .filter((name) => !['globalThis', 'self', 'global'].includes(name)),
)

const unwrapExpression = (node) => {
  let current = node
  while (
    [
      'ChainExpression',
      'TSAsExpression',
      'TSNonNullExpression',
      'TSTypeAssertion',
    ].includes(current?.type)
  ) {
    current = current.expression
  }
  return current
}

const staticPropertyName = (member) => {
  if (!member.computed && member.property.type === 'Identifier') {
    return member.property.name
  }
  if (member.computed && member.property.type === 'Literal') {
    return typeof member.property.value === 'string'
      ? member.property.value
      : null
  }
  return null
}

const architecturePlugin = {
  rules: {
    'no-core-browser-global-members': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          forbidden:
            'Core cannot access browser global {{property}} through {{object}}.',
        },
      },
      create(context) {
        return {
          MemberExpression(node) {
            const object = unwrapExpression(node.object)
            const property = staticPropertyName(node)
            if (
              object?.type === 'Identifier' &&
              ['globalThis', 'self', 'global'].includes(object.name) &&
              property &&
              browserMemberNames.has(property)
            ) {
              context.report({
                node,
                messageId: 'forbidden',
                data: { object: object.name, property },
              })
            }
          },
        }
      },
    },
  },
}

export default tseslint.config(
  {
    ignores: [
      'packages/*/dist/**',
      'demo/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['packages/core/**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
    plugins: { architecture: architecturePlugin },
    rules: {
      'architecture/no-core-browser-global-members': 'error',
      'no-restricted-globals': ['error', ...browserGlobals],
      'no-restricted-imports': restrictedImports([
        {
          regex: '^@mindmaplib/(?:react|demo)(?:/|$)',
          message:
            'Core is framework-agnostic and cannot depend on React or demo code.',
        },
        {
          regex: '^(?:\\.\\.?/)+.*demo/',
          message: 'Core cannot reach into demo implementation files.',
        },
      ]),
    },
  },
  {
    files: ['packages/core/src/id.ts'],
    rules: {
      'no-restricted-globals': ['error', ...coreGlobalsWithoutGlobalThis],
    },
  },
  {
    files: ['packages/react/**/*.{ts,tsx,js,mjs}'],
    rules: {
      'no-restricted-imports': restrictedImports([
        {
          regex: '^@mindmaplib/core/.+',
          message:
            'React must use the public @mindmaplib/core package entrypoint.',
        },
        {
          regex: '^@mindmaplib/demo(?:/|$)',
          message: 'Published React code cannot depend on demo code.',
        },
        {
          regex: '^(?:\\.\\.?/)+.*(?:packages/)?(?:core|demo)(?:/|$)',
          message:
            'React cannot reach into Core internals or demo implementation files.',
        },
      ]),
    },
  },
  {
    files: ['demo/**/*.{ts,tsx,js,mjs}'],
    rules: {
      'no-restricted-imports': restrictedImports([
        {
          regex: '^@mindmaplib/core/.+',
          message: 'Demo must use the public @mindmaplib/core entrypoint.',
        },
        {
          regex: '^@mindmaplib/react/(?!styles\\.css$).+',
          message:
            'Demo must use declared @mindmaplib/react exports only; styles.css is the supported style subpath.',
        },
        {
          regex: '^(?:\\.\\.?/)+.*(?:packages/)?(?:core|react)(?:/|$)',
          message: 'Demo cannot reach into Core or React implementation files.',
        },
      ]),
    },
  },
)
