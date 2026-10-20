import { useSyncExternalStore } from 'react'
import { friendlyError } from '../lib/errors'

// Writes go to the local cache at once and sync in the background, so the UI doesn't wait for
// them. A write the server later rejects is reported here instead.
let messages: { id: number; text: string }[] = []
const listeners = new Set<() => void>()
let nextId = 0

function emit() {
  listeners.forEach((l) => l())
}

export function reportError(e: unknown) {
  console.error(e)
  const text = friendlyError(e) || 'That change couldn’t be saved.'
  const id = nextId++
  messages = [...messages, { id, text }]
  emit()
  setTimeout(() => {
    messages = messages.filter((m) => m.id !== id)
    emit()
  }, 6000)
}

/** Run a write without waiting for the server; failures surface as a toast. */
export function background(p: Promise<unknown>) {
  p.catch(reportError)
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => messages,
  )
}

/** A short confirmation, e.g. after a voice command is saved. */
export function notify(text: string) {
  const id = nextId++
  messages = [...messages, { id, text }]
  emit()
  setTimeout(() => {
    messages = messages.filter((m) => m.id !== id)
    emit()
  }, 3500)
}
