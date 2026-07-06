import {
  MindmapEditor,
  createDoc,
  type MindmapDoc,
  type NodeContent,
  type NodeContentInline,
} from '@mindmaplib/core'

function rich(...inlines: NodeContentInline[]): NodeContent {
  return { type: 'doc', content: [{ type: 'paragraph', content: inlines }] }
}

function txt(text: string): NodeContentInline {
  return { type: 'text', text }
}

function bold(text: string): NodeContentInline {
  return { type: 'text', text, marks: [{ type: 'bold' }] }
}

function italic(text: string): NodeContentInline {
  return { type: 'text', text, marks: [{ type: 'italic' }] }
}

function code(text: string): NodeContentInline {
  return { type: 'text', text, marks: [{ type: 'code' }] }
}

function link(text: string, href: string): NodeContentInline {
  return { type: 'text', text, marks: [{ type: 'link', attrs: { href } }] }
}

function listDoc(items: string[]): NodeContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: items.map((item) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [txt(item)] }],
        })),
      },
    ],
  }
}

export function createSampleDoc(): MindmapDoc {
  const doc = createDoc('TripleA Digital enablement map')
  const editor = new MindmapEditor(doc)
  const rootId = doc.rootId

  // Root node — showcase bold + italic mixed
  editor.updateContent(rootId, rich(bold('TripleA'), txt(' '), italic('AI enablement')))

  // Strategy branch — heading + list
  const strategy = editor.addChild(rootId, {
    content: rich(bold('Strategy'), txt(' & '), italic('operating model')),
  })
  editor.addChild(strategy, {
    content: rich(txt('90-day '), bold('delivery roadmap')),
  })
  editor.addChild(strategy, {
    content: rich(txt('Executive decision '), link('cadence', 'https://tripleadigital.io')),
  })
  editor.addChild(strategy, {
    content: rich(txt('Adoption targets: '), code('NPS > 50')),
  })

  // Automation branch — code marks + formatting mix
  const automation = editor.addChild(rootId, {
    content: rich(bold('Workflow'), txt(' '), italic('automation')),
  })
  editor.addChild(automation, {
    content: listDoc(['Intake triage', 'CRM flows', 'Approval checkpoints']),
  })
  editor.addChild(automation, {
    content: rich(txt('Trigger: '), code('webhook → D1 write')),
  })

  // Systems branch
  const systems = editor.addChild(rootId, {
    content: rich(bold('Custom software'), txt(' systems')),
  })
  editor.addChild(systems, {
    content: rich(txt('Portal integration'), ),
  })
  editor.addChild(systems, {
    content: rich(txt('D1 persistence ('), italic('edge SQL'), txt(')')),
  })

  // Risk branch — link + code
  const risk = editor.addChild(rootId, {
    content: rich(bold('Risk'), txt(' & '), italic('governance')),
  })
  editor.addChild(risk, {
    content: rich(link('Data boundaries', 'https://tripleadigital.io')),
  })
  editor.addChild(risk, {
    content: rich(txt('Rollback: '), code('git revert + CF rollback')),
  })

  editor.setLayout('tree-horizontal')
  return editor.getDoc()
}
