import { useSyncExternalStore } from 'react'

// One voice sheet and one "+ Add" menu live in the shell; any screen can open them.

export interface VoiceOptions {
  /** The list on screen, used when the command doesn't name one. */
  listId?: string
  /** Prefill instead of listening (e.g. typed quick add). */
  text?: string
}

type State = { voice: VoiceOptions | null; addMenu: boolean }
let state: State = { voice: null, addMenu: false }
const listeners = new Set<() => void>()
const set = (s: Partial<State>) => {
  state = { ...state, ...s }
  listeners.forEach((l) => l())
}

export const openVoice = (opts: VoiceOptions = {}) => set({ voice: opts, addMenu: false })
export const closeVoice = () => set({ voice: null })
export const openAddMenu = () => set({ addMenu: true })
export const closeAddMenu = () => set({ addMenu: false })

export function useQuickAdd(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
