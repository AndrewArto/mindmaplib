import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(root, relativePath), 'utf8'))

const failures = []
const check = (condition, message) => {
  if (!condition) failures.push(message)
}

const dependencyEntries = (
  manifest,
  sections = [
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
    'devDependencies',
  ],
) =>
  sections.flatMap((section) =>
    Object.entries(manifest[section] ?? {}).map(([name, spec]) => ({
      name,
      spec,
      section,
    })),
  )

const coreForbiddenIdentity =
  /^(?:react|react-dom|@types\/react|@types\/react-dom|@tiptap\/.+|@mindmaplib\/(?:react|demo))$/
const coreForbiddenAlias =
  /^npm:(?:react|react-dom|@types\/react|@types\/react-dom|@tiptap\/.+|@mindmaplib\/(?:react|demo))@/
const localLayerAlias =
  /^(?:workspace|file|link):.*(?:^|\/)(?:packages\/)?(?:core|react|demo)(?:\/|$)/
const namedWorkspaceLayerAlias = /^workspace:@mindmaplib\/(?:core|react|demo)@/

const exportTargets = (value) => {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object') return []
  return Object.values(value).flatMap(exportTargets)
}

const isExplicitDistTarget = (target) => {
  if (typeof target !== 'string' || !target.startsWith('./dist/')) return false
  if (target.includes('*')) return false
  const normalized = path.posix.normalize(target.slice(2))
  return normalized.startsWith('dist/') && !normalized.includes('../')
}

const validatePublishedManifest = (manifest, expectedSubpaths) => {
  const exportsMap = manifest.exports
  check(
    exportsMap && typeof exportsMap === 'object',
    `${manifest.name} must declare package exports`,
  )
  const exportKeys = Object.keys(exportsMap ?? {}).sort()
  const expectedKeys = [...expectedSubpaths].sort()
  check(
    JSON.stringify(exportKeys) === JSON.stringify(expectedKeys),
    `${manifest.name} exports must be exactly: ${expectedKeys.join(', ')}`,
  )
  for (const subpath of expectedSubpaths) {
    const targets = exportTargets(exportsMap?.[subpath])
    check(targets.length > 0, `${manifest.name} export ${subpath} must resolve`)
    check(
      targets.every(isExplicitDistTarget),
      `${manifest.name} export ${subpath} must use explicit ./dist/ targets`,
    )
  }

  for (const field of ['main', 'module', 'types']) {
    check(
      isExplicitDistTarget(manifest[field]),
      `${manifest.name} ${field} must be an explicit ./dist/ target`,
    )
  }
  const rootExport = exportsMap?.['.']
  check(
    rootExport && typeof rootExport === 'object',
    `${manifest.name} root export must define conditions`,
  )
  check(
    rootExport?.types === manifest.types,
    `${manifest.name} root types export must match its types field`,
  )
  check(
    rootExport?.import === manifest.module && manifest.module === manifest.main,
    `${manifest.name} root import export must match its main and module fields`,
  )

  const publishedFiles = manifest.files
  const expectedFiles = ['LICENSE', 'README.md', 'dist']
  check(
    Array.isArray(publishedFiles) &&
      JSON.stringify([...publishedFiles].sort()) ===
        JSON.stringify(expectedFiles),
    `${manifest.name} files must be exactly: ${expectedFiles.join(', ')}`,
  )
}

const walkFiles = async (directory, ignoredDirectories) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory() && ignoredDirectories.has(fullPath)) continue
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath, ignoredDirectories)))
    } else {
      files.push(fullPath)
    }
  }
  return files
}

const core = await readJson('packages/core/package.json')
const react = await readJson('packages/react/package.json')
const demo = await readJson('demo/package.json')

const forbiddenCoreDependencies = dependencyEntries(core).filter(
  ({ name, spec }) =>
    coreForbiddenIdentity.test(name) ||
    coreForbiddenAlias.test(spec) ||
    (localLayerAlias.test(spec) && /(?:react|demo)(?:\/|$)/.test(spec)) ||
    (namedWorkspaceLayerAlias.test(spec) &&
      /@mindmaplib\/(?:react|demo)@/.test(spec)),
)
check(
  forbiddenCoreDependencies.length === 0,
  `@mindmaplib/core has framework or application dependencies: ${forbiddenCoreDependencies
    .map(({ name, spec }) => `${name}=${spec}`)
    .join(', ')}`,
)

const forbiddenReactDependencies = dependencyEntries(react).filter(
  ({ name, spec }) =>
    name === '@mindmaplib/demo' ||
    /^npm:@mindmaplib\/demo@/.test(spec) ||
    (localLayerAlias.test(spec) && /demo(?:\/|$)/.test(spec)) ||
    /^workspace:@mindmaplib\/demo@/.test(spec),
)
check(
  forbiddenReactDependencies.length === 0,
  '@mindmaplib/react must not depend on @mindmaplib/demo',
)
const reactRuntimeCoreDependencies = dependencyEntries(react, [
  'dependencies',
  'optionalDependencies',
]).filter(
  ({ name, spec }) =>
    name === '@mindmaplib/core' ||
    /^npm:@mindmaplib\/core@/.test(spec) ||
    (localLayerAlias.test(spec) && /core(?:\/|$)/.test(spec)) ||
    /^workspace:@mindmaplib\/core@/.test(spec),
)
check(
  reactRuntimeCoreDependencies.length === 0,
  '@mindmaplib/react must keep Core in peerDependencies, not runtime dependencies',
)
const reactCorePeerRange = react.peerDependencies?.['@mindmaplib/core']
check(
  typeof reactCorePeerRange === 'string' &&
    /^\^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(reactCorePeerRange),
  '@mindmaplib/react must declare @mindmaplib/core as a caret semver peer dependency',
)
check(
  react.devDependencies?.['@mindmaplib/core'] === 'workspace:*',
  '@mindmaplib/react must use the Core workspace package during development',
)

check(demo.private === true, '@mindmaplib/demo must remain private')
check(
  demo.dependencies?.['@mindmaplib/core'] === 'workspace:*',
  'Demo must consume @mindmaplib/core through its workspace package export',
)
check(
  demo.dependencies?.['@mindmaplib/react'] === 'workspace:*',
  'Demo must consume @mindmaplib/react through its workspace package export',
)

validatePublishedManifest(core, ['.'])
validatePublishedManifest(react, ['.', './styles.css'])
check(
  react.exports?.['./styles.css'] === './dist/styles.css',
  '@mindmaplib/react styles.css must map to ./dist/styles.css',
)

const coreTsconfigPath = path.join(root, 'packages/core/tsconfig.json')
const configFile = ts.readConfigFile(coreTsconfigPath, ts.sys.readFile)
check(!configFile.error, '@mindmaplib/core tsconfig must parse successfully')
if (!configFile.error) {
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(coreTsconfigPath),
  )
  check(
    parsedConfig.errors.length === 0,
    '@mindmaplib/core effective TypeScript config must be valid',
  )
  const effectiveLibs = parsedConfig.options.lib ?? []
  check(
    !effectiveLibs.some((lib) => /^lib\.dom(?:\.|$)/i.test(path.basename(lib))),
    '@mindmaplib/core effective TypeScript config must remain DOM-free',
  )
}

const corePackageRoot = path.join(root, 'packages/core')
const corePackageFiles = await walkFiles(
  corePackageRoot,
  new Set([
    path.join(corePackageRoot, 'coverage'),
    path.join(corePackageRoot, 'dist'),
    path.join(corePackageRoot, 'node_modules'),
  ]),
)
const coreTypeScriptFiles = corePackageFiles.filter((file) =>
  /\.(?:tsx?|mts|cts)$/.test(file),
)
const coreJavaScriptFiles = corePackageFiles.filter((file) =>
  /\.(?:jsx?|mjs|cjs)$/.test(file),
)
check(
  !coreTypeScriptFiles.some((file) => /\.(?:tsx|mts|cts)$/.test(file)),
  '@mindmaplib/core must contain only .ts TypeScript implementation files',
)
check(
  coreJavaScriptFiles.length === 0,
  '@mindmaplib/core must not contain JavaScript implementation files',
)
const unwrapTypeScriptExpression = (node) => {
  let current = node
  while (
    current.parent &&
    ((ts.isAsExpression(current.parent) &&
      current.parent.expression === current) ||
      (ts.isParenthesizedExpression(current.parent) &&
        current.parent.expression === current) ||
      (ts.isNonNullExpression(current.parent) &&
        current.parent.expression === current))
  ) {
    current = current.parent
  }
  return current
}

const isAllowedGlobalThisUse = (identifier, sourceFile) => {
  if (!sourceFile.fileName.endsWith('/packages/core/src/id.ts')) return false
  const expression = unwrapTypeScriptExpression(identifier)
  const cryptoAccess = expression.parent
  if (
    !ts.isPropertyAccessExpression(cryptoAccess) ||
    cryptoAccess.expression !== expression ||
    cryptoAccess.name.text !== 'crypto'
  ) {
    return false
  }
  const randomUuidAccess = cryptoAccess.parent
  if (
    !ts.isPropertyAccessExpression(randomUuidAccess) ||
    randomUuidAccess.expression !== cryptoAccess ||
    randomUuidAccess.name.text !== 'randomUUID'
  ) {
    return false
  }
  const call = randomUuidAccess.parent
  return ts.isCallExpression(call) && call.expression === randomUuidAccess
}

for (const sourceFile of coreTypeScriptFiles) {
  const source = await readFile(sourceFile, 'utf8')
  const preprocessed = ts.preProcessFile(source, true, true)
  const sourceAst = ts.createSourceFile(
    sourceFile,
    source,
    ts.ScriptTarget.Latest,
    true,
  )
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === 'globalThis') {
      check(
        isAllowedGlobalThisUse(node, sourceAst),
        `${path.relative(root, sourceFile)} may use globalThis only for a direct crypto.randomUUID() call`,
      )
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceAst)
  check(
    !preprocessed.libReferenceDirectives.some(({ fileName }) =>
      /^dom(?:\.|$)/i.test(fileName),
    ),
    `${path.relative(root, sourceFile)} must not add a DOM lib reference`,
  )
  check(
    !preprocessed.referencedFiles.some(({ fileName }) =>
      /(?:^|\/)lib\.dom(?:\.[^/]*)?\.d\.ts$/i.test(fileName),
    ),
    `${path.relative(root, sourceFile)} must not reference lib.dom declarations`,
  )
}

const moduleResolutionConfigs = [
  'tsconfig.base.json',
  'packages/core/tsconfig.json',
  'packages/react/tsconfig.json',
  'demo/tsconfig.json',
  'demo/tsconfig.tests.json',
]
for (const relativeConfigPath of moduleResolutionConfigs) {
  const absoluteConfigPath = path.join(root, relativeConfigPath)
  const resolutionConfig = ts.readConfigFile(
    absoluteConfigPath,
    ts.sys.readFile,
  )
  check(
    !resolutionConfig.error,
    `${relativeConfigPath} must parse successfully`,
  )
  if (!resolutionConfig.error) {
    const parsedResolutionConfig = ts.parseJsonConfigFileContent(
      resolutionConfig.config,
      ts.sys,
      path.dirname(absoluteConfigPath),
    )
    check(
      parsedResolutionConfig.options.baseUrl === undefined,
      `${relativeConfigPath} must not define baseUrl`,
    )
    check(
      Object.keys(parsedResolutionConfig.options.paths ?? {}).length === 0,
      `${relativeConfigPath} must not define module-resolution paths`,
    )
  }
}

const buildConfigContracts = [
  {
    file: 'vitest.config.ts',
    forbiddenRoots: [],
  },
  {
    file: 'packages/core/tsup.config.ts',
    forbiddenRoots: ['packages/react', 'demo'],
  },
  {
    file: 'packages/react/tsup.config.ts',
    forbiddenRoots: ['packages/core', 'demo'],
  },
  {
    file: 'packages/react/vitest.config.ts',
    forbiddenRoots: ['packages/core', 'demo'],
  },
  {
    file: 'demo/vite.config.ts',
    forbiddenRoots: ['packages/core', 'packages/react'],
  },
  {
    file: 'demo/build-worker.mjs',
    forbiddenRoots: ['packages/core', 'packages/react'],
  },
]

const propertyName = (name) => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text
  return null
}

for (const contract of buildConfigContracts) {
  const absoluteConfigPath = path.join(root, contract.file)
  const source = await readFile(absoluteConfigPath, 'utf8')
  const sourceAst = ts.createSourceFile(
    absoluteConfigPath,
    source,
    ts.ScriptTarget.Latest,
    true,
  )
  const configImports = ts.preProcessFile(source, true, true).importedFiles
  check(
    !configImports.some(
      ({ fileName }) => fileName.startsWith('.') || path.isAbsolute(fileName),
    ),
    `${contract.file} must not import local configuration helpers`,
  )
  const forbiddenAbsoluteRoots = contract.forbiddenRoots.map((relativeRoot) =>
    path.join(root, relativeRoot),
  )
  const visitConfig = (node) => {
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isShorthandPropertyAssignment(node)) &&
      propertyName(node.name) === 'alias'
    ) {
      check(false, `${contract.file} must not define module aliases`)
    }
    if (
      ts.isStringLiteralLike(node) &&
      (node.text.startsWith('.') || path.isAbsolute(node.text))
    ) {
      const resolved = path.resolve(path.dirname(absoluteConfigPath), node.text)
      if (
        forbiddenAbsoluteRoots.some(
          (forbiddenRoot) =>
            resolved === forbiddenRoot ||
            resolved.startsWith(`${forbiddenRoot}${path.sep}`),
        )
      ) {
        check(
          false,
          `${contract.file} must not reference physical library/application paths: ${node.text}`,
        )
      }
    }
    ts.forEachChild(node, visitConfig)
  }
  visitConfig(sourceAst)
}

if (failures.length > 0) {
  console.error('Package boundary contract failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Package boundary contract passed')
