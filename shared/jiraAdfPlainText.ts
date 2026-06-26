import { normalizeAdf } from './jiraAdfNormalize'
import type { JiraAdfDocument, JiraAdfNode } from './jiraAdfTypes'

function listItemToPlainText(node: JiraAdfNode, depth: number): string {
  return nodesToPlainText(node.content ?? [], depth).trim()
}

function nodesToPlainText(nodes: JiraAdfNode[], depth: number): string {
  return nodes.map((node) => nodeToPlainText(node, depth)).join('')
}

function nodeToPlainText(node: JiraAdfNode, depth: number): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'

  if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'blockquote') {
    return nodesToPlainText(node.content ?? [], depth) + '\n'
  }

  if (node.type === 'bulletList') {
    return (node.content ?? [])
      .map((listItem) => `${'  '.repeat(depth)}• ${listItemToPlainText(listItem, depth + 1)}\n`)
      .join('')
  }

  if (node.type === 'orderedList') {
    const order = node.attrs?.order
    const start = typeof order === 'number' && Number.isFinite(order) ? order : 1
    return (node.content ?? [])
      .map((listItem, index) => `${'  '.repeat(depth)}${start + index}. ${listItemToPlainText(listItem, depth + 1)}\n`)
      .join('')
  }

  if (node.type === 'codeBlock') {
    return `\`\`\`\n${nodesToPlainText(node.content ?? [], depth)}\`\`\`\n`
  }

  if (node.content?.length) {
    return nodesToPlainText(node.content, depth)
  }

  return ''
}

export function adfToPlainText(doc: JiraAdfDocument | null | undefined): string {
  if (!doc) return ''
  const normalizedDoc = normalizeAdf(doc)
  if (!normalizedDoc) return ''
  return nodesToPlainText(normalizedDoc.content, 0).trimEnd()
}
