import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import type { Extensions } from '@tiptap/core'

/**
 * Default editor schema used by both static rendering and active TipTap editors.
 * StarterKit v3 includes Link, so disable its bundled instance before adding the
 * configured Link extension required by mindmaplib.
 */
export const DEFAULT_TIPTAP_EXTENSIONS: Extensions = [
  StarterKit.configure({ link: false }),
  Link.configure({ openOnClick: false }),
]
