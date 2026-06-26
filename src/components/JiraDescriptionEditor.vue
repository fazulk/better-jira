<script setup lang="ts">
import type { JiraAdfDocument, JiraAttachment } from '@/types/jira'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import JiraDescriptionEditorToolbar from '@/components/jira-description-editor/JiraDescriptionEditorToolbar.vue'
import { readAdfDocument, toEditorDocument } from '@/features/jira-description-editor/adfDocument'
import { createJiraMediaExtensions, mediaImageSrc } from '@/features/jira-description-editor/mediaExtensions'
import { usePastedImageUpload } from '@/features/jira-description-editor/usePastedImageUpload'
import { normalizeAdf } from '~/shared/jiraAdf'

const props = withDefaults(defineProps<{
  modelValue: JiraAdfDocument | null
  disabled?: boolean
  placeholder?: string
  unsupported?: boolean
  showToolbar?: boolean
  attachments?: JiraAttachment[]
  ticketKey?: string | null
  uploadImage?: (file: File) => Promise<JiraAttachment>
}>(), {
  disabled: false,
  placeholder: 'Add a description...',
  unsupported: false,
  showToolbar: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: JiraAdfDocument | null]
  'preview-image': [payload: { src: string, alt: string }]
}>()

const mediaContext = {
  attachments: () => props.attachments ?? [],
  ticketKey: () => props.ticketKey,
}
const [JiraMedia, JiraMediaSingle, JiraMediaGroup] = createJiraMediaExtensions(mediaContext)
const resolveMediaSrc = (attrs: Record<string, unknown> | undefined) => mediaImageSrc(attrs, mediaContext)

const editorTick = ref(0)
const linkMenuOpen = ref(false)
const linkDraft = ref('')

function bumpEditorTick() {
  editorTick.value += 1
}

function syncLinkTitlesSoon() {
  if (typeof window === 'undefined')
    return
  window.requestAnimationFrame(() => {
    const root = editor.value?.view.dom
    if (!root)
      return

    for (const link of root.querySelectorAll('a[href]')) {
      const href = link.getAttribute('href')
      if (href)
        link.setAttribute('title', href)
    }
  })
}

function readEditorDocument(): JiraAdfDocument | null {
  const instance = editor.value
  if (!instance)
    return null

  return readAdfDocument(instance.getJSON())
}

const { handlePaste } = usePastedImageUpload({
  disabled: () => props.disabled,
  editor: () => editor.value,
  ticketKey: () => props.ticketKey,
  unsupported: () => props.unsupported,
  uploadImage: () => props.uploadImage,
})

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
  content: toEditorDocument(props.modelValue, resolveMediaSrc),
  editorProps: {
    handlePaste,
  },
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
  if (!instance)
    return

  const currentValue = readEditorDocument()
  if (JSON.stringify(currentValue) === JSON.stringify(normalizeAdf(nextValue))) {
    return
  }

  instance.commands.setContent(toEditorDocument(nextValue, resolveMediaSrc), false)
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
  if (!instance)
    return 'paragraph'
  if (instance.isActive('heading', { level: 1 }))
    return 'heading-1'
  if (instance.isActive('heading', { level: 2 }))
    return 'heading-2'
  if (instance.isActive('heading', { level: 3 }))
    return 'heading-3'
  if (instance.isActive('blockquote'))
    return 'blockquote'
  if (instance.isActive('codeBlock'))
    return 'codeBlock'
  return 'paragraph'
})

function applyBlockType(value: string) {
  const instance = editor.value
  if (!instance || props.disabled || props.unsupported)
    return

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

function toggleMark(action: 'bold' | 'italic' | 'underline' | 'strike' | 'code') {
  const instance = editor.value
  if (!instance || props.disabled || props.unsupported)
    return

  const chain = instance.chain().focus()

  if (action === 'bold')
    chain.toggleBold().run()
  if (action === 'italic')
    chain.toggleItalic().run()
  if (action === 'underline')
    chain.toggleUnderline().run()
  if (action === 'strike')
    chain.toggleStrike().run()
  if (action === 'code')
    chain.toggleCode().run()
}

function toggleNode(action: 'bulletList' | 'orderedList' | 'blockquote' | 'codeBlock') {
  const instance = editor.value
  if (!instance || props.disabled || props.unsupported)
    return

  const chain = instance.chain().focus()

  if (action === 'bulletList')
    chain.toggleBulletList().run()
  if (action === 'orderedList')
    chain.toggleOrderedList().run()
  if (action === 'blockquote')
    chain.toggleBlockquote().run()
  if (action === 'codeBlock')
    chain.toggleCodeBlock().run()
}

function openLinkMenu() {
  const instance = editor.value
  if (!instance || props.disabled || props.unsupported)
    return

  const currentHref = instance.getAttributes('link').href
  linkDraft.value = typeof currentHref === 'string' ? currentHref : ''
  linkMenuOpen.value = true
}

function closeLinkMenu() {
  linkMenuOpen.value = false
}

function applyLink() {
  const instance = editor.value
  if (!instance || props.disabled || props.unsupported)
    return

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
  if (!instance || props.disabled || props.unsupported)
    return

  instance.chain().focus().extendMarkRange('link').unsetLink().run()
  linkMenuOpen.value = false
}

function focusEditor() {
  editor.value?.chain().focus('end').run()
}

function blurEditor() {
  editor.value?.commands.blur()
}

function handleEditorDoubleClick(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element))
    return

  const mediaImage = target.closest('.jira-description-media img')
  if (!(mediaImage instanceof HTMLImageElement))
    return

  const src = mediaImage.currentSrc || mediaImage.src
  if (!src)
    return

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
    <JiraDescriptionEditorToolbar
      v-model:link-draft="linkDraft"
      :current-block-type="currentBlockType"
      :disabled="disabled"
      :editor="editor"
      :link-menu-open="linkMenuOpen"
      :show-toolbar="showToolbar"
      :unsupported="unsupported"
      @apply-block-type="applyBlockType"
      @apply-link="applyLink"
      @close-link-menu="closeLinkMenu"
      @open-link-menu="openLinkMenu"
      @remove-link="removeLink"
      @toggle-mark="toggleMark"
      @toggle-node="toggleNode"
    />

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

<style src="@/assets/jiraDescriptionEditor.css"></style>
