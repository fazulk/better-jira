<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import type { JSONContent } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import type { JiraAdfDocument, JiraAdfMark, JiraAdfNode } from '@/types/jira'
import { isRecord, normalizeAdf } from '~/shared/jiraAdf'

const props = withDefaults(defineProps<{
  modelValue: JiraAdfDocument | null
  disabled?: boolean
  placeholder?: string
  unsupported?: boolean
}>(), {
  disabled: false,
  placeholder: 'Add a description...',
  unsupported: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: JiraAdfDocument | null]
}>()

const editorTick = ref(0)
const linkMenuOpen = ref(false)
const linkDraft = ref('')

function bumpEditorTick() {
  editorTick.value += 1
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
      attrs: { href },
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

  const attrs = copyAttrs(node.attrs)
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
    Placeholder.configure({
      placeholder: props.placeholder,
    }),
  ],
  content: toEditorDocument(props.modelValue),
  onCreate: bumpEditorTick,
  onSelectionUpdate: bumpEditorTick,
  onTransaction: bumpEditorTick,
  onUpdate: () => {
    emit('update:modelValue', readEditorDocument())
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
    ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-100'
    : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-white/[0.14] hover:bg-white/[0.05]'
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
  instance.chain().focus().extendMarkRange('link').setLink({ href }).run()
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

function getSelectValue(event: Event): string {
  const target = event.target
  return target instanceof HTMLSelectElement ? target.value : 'paragraph'
}

defineExpose({
  focusEditor,
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col space-y-3">
    <div
      class="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2"
      :class="unsupported ? 'opacity-70' : ''"
    >
      <select
        class="rounded-lg border border-white/[0.08] bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 outline-none transition focus:border-indigo-400"
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
        class="rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition"
        :class="buttonClass(!!editor?.isActive('bold'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleBold().run())"
        @click="toggleMark('bold')"
      >
        B
      </button>
      <button
        type="button"
        class="rounded-lg border px-2.5 py-1.5 text-xs italic transition"
        :class="buttonClass(!!editor?.isActive('italic'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleItalic().run())"
        @click="toggleMark('italic')"
      >
        I
      </button>
      <button
        type="button"
        class="rounded-lg border px-2.5 py-1.5 text-xs underline transition"
        :class="buttonClass(!!editor?.isActive('underline'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleUnderline().run())"
        @click="toggleMark('underline')"
      >
        U
      </button>
      <button
        type="button"
        class="rounded-lg border px-2.5 py-1.5 text-xs line-through transition"
        :class="buttonClass(!!editor?.isActive('strike'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleStrike().run())"
        @click="toggleMark('strike')"
      >
        S
      </button>
      <button
        type="button"
        class="rounded-lg border px-2.5 py-1.5 text-xs font-mono transition"
        :class="buttonClass(!!editor?.isActive('code'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleCode().run())"
        @click="toggleMark('code')"
      >
        &lt;/&gt;
      </button>
      <button
        type="button"
        class="rounded-lg border px-2.5 py-1.5 text-xs transition"
        :class="buttonClass(!!editor?.isActive('bulletList'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleBulletList().run())"
        @click="toggleNode('bulletList')"
      >
        • List
      </button>
      <button
        type="button"
        class="rounded-lg border px-2.5 py-1.5 text-xs transition"
        :class="buttonClass(!!editor?.isActive('orderedList'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleOrderedList().run())"
        @click="toggleNode('orderedList')"
      >
        1. List
      </button>
      <button
        type="button"
        class="rounded-lg border px-2.5 py-1.5 text-xs transition"
        :class="buttonClass(!!editor?.isActive('blockquote'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleBlockquote().run())"
        @click="toggleNode('blockquote')"
      >
        Quote
      </button>
      <button
        type="button"
        class="rounded-lg border px-2.5 py-1.5 text-xs transition"
        :class="buttonClass(!!editor?.isActive('codeBlock'))"
        :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleCodeBlock().run())"
        @click="toggleNode('codeBlock')"
      >
        Code
      </button>
      <button
        type="button"
        class="rounded-lg border px-2.5 py-1.5 text-xs transition"
        :class="buttonClass(!!editor?.isActive('link'))"
        :disabled="disabled || unsupported"
        @click="openLinkMenu"
      >
        Link
      </button>
      <button
        type="button"
        class="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-white/[0.14] hover:bg-white/[0.05]"
        :disabled="disabled || unsupported || !editor?.can().undo()"
        @click="editor?.chain().focus().undo().run()"
      >
        Undo
      </button>
      <button
        type="button"
        class="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-white/[0.14] hover:bg-white/[0.05]"
        :disabled="disabled || unsupported || !editor?.can().redo()"
        @click="editor?.chain().focus().redo().run()"
      >
        Redo
      </button>
    </div>

    <div v-if="linkMenuOpen" class="flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 py-2">
      <input
        v-model="linkDraft"
        type="text"
        class="min-w-[16rem] flex-1 rounded-lg border border-white/[0.08] bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-violet-400"
        placeholder="Paste or type a URL"
        :disabled="disabled || unsupported"
        @keydown.enter.prevent="applyLink"
        @keydown.esc.prevent="closeLinkMenu"
      >
      <button
        type="button"
        class="rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="disabled || unsupported"
        @click="applyLink"
      >
        Apply
      </button>
      <button
        type="button"
        class="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-300 transition hover:border-white/[0.14] hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="disabled || unsupported"
        @click="removeLink"
      >
        Remove
      </button>
      <button
        type="button"
        class="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-300 transition hover:border-white/[0.14] hover:bg-white/[0.05]"
        @click="closeLinkMenu"
      >
        Cancel
      </button>
    </div>

    <div
      class="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-indigo-500/30 bg-white/[0.04] transition focus-within:border-indigo-400 focus-within:bg-white/[0.06]"
      :class="unsupported ? 'opacity-70' : ''"
    >
      <EditorContent
        :editor="editor"
        class="jira-description-editor h-full min-h-[240px] w-full overflow-y-auto px-4 py-3 text-sm leading-relaxed text-slate-300 outline-none"
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

:deep(.jira-description-editor .ProseMirror li) {
  display: list-item;
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
