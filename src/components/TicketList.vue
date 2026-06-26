<script setup lang="ts">
import { useTicketListController } from '@/features/ticket-list/useTicketListController'
import TicketListShell from './ticket-list/TicketListShell.vue'

const controller = useTicketListController()
</script>

<template>
  <TicketListShell :controller="controller" />
</template>
