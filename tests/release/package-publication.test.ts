import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../..')

type PackageManifest = {
  name: string
  version: string
  description?: string
  repository?: { type: string; url: string; directory: string }
  homepage?: string
  bugs?: { url: string }
  keywords?: string[]
  publishConfig?: { access?: string; provenance?: boolean }
  sideEffects?: boolean | string[]
  peerDependencies?: Record<string, string>
  files?: string[]
}

function readManifest(packageName: 'core' | 'react'): PackageManifest {
  return JSON.parse(
    readFileSync(
      resolve(repoRoot, `packages/${packageName}/package.json`),
      'utf8',
    ),
  ) as PackageManifest
}

describe('npm publication metadata', () => {
  for (const packageName of ['core', 'react'] as const) {
    it(`${packageName} identifies its source, support, and public registry access`, () => {
      const manifest = readManifest(packageName)

      expect(manifest.repository).toEqual({
        type: 'git',
        url: 'git+https://github.com/AndrewArto/mindmaplib.git',
        directory: `packages/${packageName}`,
      })
      expect(manifest.homepage).toBe(
        `https://github.com/AndrewArto/mindmaplib/tree/main/packages/${packageName}#readme`,
      )
      expect(manifest.bugs).toEqual({
        url: 'https://github.com/AndrewArto/mindmaplib/issues',
      })
      expect(manifest.publishConfig).toEqual({
        access: 'public',
        provenance: true,
      })
      expect(manifest.keywords).toContain('mindmap')
      expect(manifest.files).toEqual(
        expect.arrayContaining(['dist', 'README.md', 'LICENSE']),
      )
      expect(() =>
        readFileSync(resolve(repoRoot, `packages/${packageName}/README.md`)),
      ).not.toThrow()
      expect(() =>
        readFileSync(resolve(repoRoot, `packages/${packageName}/LICENSE`)),
      ).not.toThrow()
    })
  }

  it('marks core as side-effect free', () => {
    expect(readManifest('core').sideEffects).toBe(false)
  })

  it('preserves the React stylesheet as a package side effect', () => {
    expect(readManifest('react').sideEffects).toEqual(['./dist/styles.css'])
  })

  it('publishes the React adapter against a compatible core range', () => {
    expect(readManifest('react').peerDependencies?.['@mindmaplib/core']).toBe(
      '^0.1.0',
    )
  })
})

describe('initial public release changeset', () => {
  it('keeps the public packages in one fixed version group', () => {
    const config = JSON.parse(
      readFileSync(resolve(repoRoot, '.changeset/config.json'), 'utf8'),
    ) as { fixed?: string[][]; privatePackages?: { version?: boolean } }

    expect(config.fixed).toContainEqual([
      '@mindmaplib/core',
      '@mindmaplib/react',
    ])
    expect(config.privatePackages?.version).toBe(false)
  })})
