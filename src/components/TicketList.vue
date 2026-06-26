<script setup lang="ts">
import TicketListShell from './ticket-list/TicketListShell.vue'
import { useTicketListController } from '@/features/ticket-list/useTicketListController'

const controller = useTicketListController()
</script>

<template>
  <TicketListShell :controller="controller" />
</template>
