import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const demoRoot = resolve(import.meta.dirname, '..')

function metaContent(
  html: string,
  attribute: 'property' | 'name',
  value: string,
) {
  const pattern = new RegExp(
    `<meta\\s+[^>]*${attribute}=["']${value}["'][^>]*content=["']([^"']+)["'][^>]*>|` +
      `<meta\\s+[^>]*content=["']([^"']+)["'][^>]*${attribute}=["']${value}["'][^>]*>`,
    'i',
  )
  const match = html.match(pattern)
  return match?.[1] ?? match?.[2]
}

function readPngDimensions(image: Buffer): { width: number; height: number } {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  expect(image.subarray(0, 8)).toEqual(pngSignature)
  expect(image.subarray(12, 16).toString('ascii')).toBe('IHDR')
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  }
}

describe('demo social metadata', () => {
  it('publishes complete Open Graph and Twitter metadata', () => {
    const html = readFileSync(resolve(demoRoot, 'index.html'), 'utf8')

    expect(metaContent(html, 'property', 'og:type')).toBe('website')
    expect(metaContent(html, 'property', 'og:title')).toBe(
      'mindmaplib: Embeddable mind maps for web apps',
    )
    expect(metaContent(html, 'property', 'og:description')).toBe(
      'An open-source mind map engine with a framework-agnostic core and React adapter.',
    )
    expect(metaContent(html, 'property', 'og:url')).toBe(
      'https://mapdemo.tripleadigital.io/',
    )
    expect(metaContent(html, 'property', 'og:image')).toBe(
      'https://mapdemo.tripleadigital.io/og-image.png',
    )
    expect(metaContent(html, 'property', 'og:image:width')).toBe('1200')
    expect(metaContent(html, 'property', 'og:image:height')).toBe('630')
    expect(metaContent(html, 'name', 'twitter:card')).toBe(
      'summary_large_image',
    )
    expect(metaContent(html, 'name', 'twitter:image')).toBe(
      'https://mapdemo.tripleadigital.io/og-image.png',
    )
  })

  it('ships the social preview at 1200 by 630 pixels', () => {
    const image = readFileSync(resolve(demoRoot, 'public/og-image.png'))
    expect(readPngDimensions(image)).toEqual({ width: 1200, height: 630 })
  })
})
