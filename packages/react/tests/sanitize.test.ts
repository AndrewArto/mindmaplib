import { describe, it, expect } from 'vitest'
import { sanitizeMindmapHtml } from '../src/sanitize.js'

describe('sanitizeMindmapHtml', () => {
  it('preserves allowed tags', () => {
    const html = '<p>Hello <strong>world</strong></p>'
    const result = sanitizeMindmapHtml(html)
    expect(result).toContain('Hello')
    expect(result).toContain('<strong>world</strong>')
  })

  it('strips script tags', () => {
    const html = '<p>safe</p><script>alert("xss")</script>'
    const result = sanitizeMindmapHtml(html)
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('alert')
    expect(result).toContain('safe')
  })

  it('strips event handlers', () => {
    const html = '<p onclick="evil()">text</p>'
    const result = sanitizeMindmapHtml(html)
    expect(result).not.toContain('onclick')
    expect(result).toContain('text')
  })

  it('strips style and class attributes', () => {
    const html = '<p style="color:red" class="evil">text</p>'
    const result = sanitizeMindmapHtml(html)
    expect(result).not.toContain('style=')
    expect(result).not.toContain('class=')
  })

  it('allows http and https links', () => {
    const html = '<a href="https://example.com">link</a>'
    const result = sanitizeMindmapHtml(html)
    expect(result).toContain('href=')
    expect(result).toContain('example.com')
  })

  it('strips javascript: URLs', () => {
    const html = '<a href="javascript:alert(1)">link</a>'
    const result = sanitizeMindmapHtml(html)
    expect(result).not.toContain('javascript:')
  })

  it('strips data: URLs', () => {
    const html = '<a href="data:text/html,base64">link</a>'
    const result = sanitizeMindmapHtml(html)
    expect(result).not.toContain('data:')
  })

  it('allows mailto links', () => {
    const html = '<a href="mailto:test@example.com">email</a>'
    const result = sanitizeMindmapHtml(html)
    expect(result).toContain('mailto:')
  })

  it('preserves headings, lists, code, pre', () => {
    const html =
      '<h1>Title</h1><ul><li>item</li></ul><pre><code>code</code></pre>'
    const result = sanitizeMindmapHtml(html)
    expect(result).toContain('<h1>Title</h1>')
    expect(result).toContain('<li>item</li>')
  })

  it('strips img tags (not in allowed list)', () => {
    const html = '<img src="x" onerror="evil()">'
    const result = sanitizeMindmapHtml(html)
    expect(result).not.toContain('<img')
    expect(result).not.toContain('onerror')
  })
})
