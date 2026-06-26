import type { JiraAdfDocument, JiraAdfMark, JiraAdfNode } from './jiraAdfTypes'

function buildTextNode(text: string): JiraAdfNode {
  return {
    type: 'text',
    text,
  }
}

function buildMarkedTextNode(text: string, marks: JiraAdfMark[]): JiraAdfNode {
  if (!marks.length) {
    return buildTextNode(text)
  }

  return {
    type: 'text',
    text,
    marks,
  }
}

function buildInlineContent(text: string): JiraAdfNode[] {
  const content: JiraAdfNode[] = []
  const inlinePattern = /https?:\/\/\S+|\*\*([^*\n]+)\*\*/g
  let lastIndex = 0

  for (const match of text.matchAll(inlinePattern)) {
    const matchedText = match[0]
    const matchIndex = match.index ?? 0

    if (matchIndex > lastIndex) {
      content.push(buildTextNode(text.slice(lastIndex, matchIndex)))
    }

    if (matchedText.startsWith('http://') || matchedText.startsWith('https://')) {
      content.push(buildMarkedTextNode(matchedText, [
        {
          type: 'link',
          attrs: {
            href: matchedText,
          },
        },
      ]))
    } else {
      const boldText = match[1]
      if (typeof boldText === 'string' && boldText.length > 0) {
        content.push(buildMarkedTextNode(boldText, [{ type: 'strong' }]))
      }
    }

    lastIndex = matchIndex + matchedText.length
  }

  if (lastIndex < text.length) {
    content.push(buildTextNode(text.slice(lastIndex)))
  }

  return content
}

function buildParagraph(text: string): JiraAdfNode {
  if (!text) {
    return {
      type: 'paragraph',
      content: [],
    }
  }

  return {
    type: 'paragraph',
    content: buildInlineContent(text),
  }
}

function buildListItem(text: string): JiraAdfNode {
  return {
    type: 'listItem',
    content: [buildParagraph(text)],
  }
}

function buildHeading(text: string, level: number): JiraAdfNode {
  return {
    type: 'heading',
    attrs: { level },
    content: buildInlineContent(text),
  }
}

export function plainTextToAdf(text: string): JiraAdfDocument | null {
  const normalizedText = text.replace(/\r\n/g, '\n')
  if (!normalizedText.trim()) return null

  const lines = normalizedText.split('\n')
  const content: JiraAdfNode[] = []

  for (let index = 0; index < lines.length;) {
    const line = lines[index]
    const markdownHeadingMatch = line.match(/^\s*(#{1,3})\s+(.+?)\s*$/)

    if (markdownHeadingMatch) {
      content.push(buildHeading(markdownHeadingMatch[2], markdownHeadingMatch[1].length))
      index += 1
      continue
    }

    const underlineLine = lines[index + 1]
    const setextHeadingMatch = underlineLine?.match(/^\s*([=-])\1{2,}\s*$/)
    if (setextHeadingMatch && line.trim()) {
      const level = setextHeadingMatch[1] === '=' ? 1 : 2
      content.push(buildHeading(line.trim(), level))
      index += 2
      continue
    }

    const bulletMatch = line.match(/^\s*[-*•]\s+(.*)$/)

    if (bulletMatch) {
      const items: JiraAdfNode[] = []
      while (index < lines.length) {
        const currentMatch = lines[index].match(/^\s*[-*•]\s+(.*)$/)
        if (!currentMatch) break
        items.push(buildListItem(currentMatch[1]))
        index += 1
      }

      content.push({
        type: 'bulletList',
        content: items,
      })
      continue
    }

    const orderedMatch = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
    if (orderedMatch) {
      const start = Number.parseInt(orderedMatch[1], 10)
      const items: JiraAdfNode[] = []

      while (index < lines.length) {
        const currentMatch = lines[index].match(/^\s*(\d+)[.)]\s+(.*)$/)
        if (!currentMatch) break
        items.push(buildListItem(currentMatch[2]))
        index += 1
      }

      const orderedList: JiraAdfNode = {
        type: 'orderedList',
        content: items,
      }

      if (Number.isFinite(start) && start > 1) {
        orderedList.attrs = { order: start }
      }

      content.push(orderedList)
      continue
    }

    content.push(buildParagraph(line))
    index += 1
  }

  return {
    type: 'doc',
    version: 1,
    content,
  }
}
