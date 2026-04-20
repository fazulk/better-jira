export interface ToastItem {
  id: string
  kind: 'success' | 'error'
  message: string
}

interface ShowToastInput {
  kind: ToastItem['kind']
  message: string
  durationMs?: number
}

function getToastState() {
  return useState<ToastItem[]>('toast-items', () => [])
}

function removeToastById(id: string): void {
  const toasts = getToastState()
  toasts.value = toasts.value.filter(toast => toast.id !== id)
}

function showToast(input: ShowToastInput): void {
  const message = input.message.trim()
  if (!message) {
    return
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const toasts = getToastState()
  toasts.value = [
    ...toasts.value,
    {
      id,
      kind: input.kind,
      message,
    },
  ]

  const durationMs = input.durationMs ?? 5000
  setTimeout(() => {
    removeToastById(id)
  }, durationMs)
}

export function useToast() {
  const toasts = getToastState()

  return {
    toasts,
    showToast,
    showError(message: string, durationMs?: number) {
      showToast({ kind: 'error', message, durationMs })
    },
    showSuccess(message: string, durationMs?: number) {
      showToast({ kind: 'success', message, durationMs })
    },
    removeToast: removeToastById,
  }
}
