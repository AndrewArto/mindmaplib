import {
  MindmapEditor,
  createDoc,
  type MindmapDoc,
  type NodeContent,
} from '@mindmaplib/core'

function textContent(text: string): NodeContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  }
}

export function createSampleDoc(): MindmapDoc {
  const doc = createDoc('TripleA Digital enablement map')
  const editor = new MindmapEditor(doc)
  const rootId = doc.rootId

  editor.updateContent(rootId, textContent('TripleA Digital AI enablement'))

  const strategy = editor.addChild(rootId, {
    content: textContent('Strategy and operating model'),
  })
  editor.addChild(strategy, { content: textContent('90-day delivery roadmap') })
  editor.addChild(strategy, {
    content: textContent('Executive decision cadence'),
  })
  editor.addChild(strategy, {
    content: textContent('Measurable adoption targets'),
  })

  const automation = editor.addChild(rootId, {
    content: textContent('Workflow automation'),
  })
  editor.addChild(automation, { content: textContent('Intake triage') })
  editor.addChild(automation, {
    content: textContent('CRM and document flows'),
  })
  editor.addChild(automation, {
    content: textContent('Human approval checkpoints'),
  })

  const systems = editor.addChild(rootId, {
    content: textContent('Custom software systems'),
  })
  editor.addChild(systems, { content: textContent('Portal integration') })
  editor.addChild(systems, { content: textContent('D1 persistence') })
  editor.addChild(systems, {
    content: textContent('Audit-friendly architecture'),
  })

  const risk = editor.addChild(rootId, {
    content: textContent('Risk and governance'),
  })
  editor.addChild(risk, { content: textContent('Data boundaries') })
  editor.addChild(risk, { content: textContent('Rollback paths') })
  editor.addChild(risk, { content: textContent('Production verification') })

  editor.setLayout('tree-horizontal')
  return editor.getDoc()
}
