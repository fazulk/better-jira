<script setup lang="ts">
import type { JiraAdfMark, JiraAdfNode } from '@/types/jira'

defineOptions({
  name: 'JiraAdfRenderer',
})

const props = defineProps<{
  nodes: JiraAdfNode[]
  nested?: boolean
}>()

function nodeKey(node: JiraAdfNode, index: number): string {
  const localId = typeof node.attrs?.localId === 'string' ? node.attrs.localId : null
  return localId ?? `${node.type ?? 'node'}-${index}`
}

function getNodeOrder(node: JiraAdfNode): number {
  const order = node.attrs?.order
  return typeof order === 'number' && Number.isFinite(order) ? order : 1
}

function linkMark(node: JiraAdfNode): JiraAdfMark | undefined {
  return node.marks?.find((mark) => mark.type === 'link')
}

function linkHref(node: JiraAdfNode): string | null {
  const href = linkMark(node)?.attrs?.href
  return typeof href === 'string' ? href : null
}

function childNodes(node: JiraAdfNode): JiraAdfNode[] {
  return node.content ?? []
}

function textParts(text: string | undefined): string[] {
  if (!text) return []
  return text.split('\n')
}

function hasMark(node: JiraAdfNode, type: string): boolean {
  return node.marks?.some((mark) => mark.type === type) ?? false
}

function textNodeClass(node: JiraAdfNode): string {
  const classes = ['break-words']

  if (hasMark(node, 'strong')) classes.push('font-semibold', 'text-slate-200')
  if (hasMark(node, 'em')) classes.push('italic')
  if (hasMark(node, 'underline')) classes.push('underline', 'underline-offset-2')
  if (hasMark(node, 'strike')) classes.push('line-through')
  if (hasMark(node, 'code')) classes.push('rounded', 'bg-slate-950/80', 'px-1.5', 'py-0.5', 'font-mono', 'text-[13px]', 'text-emerald-200')

  if (linkHref(node)) {
    classes.push('text-violet-300', 'underline', 'underline-offset-2', 'decoration-violet-300/60')
  }

  return classes.join(' ')
}

function headingClass(node: JiraAdfNode): string {
  const level = node.attrs?.level
  if (level === 1) return 'text-xl font-semibold leading-snug text-slate-100'
  if (level === 2) return 'text-lg font-semibold leading-snug text-slate-100'
  if (level === 3) return 'text-base font-semibold leading-snug text-slate-200'
  return 'text-sm font-medium leading-relaxed text-slate-300'
}
</script>

<template>
  <div :class="nested ? 'space-y-2' : 'space-y-3'">
    <template v-for="(node, index) in props.nodes" :key="nodeKey(node, index)">
      <p v-if="node.type === 'paragraph'" class="text-sm leading-relaxed text-slate-400">
        <template v-for="(child, childIndex) in childNodes(node)" :key="nodeKey(child, childIndex)">
          <br v-if="child.type === 'hardBreak'">
          <component
            :is="linkHref(child) ? 'a' : 'span'"
            v-else-if="child.type === 'text'"
            :href="linkHref(child) ?? undefined"
            :target="linkHref(child) ? '_blank' : undefined"
            :rel="linkHref(child) ? 'noreferrer' : undefined"
            :class="textNodeClass(child)"
            @click.stop="linkHref(child) ? undefined : undefined"
          >
            <template v-for="(part, partIndex) in textParts(child.text)" :key="`${nodeKey(child, childIndex)}-${partIndex}`">
              <br v-if="partIndex > 0">
              <span>{{ part }}</span>
            </template>
          </component>
          <JiraAdfRenderer v-else :nodes="[child]" nested />
        </template>
      </p>

      <div v-else-if="node.type === 'heading'" :class="headingClass(node)">
        <template v-for="(child, childIndex) in childNodes(node)" :key="nodeKey(child, childIndex)">
          <component
            :is="linkHref(child) ? 'a' : 'span'"
            v-if="child.type === 'text'"
            :href="linkHref(child) ?? undefined"
            :target="linkHref(child) ? '_blank' : undefined"
            :rel="linkHref(child) ? 'noreferrer' : undefined"
            :class="textNodeClass(child)"
          >
            <template v-for="(part, partIndex) in textParts(child.text)" :key="`${nodeKey(child, childIndex)}-${partIndex}`">
              <br v-if="partIndex > 0">
              <span>{{ part }}</span>
            </template>
          </component>
          <JiraAdfRenderer v-else :nodes="[child]" nested />
        </template>
      </div>

      <ul v-else-if="node.type === 'bulletList'" class="list-disc space-y-2 pl-6 text-sm leading-relaxed text-slate-400 marker:text-slate-500">
        <li v-for="(child, childIndex) in childNodes(node)" :key="nodeKey(child, childIndex)">
          <JiraAdfRenderer :nodes="childNodes(child)" nested />
        </li>
      </ul>

      <ol
        v-else-if="node.type === 'orderedList'"
        class="list-decimal space-y-2 pl-6 text-sm leading-relaxed text-slate-400 marker:text-slate-500"
        :start="getNodeOrder(node)"
      >
        <li v-for="(child, childIndex) in childNodes(node)" :key="nodeKey(child, childIndex)">
          <JiraAdfRenderer :nodes="childNodes(child)" nested />
        </li>
      </ol>

      <pre
        v-else-if="node.type === 'codeBlock'"
        class="overflow-x-auto rounded-lg border border-white/[0.06] bg-slate-950/70 px-4 py-3 text-sm leading-relaxed text-slate-300"
      ><code>{{ childNodes(node).map((child) => child.text ?? '').join('') }}</code></pre>

      <blockquote
        v-else-if="node.type === 'blockquote'"
        class="border-l-2 border-indigo-400/50 pl-4 text-sm leading-relaxed text-slate-300"
      >
        <JiraAdfRenderer :nodes="childNodes(node)" nested />
      </blockquote>

      <div v-else-if="childNodes(node).length">
        <JiraAdfRenderer :nodes="childNodes(node)" nested />
      </div>
    </template>
  </div>
</template>
