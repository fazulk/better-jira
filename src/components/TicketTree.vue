<script setup lang="ts">
import { computed } from 'vue'
import TicketCard from './TicketCard.vue'
import type { JiraTicket } from '@/types/jira'

interface TicketTreeNode {
  ticket: JiraTicket
  children: TicketTreeNode[]
}

const props = defineProps<{
  tickets: JiraTicket[]
  depth?: number
}>()

defineEmits<{
  select: [key: string]
  prefetch: [key: string]
}>()

const depth = computed(() => props.depth ?? 0)

const tree = computed<TicketTreeNode[]>(() => {
  const nodes = new Map<string, TicketTreeNode>()

  for (const ticket of props.tickets) {
    nodes.set(ticket.key, { ticket, children: [] })
  }

  const roots: TicketTreeNode[] = []

  for (const node of nodes.values()) {
    const parentKey = node.ticket.parent?.key
    if (!parentKey) {
      roots.push(node)
      continue
    }

    const parentNode = nodes.get(parentKey)
    if (!parentNode) {
      roots.push(node)
      continue
    }

    parentNode.children.push(node)
  }

  return roots
})
</script>

<template>
  <div class="space-y-2">
    <div v-for="(node, i) in tree" :key="node.ticket.key" class="space-y-2">
      <TicketCard
        :ticket="node.ticket"
        :depth="depth"
        :index="i"
        @select="$emit('select', $event)"
        @prefetch="$emit('prefetch', $event)"
      />
      <div
        v-if="node.children.length > 0"
        class="ml-6 pl-4 tree-connector"
      >
        <TicketTree
          :tickets="node.children.map((child) => child.ticket)"
          :depth="depth + 1"
          @select="$emit('select', $event)"
          @prefetch="$emit('prefetch', $event)"
        />
      </div>
    </div>
  </div>
</template>
