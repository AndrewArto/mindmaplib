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
  ],
  options: {
    doNotFollow: 'node_modules',
  },
}
