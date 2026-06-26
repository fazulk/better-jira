<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { Node, type JSONContent } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import type { JiraAdfDocument, JiraAdfMark, JiraAdfNode, JiraAttachment } from '@/types/jira'
import { isRecord, normalizeAdf } from '~/shared/jiraAdf'

const props = withDefaults(defineProps<{
  modelValue: JiraAdfDocument | null
  disabled?: boolean
  placeholder?: string
  unsupported?: boolean
  showToolbar?: boolean
  attachments?: JiraAttachment[]
  ticketKey?: string | null
}>(), {
  disabled: false,
  placeholder: 'Add a description...',
  unsupported: false,
  showToolbar: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: JiraAdfDocument | null]
  'preview-image': [payload: { src: string; alt: string }]
}>()

function attrString(attrs: Record<string, unknown> | undefined, key: string): string | null {
  const value = attrs?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function attrNumber(attrs: Record<string, unknown> | undefined, key: string): number | null {
  const value = attrs?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isImageFilename(filename: string): boolean {
  return /\.(apng|avif|gif|jpe?g|png|svg|webp)$/i.test(filename)
}

function isImageAttachment(attachment: JiraAttachment): boolean {
  const mimeType = attachment.mimeType?.toLowerCase()
  return mimeType?.startsWith('image/') === true || isImageFilename(attachment.filename)
}

function findMediaAttachment(attrs: Record<string, unknown> | undefined): JiraAttachment | null {
  const imageAttachments = (props.attachments ?? []).filter(isImageAttachment)
  if (!imageAttachments.length) return null

  const mediaId = attrString(attrs, 'id')
  const mediaAlt = attrString(attrs, 'alt')
  const mediaName = attrString(attrs, 'name')

  const idMatch = mediaId
    ? imageAttachments.find((attachment) => attachment.id === mediaId)
    : undefined
  if (idMatch) return idMatch

  const filenameMatch = [mediaAlt, mediaName]
    .filter((value): value is string => value !== null)
    .map((value) => imageAttachments.find((attachment) => attachment.filename === value))
    .find((attachment) => attachment !== undefined)
  if (filenameMatch) return filenameMatch

  return imageAttachments.length === 1 ? imageAttachments[0] : null
}

function attachmentContentUrl(attachmentId: string): string {
  return `/api/jira-attachments/${encodeURIComponent(attachmentId)}/content`
}

function ticketAttachmentContentUrl(filename: string): string | null {
  return props.ticketKey
    ? `/api/tickets/${encodeURIComponent(props.ticketKey)}/attachments/${encodeURIComponent(filename)}/content`
    : null
}

function mediaImageSrc(attrs: Record<string, unknown> | undefined): string | null {
  const directSrc = attrString(attrs, 'src') ?? attrString(attrs, 'url')
  if (directSrc) return directSrc

  const attachment = findMediaAttachment(attrs)
  if (attachment) return attachmentContentUrl(attachment.id)

  const mediaFilename = attrString(attrs, 'alt') ?? attrString(attrs, 'name')
  const filenameUrl = mediaFilename ? ticketAttachmentContentUrl(mediaFilename) : null
  if (filenameUrl) return filenameUrl

  const mediaId = attrString(attrs, 'id')
  return mediaId ? attachmentContentUrl(mediaId) : null
}

function mediaAltText(attrs: Record<string, unknown> | undefined): string {
  return attrString(attrs, 'alt') ?? attrString(attrs, 'name') ?? findMediaAttachment(attrs)?.filename ?? 'Attached image'
}

function mediaImageAttrs(attrs: Record<string, unknown> | undefined): Record<string, string | number> | null {
  const src = mediaImageSrc(attrs)
  if (!src) return null

  const imageAttrs: Record<string, string | number> = {
    src,
    alt: mediaAltText(attrs),
    loading: 'lazy',
    contenteditable: 'false',
  }

  const width = attrNumber(attrs, 'width')
  if (width !== null) {
    imageAttrs.width = width
  }

  const height = attrNumber(attrs, 'height')
  if (height !== null) {
    imageAttrs.height = height
  }

  return imageAttrs
}

const JiraMedia = Node.create({
  name: 'media',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: { default: null },
      type: { default: null },
      collection: { default: null },
      occurrenceKey: { default: null },
      alt: { default: null },
      name: { default: null },
      width: { default: null },
      height: { default: null },
      url: { default: null },
      src: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-jira-media]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const imageAttrs = mediaImageAttrs(HTMLAttributes)
    const alt = mediaAltText(HTMLAttributes)

    return [
      'figure',
      { 'data-jira-media': 'true', class: 'jira-description-media' },
      imageAttrs
        ? ['img', imageAttrs]
        : ['figcaption', { contenteditable: 'false' }, alt],
    ]
  },
})

const JiraMediaSingle = Node.create({
  name: 'mediaSingle',
  group: 'block',
  content: 'media',
  isolating: true,

  addAttributes() {
    return {
      layout: { default: null },
      width: { default: null },
      widthType: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-jira-media-single]' }]
  },

  renderHTML() {
    return ['div', { 'data-jira-media-single': 'true', class: 'jira-description-media-single' }, 0]
  },
})

const JiraMediaGroup = Node.create({
  name: 'mediaGroup',
  group: 'block',
  content: 'media+',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-jira-media-group]' }]
  },

  renderHTML() {
    return ['div', { 'data-jira-media-group': 'true', class: 'jira-description-media-group' }, 0]
  },
})

const editorTick = ref(0)
const linkMenuOpen = ref(false)
const linkDraft = ref('')

function bumpEditorTick() {
  editorTick.value += 1
}

function syncLinkTitlesSoon() {
  if (typeof window === 'undefined') return
  window.requestAnimationFrame(() => {
    const root = editor.value?.view.dom
    if (!root) return

    for (const link of root.querySelectorAll('a[href]')) {
      const href = link.getAttribute('href')
      if (href) link.setAttribute('title', href)
    }
  })
}

function toEditorMark(mark: JiraAdfMark): { type: string; attrs?: Record<string, unknown> } | null {
  if (typeof mark.type !== 'string' || !mark.type) return null

  if (mark.type === 'strong') {
    return { type: 'bold' }
  }

  if (mark.type === 'em') {
    return { type: 'italic' }
  }

  if (mark.type === 'link') {
    const href = mark.attrs?.href
    if (typeof href !== 'string' || !href) return null
    return {
      type: 'link',
      attrs: { href, title: href },
    }
  }

  return { type: mark.type }
}

function toAdfMark(mark: { type?: string; attrs?: Record<string, unknown> }): JiraAdfMark | null {
  if (typeof mark.type !== 'string' || !mark.type) return null

  if (mark.type === 'bold') {
    return { type: 'strong' }
  }

  if (mark.type === 'italic') {
    return { type: 'em' }
  }

  if (mark.type === 'link') {
    const href = mark.attrs?.href
    if (typeof href !== 'string' || !href) return null
    return {
      type: 'link',
      attrs: { href },
    }
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

function toEditorNode(node: JiraAdfNode): JSONContent | null {
  if (typeof node.type !== 'string' || !node.type) return null

  const editorNode: JSONContent = {
    type: node.type,
  }

  if (typeof node.text === 'string') {
    editorNode.text = node.text
  }

  if (node.attrs) {
    editorNode.attrs = { ...node.attrs }
    if (node.type === 'media') {
      const src = mediaImageSrc(editorNode.attrs)
      if (src) {
        editorNode.attrs.src = src
      }
    }
  }

  if (node.marks?.length) {
    const marks = node.marks
      .map(toEditorMark)
      .filter((mark): mark is NonNullable<typeof mark> => mark !== null)

    if (marks.length) {
      editorNode.marks = marks
    }
  }

  if (node.content?.length) {
    const content = node.content
      .map(toEditorNode)
      .filter((child): child is JSONContent => child !== null)

    if (content.length) {
      editorNode.content = content
    }
  }

  return editorNode
}

function toAdfNode(node: JSONContent): JiraAdfNode | null {
  if (typeof node.type !== 'string' || !node.type) return null

  const adfNode: JiraAdfNode = {
    type: node.type,
  }

  if (typeof node.text === 'string') {
    adfNode.text = node.text
  }

  const attrs = copyAdfAttrs(node.type, node.attrs)
  if (attrs) {
    adfNode.attrs = attrs
  }

  if (node.marks?.length) {
    const marks = node.marks
      .map(toAdfMark)
      .filter((mark): mark is JiraAdfMark => mark !== null)

    if (marks.length) {
      adfNode.marks = marks
    }
  }

  if (node.content?.length) {
    const content = node.content
      .map(toAdfNode)
      .filter((child): child is JiraAdfNode => child !== null)

    if (content.length) {
      adfNode.content = content
    }
  }

  return adfNode
}

function toEditorDocument(doc: JiraAdfDocument | null): JSONContent {
  if (!doc) {
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
        },
      ],
    }
  }

  const content = doc.content
    .map(toEditorNode)
    .filter((node): node is JSONContent => node !== null)

  return {
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }],
  }
}

function readEditorDocument(): JiraAdfDocument | null {
  const instance = editor.value
  if (!instance) return null

  const json = instance.getJSON()
  const adfNode = toAdfNode(json)
  if (!adfNode || adfNode.type !== 'doc') return null

  return normalizeAdf({
    type: 'doc',
    version: 1,
    content: adfNode.content ?? [],
  })
}

const editor = useEditor({
  editable: !(props.disabled || props.unsupported),
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
    }),
    Underline,
    JiraMedia,
    JiraMediaSingle,
    JiraMediaGroup,
    Placeholder.configure({
      placeholder: props.placeholder,
    }),
  ],
  content: toEditorDocument(props.modelValue),
  onCreate: () => {
    bumpEditorTick()
    syncLinkTitlesSoon()
  },
  onSelectionUpdate: bumpEditorTick,
  onTransaction: () => {
    bumpEditorTick()
    syncLinkTitlesSoon()
  },
  onUpdate: () => {
    emit('update:modelValue', readEditorDocument())
    syncLinkTitlesSoon()
  },
})

watch(() => props.modelValue, (nextValue) => {
  const instance = editor.value
  if (!instance) return

  const currentValue = readEditorDocument()
  if (JSON.stringify(currentValue) === JSON.stringify(normalizeAdf(nextValue))) {
    return
  }

  instance.commands.setContent(toEditorDocument(nextValue), false)
  bumpEditorTick()
  syncLinkTitlesSoon()
})

watch(() => props.disabled || props.unsupported, (nextDisabled) => {
  editor.value?.setEditable(!nextDisabled)
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

const currentBlockType = computed(() => {
  editorTick.value
  const instance = editor.value
  if (!instance) return 'paragraph'
  if (instance.isActive('heading', { level: 1 })) return 'heading-1'
  if (instance.isActive('heading', { level: 2 })) return 'heading-2'
  if (instance.isActive('heading', { level: 3 })) return 'heading-3'
  if (instance.isActive('blockquote')) return 'blockquote'
  if (instance.isActive('codeBlock')) return 'codeBlock'
  return 'paragraph'
})

function applyBlockType(value: string) {
  const instance = editor.value
  if (!instance || props.disabled || props.unsupported) return

  if (value === 'heading-1') {
    instance.chain().focus().toggleHeading({ level: 1 }).run()
    return
  }

  if (value === 'heading-2') {
    instance.chain().focus().toggleHeading({ level: 2 }).run()
    return
  }

  if (value === 'heading-3') {
    instance.chain().focus().toggleHeading({ level: 3 }).run()
    return
  }

  if (value === 'blockquote') {
    instance.chain().focus().toggleBlockquote().run()
    return
  }

  if (value === 'codeBlock') {
    instance.chain().focus().toggleCodeBlock().run()
    return
  }

  instance.chain().focus().setParagraph().run()
}

function buttonClass(isActive: boolean): string {
  return isActive
    ? 'border-white/[0.16] bg-white/[0.09] text-slate-100'
    : 'border-white/[0.08] bg-transparent text-slate-400 hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-slate-200'
}

function markButtonDisabled(commandSupported: boolean): boolean {
  return props.disabled || props.unsupported || !commandSupported
}

function toggleMark(action: 'bold' | 'italic' | 'underline' | 'strike' | 'code') {
  const instance = editor.value
  if (!instance || props.disabled || props.unsupported) return

  const chain = instance.chain().focus()

  if (action === 'bold') chain.toggleBold().run()
  if (action === 'italic') chain.toggleItalic().run()
  if (action === 'underline') chain.toggleUnderline().run()
  if (action === 'strike') chain.toggleStrike().run()
  if (action === 'code') chain.toggleCode().run()
}

function toggleNode(action: 'bulletList' | 'orderedList' | 'blockquote' | 'codeBlock') {
  const instance = editor.value
  if (!instance || props.disabled || props.unsupported) return

  const chain = instance.chain().focus()

  if (action === 'bulletList') chain.toggleBulletList().run()
  if (action === 'orderedList') chain.toggleOrderedList().run()
  if (action === 'blockquote') chain.toggleBlockquote().run()
  if (action === 'codeBlock') chain.toggleCodeBlock().run()
}

function openLinkMenu() {
  const instance = editor.value
  if (!instance || props.disabled || props.unsupported) return

  const currentHref = instance.getAttributes('link').href
  linkDraft.value = typeof currentHref === 'string' ? currentHref : ''
  linkMenuOpen.value = true
}

function closeLinkMenu() {
  linkMenuOpen.value = false
}

function applyLink() {
  const instance = editor.value
  if (!instance || props.disabled || props.unsupported) return

  const nextHref = linkDraft.value.trim()
  if (!nextHref) {
    instance.chain().focus().extendMarkRange('link').unsetLink().run()
    linkMenuOpen.value = false
    return
  }

  const href = /^https?:\/\//.test(nextHref) ? nextHref : `https://${nextHref}`
  instance.chain().focus().extendMarkRange('link').setLink({ href, title: href }).run()
  linkMenuOpen.value = false
}

function removeLink() {
  const instance = editor.value
  if (!instance || props.disabled || props.unsupported) return

  instance.chain().focus().extendMarkRange('link').unsetLink().run()
  linkMenuOpen.value = false
}

function focusEditor() {
  editor.value?.chain().focus('end').run()
}

function blurEditor() {
  editor.value?.commands.blur()
}

function getSelectValue(event: Event): string {
  const target = event.target
  return target instanceof HTMLSelectElement ? target.value : 'paragraph'
}

function handleEditorDoubleClick(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return

  const mediaImage = target.closest('.jira-description-media img')
  if (!(mediaImage instanceof HTMLImageElement)) return

  const src = mediaImage.currentSrc || mediaImage.src
  if (!src) return

  emit('preview-image', {
    src,
    alt: mediaImage.alt || 'Attached image',
  })
}

defineExpose({
  focusEditor,
  blurEditor,
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col space-y-2">
    <div
      class="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.015] px-2 py-2 transition-opacity"
      :class="[
        unsupported ? 'opacity-70' : '',
        showToolbar ? '' : 'pointer-events-none invisible',
      ]"
      :aria-hidden="!showToolbar"
    >
      <select
        class="h-7 rounded-md border border-white/[0.08] bg-surface-0 px-2 text-xs text-slate-300 outline-none transition focus:border-white/[0.16]"
        :disabled="disabled || unsupported"
        :value="currentBlockType"
        @change="applyBlockType(getSelectValue($event))"
      >
        <option value="paragraph">Paragraph</option>
        <option value="heading-1">Heading 1</option>
        <option value="heading-2">Heading 2</option>
        <option value="heading-3">Heading 3</option>
        <option value="blockquote">Quote</option>
        <option value="codeBlock">Code block</option>
      </select>

      <button
        type="button"
        class="h-7 rounded-md border px-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
        :class="buttonClass(!!editor?.isActive('bold'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleBold().run())"
        @click="toggleMark('bold')"
      >
        B
      </button>
      <button
        type="button"
        class="h-7 rounded-md border px-2 text-xs italic transition disabled:cursor-not-allowed disabled:opacity-50"
        :class="buttonClass(!!editor?.isActive('italic'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleItalic().run())"
        @click="toggleMark('italic')"
      >
        I
      </button>
      <button
        type="button"
        class="h-7 rounded-md border px-2 text-xs underline transition disabled:cursor-not-allowed disabled:opacity-50"
        :class="buttonClass(!!editor?.isActive('underline'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleUnderline().run())"
        @click="toggleMark('underline')"
      >
        U
      </button>
      <button
        type="button"
        class="h-7 rounded-md border px-2 text-xs line-through transition disabled:cursor-not-allowed disabled:opacity-50"
        :class="buttonClass(!!editor?.isActive('strike'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleStrike().run())"
        @click="toggleMark('strike')"
      >
        S
      </button>
      <button
        type="button"
        class="h-7 rounded-md border px-2 text-xs font-mono transition disabled:cursor-not-allowed disabled:opacity-50"
        :class="buttonClass(!!editor?.isActive('code'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleCode().run())"
        @click="toggleMark('code')"
      >
        &lt;/&gt;
      </button>
      <button
        type="button"
        class="h-7 rounded-md border px-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-50"
        :class="buttonClass(!!editor?.isActive('bulletList'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleBulletList().run())"
        @click="toggleNode('bulletList')"
      >
        • List
      </button>
      <button
        type="button"
        class="h-7 rounded-md border px-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-50"
        :class="buttonClass(!!editor?.isActive('orderedList'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleOrderedList().run())"
        @click="toggleNode('orderedList')"
      >
        1. List
      </button>
      <button
        type="button"
        class="h-7 rounded-md border px-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-50"
        :class="buttonClass(!!editor?.isActive('blockquote'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleBlockquote().run())"
        @click="toggleNode('blockquote')"
      >
        Quote
      </button>
      <button
        type="button"
        class="h-7 rounded-md border px-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-50"
        :class="buttonClass(!!editor?.isActive('codeBlock'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleCodeBlock().run())"
        @click="toggleNode('codeBlock')"
      >
        Code
      </button>
      <button
        type="button"
        class="h-7 rounded-md border px-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-50"
        :class="buttonClass(!!editor?.isActive('link'))"
        :disabled="disabled || unsupported"
        @click="openLinkMenu"
      >
        Link
      </button>
      <button
        type="button"
        class="h-7 rounded-md border border-white/[0.08] px-2 text-xs text-slate-400 transition hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="disabled || unsupported || !editor?.can().undo()"
        @click="editor?.chain().focus().undo().run()"
      >
        Undo
      </button>
      <button
        type="button"
        class="h-7 rounded-md border border-white/[0.08] px-2 text-xs text-slate-400 transition hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="disabled || unsupported || !editor?.can().redo()"
        @click="editor?.chain().focus().redo().run()"
      >
        Redo
      </button>
    </div>

    <div v-if="showToolbar && linkMenuOpen" class="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
      <input
        v-model="linkDraft"
        type="text"
        class="h-8 min-w-[16rem] flex-1 rounded-md border border-white/[0.08] bg-surface-0 px-3 text-[13px] text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-white/[0.16]"
        placeholder="Paste or type a URL"
        :disabled="disabled || unsupported"
        @keydown.enter.prevent="applyLink"
        @keydown.esc.prevent="closeLinkMenu"
      >
      <button
        type="button"
        class="h-8 rounded-md bg-accent-indigo px-3 text-xs font-medium text-white transition hover:bg-accent-indigo/90 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="disabled || unsupported"
        @click="applyLink"
      >
        Apply
      </button>
      <button
        type="button"
        class="h-8 rounded-md border border-white/[0.08] px-3 text-xs text-slate-400 transition hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="disabled || unsupported"
        @click="removeLink"
      >
        Remove
      </button>
      <button
        type="button"
        class="h-8 rounded-md border border-white/[0.08] px-3 text-xs text-slate-400 transition hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-slate-200"
        @click="closeLinkMenu"
      >
        Cancel
      </button>
    </div>

    <div
      class="flex min-h-0 flex-1 overflow-hidden"
      :class="unsupported ? 'opacity-70' : ''"
      @dblclick="handleEditorDoubleClick"
    >
      <EditorContent
        :editor="editor"
        class="jira-description-editor h-full min-h-[240px] w-full overflow-y-auto text-sm leading-relaxed text-slate-300 outline-none"
      />
    </div>
  </div>
</template>

<style scoped>
:deep(.jira-description-editor .ProseMirror) {
  height: 100%;
  min-height: 240px;
  overflow-y: auto;
  outline: none !important;
  border: 0;
  box-shadow: none !important;
}

:deep(.jira-description-editor .ProseMirror ul) {
  list-style-type: disc;
  padding-left: 1.5rem;
}

:deep(.jira-description-editor .ProseMirror ol) {
  list-style-type: decimal;
  padding-left: 1.5rem;
}

:deep(.jira-description-editor .ProseMirror > ul),
:deep(.jira-description-editor .ProseMirror > ol) {
  margin: 0 0 0.875rem;
}

:deep(.jira-description-editor .ProseMirror > ul:last-child),
:deep(.jira-description-editor .ProseMirror > ol:last-child) {
  margin-bottom: 0;
}

:deep(.jira-description-editor .ProseMirror p) {
  margin: 0 0 0.875rem;
}

:deep(.jira-description-editor .ProseMirror p:last-child) {
  margin-bottom: 0;
}

:deep(.jira-description-editor .ProseMirror a) {
  color: #d7d8dc;
  text-decoration-line: underline;
  text-decoration-color: #4cb782;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

:deep(.jira-description-editor .ProseMirror li) {
  display: list-item;
}

:deep(.jira-description-editor .ProseMirror .jira-description-media-single),
:deep(.jira-description-editor .ProseMirror .jira-description-media-group) {
  margin: 0 0 0.875rem;
}

:deep(.jira-description-editor .ProseMirror .jira-description-media-single:last-child),
:deep(.jira-description-editor .ProseMirror .jira-description-media-group:last-child) {
  margin-bottom: 0;
}

:deep(.jira-description-editor .ProseMirror .jira-description-media) {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  margin: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.025);
}

:deep(.jira-description-editor .ProseMirror .jira-description-media img) {
  display: block;
  max-width: 100%;
  max-height: 520px;
  object-fit: contain;
}

:deep(.jira-description-editor .ProseMirror .jira-description-media figcaption) {
  padding: 0.5rem 0.75rem;
  color: #8f9198;
  font-size: 0.75rem;
}

:deep(.jira-description-editor .ProseMirror ul ul) {
  list-style-type: circle;
}

:deep(.jira-description-editor .ProseMirror ul ul ul) {
  list-style-type: square;
}

:deep(.jira-description-editor .ProseMirror li p) {
  margin: 0;
}

:deep(.jira-description-editor .ProseMirror:focus),
:deep(.jira-description-editor .ProseMirror:focus-visible),
:deep(.jira-description-editor .ProseMirror-focused) {
  outline: none !important;
  box-shadow: none !important;
}
</style>
