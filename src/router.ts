import { createRouter, createWebHistory } from 'vue-router'
import TicketList from './components/TicketList.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/tickets',
    },
    {
      path: '/tickets',
      name: 'tickets',
      component: TicketList,
    },
    {
      path: '/tickets/:key',
      name: 'ticket',
      component: TicketList,
    },
  ],
})
