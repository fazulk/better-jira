import type { JSONContent } from '@tiptap/core'
import type { JiraAdfDocument, JiraAdfMark, JiraAdfNode } from '@/types/jira'
import { isRecord, normalizeAdf } from '~/shared/jiraAdf'

function toEditorMark(mark: JiraAdfMark): { type: string; attrs?: Record<string, unknown> } | null {
  if (typeof mark.type !== 'string' || !mark.type) return null

  if (mark.type === 'strong') return { type: 'bold' }
  if (mark.type === 'em') return { type: 'italic' }
  if (mark.type === 'link') {
    const href = mark.attrs?.href
    if (typeof href !== 'string' || !href) return null
    return { type: 'link', attrs: { href, title: href } }
  }

  return { type: mark.type }
}

function toAdfMark(mark: { type?: string; attrs?: Record<string, unknown> }): JiraAdfMark | null {
  if (typeof mark.type !== 'string' || !mark.type) return null

  if (mark.type === 'bold') return { type: 'strong' }
  if (mark.type === 'italic') return { type: 'em' }
  if (mark.type === 'link') {
    const href = mark.attrs?.href
    if (typeof href !== 'string' || !href) return null
    return { type: 'link', attrs: { href } }
  }
  if (mark.type === 'underline' || mark.type === 'strike' || mark.type === 'code') {
    return { type: mark.type }
  }

  return null
}

function copyAttrs(attrs: JSONContent['attrs']): Record<string, unknown> | undefined {
  if (!isRecord(attrs)) return undefined
  return { ...attrs }
}

function copyAdfAttrs(nodeType: string, attrs: JSONContent['attrs']): Record<string, unknown> | undefined {
  const copiedAttrs = copyAttrs(attrs)
  if (!copiedAttrs) return undefined

  if (nodeType === 'media') {
    delete copiedAttrs.src
  }

  return Object.keys(copiedAttrs).length ? copiedAttrs : undefined
}

function toEditorNode(
  node: JiraAdfNode,
  resolveMediaSrc: (attrs: Record<string, unknown> | undefined) => string | null,
): JSONContent | null {
  if (typeof node.type !== 'string' || !node.type) return null

  const editorNode: JSONContent = { type: node.type }
  if (typeof node.text === 'string') editorNode.text = node.text

  if (node.attrs) {
    editorNode.attrs = { ...node.attrs }
    if (node.type === 'media') {
      const src = resolveMediaSrc(editorNode.attrs)
      if (src) editorNode.attrs.src = src
    }
  }

  if (node.marks?.length) {
    const marks = node.marks
      .map(toEditorMark)
      .filter((mark): mark is NonNullable<typeof mark> => mark !== null)
    if (marks.length) editorNode.marks = marks
  }

  if (node.content?.length) {
    const content = node.content
      .map(child => toEditorNode(child, resolveMediaSrc))
      .filter((child): child is JSONContent => child !== null)
    if (content.length) editorNode.content = content
  }

  return editorNode
}

function toAdfNode(node: JSONContent): JiraAdfNode | null {
  if (typeof node.type !== 'string' || !node.type) return null

  const adfNode: JiraAdfNode = { type: node.type }
  if (typeof node.text === 'string') adfNode.text = node.text

  const attrs = copyAdfAttrs(node.type, node.attrs)
  if (attrs) adfNode.attrs = attrs

  if (node.marks?.length) {
    const marks = node.marks
      .map(toAdfMark)
      .filter((mark): mark is JiraAdfMark => mark !== null)
    if (marks.length) adfNode.marks = marks
  }

  if (node.content?.length) {
    const content = node.content
      .map(toAdfNode)
      .filter((child): child is JiraAdfNode => child !== null)
    if (content.length) adfNode.content = content
  }

  return adfNode
}

export function toEditorDocument(
  doc: JiraAdfDocument | null,
  resolveMediaSrc: (attrs: Record<string, unknown> | undefined) => string | null,
): JSONContent {
  if (!doc) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    }
  }

  const content = doc.content
    .map(node => toEditorNode(node, resolveMediaSrc))
    .filter((node): node is JSONContent => node !== null)

  return {
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }],
  }
}

export function readAdfDocument(json: JSONContent): JiraAdfDocument | null {
  const adfNode = toAdfNode(json)
  if (!adfNode || adfNode.type !== 'doc') return null

  return normalizeAdf({
    type: 'doc',
    version: 1,
    content: adfNode.content ?? [],
  })
}
