<script setup lang="ts">
import type { Editor } from '@tiptap/core'

const props = defineProps<{
  currentBlockType: string
  disabled: boolean
  editor: Editor | null | undefined
  linkDraft: string
  linkMenuOpen: boolean
  showToolbar: boolean
  unsupported: boolean
}>()

const emit = defineEmits<{
  'applyBlockType': [value: string]
  'applyLink': []
  'closeLinkMenu': []
  'openLinkMenu': []
  'removeLink': []
  'toggleMark': [action: 'bold' | 'italic' | 'underline' | 'strike' | 'code']
  'toggleNode': [action: 'bulletList' | 'orderedList' | 'blockquote' | 'codeBlock']
  'update:linkDraft': [value: string]
}>()

function buttonClass(isActive: boolean): string {
  return isActive
    ? 'border-white/[0.16] bg-white/[0.09] text-slate-100'
    : 'border-white/[0.08] bg-transparent text-slate-400 hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-slate-200'
}

function markButtonDisabled(commandSupported: boolean): boolean {
  return props.disabled || props.unsupported || !commandSupported
}

function getSelectValue(event: Event): string {
  const target = event.target
  return target instanceof HTMLSelectElement ? target.value : 'paragraph'
}

function getInputValue(event: Event): string {
  const target = event.target
  return target instanceof HTMLInputElement ? target.value : ''
}
</script>

<template>
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
      @change="emit('applyBlockType', getSelectValue($event))"
    >
      <option value="paragraph">
        Paragraph
      </option>
      <option value="heading-1">
        Heading 1
      </option>
      <option value="heading-2">
        Heading 2
      </option>
      <option value="heading-3">
        Heading 3
      </option>
      <option value="blockquote">
        Quote
      </option>
      <option value="codeBlock">
        Code block
      </option>
    </select>

    <button type="button" class="h-7 rounded-md border px-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50" :class="buttonClass(!!editor?.isActive('bold'))" :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleBold().run())" @click="emit('toggleMark', 'bold')">
      B
    </button>
    <button type="button" class="h-7 rounded-md border px-2 text-xs italic transition disabled:cursor-not-allowed disabled:opacity-50" :class="buttonClass(!!editor?.isActive('italic'))" :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleItalic().run())" @click="emit('toggleMark', 'italic')">
      I
    </button>
    <button type="button" class="h-7 rounded-md border px-2 text-xs underline transition disabled:cursor-not-allowed disabled:opacity-50" :class="buttonClass(!!editor?.isActive('underline'))" :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleUnderline().run())" @click="emit('toggleMark', 'underline')">
      U
    </button>
    <button type="button" class="h-7 rounded-md border px-2 text-xs line-through transition disabled:cursor-not-allowed disabled:opacity-50" :class="buttonClass(!!editor?.isActive('strike'))" :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleStrike().run())" @click="emit('toggleMark', 'strike')">
      S
    </button>
    <button type="button" class="h-7 rounded-md border px-2 text-xs font-mono transition disabled:cursor-not-allowed disabled:opacity-50" :class="buttonClass(!!editor?.isActive('code'))" :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleCode().run())" @click="emit('toggleMark', 'code')">
      &lt;/&gt;
    </button>
    <button type="button" class="h-7 rounded-md border px-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-50" :class="buttonClass(!!editor?.isActive('bulletList'))" :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleBulletList().run())" @click="emit('toggleNode', 'bulletList')">
      • List
    </button>
    <button type="button" class="h-7 rounded-md border px-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-50" :class="buttonClass(!!editor?.isActive('orderedList'))" :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleOrderedList().run())" @click="emit('toggleNode', 'orderedList')">
      1. List
    </button>
    <button type="button" class="h-7 rounded-md border px-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-50" :class="buttonClass(!!editor?.isActive('blockquote'))" :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleBlockquote().run())" @click="emit('toggleNode', 'blockquote')">
      Quote
    </button>
    <button type="button" class="h-7 rounded-md border px-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-50" :class="buttonClass(!!editor?.isActive('codeBlock'))" :disabled="markButtonDisabled(!!editor?.can().chain().focus().toggleCodeBlock().run())" @click="emit('toggleNode', 'codeBlock')">
      Code
    </button>
    <button type="button" class="h-7 rounded-md border px-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-50" :class="buttonClass(!!editor?.isActive('link'))" :disabled="disabled || unsupported" @click="emit('openLinkMenu')">
      Link
    </button>
    <button type="button" class="h-7 rounded-md border border-white/[0.08] px-2 text-xs text-slate-400 transition hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50" :disabled="disabled || unsupported || !editor?.can().undo()" @click="editor?.chain().focus().undo().run()">
      Undo
    </button>
    <button type="button" class="h-7 rounded-md border border-white/[0.08] px-2 text-xs text-slate-400 transition hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50" :disabled="disabled || unsupported || !editor?.can().redo()" @click="editor?.chain().focus().redo().run()">
      Redo
    </button>
  </div>

  <div v-if="showToolbar && linkMenuOpen" class="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
    <input
      :value="linkDraft"
      type="text"
      class="h-8 min-w-[16rem] flex-1 rounded-md border border-white/[0.08] bg-surface-0 px-3 text-[13px] text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-white/[0.16]"
      placeholder="Paste or type a URL"
      :disabled="disabled || unsupported"
      @input="emit('update:linkDraft', getInputValue($event))"
      @keydown.enter.prevent="emit('applyLink')"
      @keydown.esc.prevent="emit('closeLinkMenu')"
    >
    <button type="button" class="h-8 rounded-md bg-accent-indigo px-3 text-xs font-medium text-white transition hover:bg-accent-indigo/90 disabled:cursor-not-allowed disabled:opacity-60" :disabled="disabled || unsupported" @click="emit('applyLink')">
      Apply
    </button>
    <button type="button" class="h-8 rounded-md border border-white/[0.08] px-3 text-xs text-slate-400 transition hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60" :disabled="disabled || unsupported" @click="emit('removeLink')">
      Remove
    </button>
    <button type="button" class="h-8 rounded-md border border-white/[0.08] px-3 text-xs text-slate-400 transition hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-slate-200" @click="emit('closeLinkMenu')">
      Cancel
    </button>
  </div>
</template>
