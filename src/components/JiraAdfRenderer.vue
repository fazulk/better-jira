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
</script>

<template>
  <div :class="nested ? 'space-y-2' : 'space-y-3'">
    <template v-for="(node, index) in props.nodes" :key="nodeKey(node, index)">
      <p v-if="node.type === 'paragraph'" class="text-sm leading-relaxed text-slate-400">
        <template v-for="(child, childIndex) in childNodes(node)" :key="nodeKey(child, childIndex)">
          <br v-if="child.type === 'hardBreak'">
          <a
            v-else-if="child.type === 'text' && linkHref(child)"
            :href="linkHref(child) ?? undefined"
            target="_blank"
            rel="noreferrer"
            class="text-violet-300 underline underline-offset-2 decoration-violet-300/60 break-all"
            @click.stop
          >
            <template v-for="(part, partIndex) in textParts(child.text)" :key="`${nodeKey(child, childIndex)}-${partIndex}`">
              <br v-if="partIndex > 0">
              {{ part }}
            </template>
          </a>
          <template v-else-if="child.type === 'text'">
            <template v-for="(part, partIndex) in textParts(child.text)" :key="`${nodeKey(child, childIndex)}-${partIndex}`">
              <br v-if="partIndex > 0">
              <span>{{ part }}</span>
            </template>
          </template>
          <JiraAdfRenderer v-else :nodes="[child]" nested />
        </template>
      </p>

      <div v-else-if="node.type === 'heading'" class="text-sm font-medium leading-relaxed text-slate-300">
        <template v-for="(child, childIndex) in childNodes(node)" :key="nodeKey(child, childIndex)">
          <a
            v-if="child.type === 'text' && linkHref(child)"
            :href="linkHref(child) ?? undefined"
            target="_blank"
            rel="noreferrer"
            class="text-violet-300 underline underline-offset-2 decoration-violet-300/60 break-all"
            @click.stop
          >
            <template v-for="(part, partIndex) in textParts(child.text)" :key="`${nodeKey(child, childIndex)}-${partIndex}`">
              <br v-if="partIndex > 0">
              {{ part }}
            </template>
          </a>
          <template v-else-if="child.type === 'text'">
            <template v-for="(part, partIndex) in textParts(child.text)" :key="`${nodeKey(child, childIndex)}-${partIndex}`">
              <br v-if="partIndex > 0">
              <span>{{ part }}</span>
            </template>
          </template>
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

      <div v-else-if="childNodes(node).length">
        <JiraAdfRenderer :nodes="childNodes(node)" nested />
      </div>
    </template>
  </div>
</template>
