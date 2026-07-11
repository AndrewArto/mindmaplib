/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-reaches-into-react',
      comment: 'packages/core must not import anything from packages/react',
      severity: 'error',
      from: { path: '^packages/core/' },
      to: { path: '^packages/react/' },
    },
    {
      name: 'core-reaches-into-demo',
      comment: 'packages/core must not import anything from demo/',
      severity: 'error',
      from: { path: '^packages/core/' },
      to: { path: '^demo/' },
    },
    {
      name: 'core-no-framework-deps',
      comment:
        'packages/core must not depend on react, react-dom, or @tiptap/* (framework-agnostic)',
      severity: 'error',
      from: { path: '^packages/core/' },
      to: {
        path: 'node_modules/.*(@tiptap|react|react-dom)',
      },
    },
    {
      name: 'react-reaches-into-demo',
      comment: 'packages/react must not import anything from demo/',
      severity: 'error',
      from: { path: '^packages/react/' },
      to: { path: '^demo/' },
    },
    {
      name: 'react-imports-core-source',
      comment:
        'packages/react may consume @mindmaplib/core only through its package exports',
      severity: 'error',
      from: { path: '^packages/react/' },
      to: { path: '^packages/core/(src|tests)/' },
    },
    {
      name: 'react-imports-core-physical-path',
      comment:
        'packages/react must not use physical relative paths into the Core package',
      severity: 'error',
      from: { path: '^packages/react/' },
      to: {
        path: '^packages/core/',
        dependencyTypes: ['local', 'localmodule'],
      },
    },
    {
      name: 'demo-imports-library-source',
      comment:
        'demo may consume library packages only through their declared package exports',
      severity: 'error',
      from: { path: '^demo/' },
      to: { path: '^packages/(core|react)/(src|tests)/' },
    },
    {
      name: 'demo-imports-library-physical-path',
      comment:
        'demo must not use physical relative paths into library packages',
      severity: 'error',
      from: { path: '^demo/' },
      to: {
        path: '^packages/(core|react)/',
        dependencyTypes: ['local', 'localmodule'],
      },
    },
    {
      name: 'core-local-import-escapes-package',
      comment: 'Core local imports must remain inside packages/core',
      severity: 'error',
      from: { path: '^packages/core/' },
      to: {
        pathNot: '^packages/core/',
        dependencyTypes: ['local', 'localmodule'],
      },
    },
    {
      name: 'react-local-import-escapes-package',
      comment: 'React local imports must remain inside packages/react',
      severity: 'error',
      from: { path: '^packages/react/' },
      to: {
        pathNot: '^packages/react/',
        dependencyTypes: ['local', 'localmodule'],
      },
    },
    {
      name: 'demo-local-import-escapes-package',
      comment: 'Demo local imports must remain inside demo',
      severity: 'error',
      from: { path: '^demo/' },
      to: {
        pathNot: '^demo/',
        dependencyTypes: ['local', 'localmodule'],
      },
    },
    {
      name: 'core-transitively-reaches-higher-layer',
      comment: 'Core must never transitively reach React or Demo',
      severity: 'error',
      from: { path: '^packages/core/' },
      to: { path: '^(packages/react|demo)/', reachable: true },
    },
    {
      name: 'react-transitively-reaches-demo',
      comment: 'React must never transitively reach Demo',
      severity: 'error',
      from: { path: '^packages/react/' },
      to: { path: '^demo/', reachable: true },
    },
    {
      name: 'no-unresolved-library-mindmaplib-imports',
      comment: 'Published packages may use only resolvable @mindmaplib imports',
      severity: 'error',
      from: { path: '^packages/(core|react)/' },
      to: {
        path: '^@mindmaplib/',
        couldNotResolve: true,
      },
    },
    {
      name: 'no-unresolved-demo-mindmaplib-imports',
      comment:
        'Demo may use only resolvable @mindmaplib imports, except the CSS export handled by the bundler',
      severity: 'error',
      from: { path: '^demo/' },
      to: {
        path: '^@mindmaplib/',
        pathNot: '^@mindmaplib/react/styles\\.css$',
        couldNotResolve: true,
      },
    },
  ],
  options: {
    doNotFollow: 'node_modules',
  },
}
