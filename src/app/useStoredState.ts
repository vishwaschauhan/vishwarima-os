import { useState } from 'react'

/** State remembered on this device (filters and toggles). Falls back to memory if storage is unavailable. */
export function useStoredState<T>(key: string, initial: T): [T, (v: T) => void] {
  const storageKey = `vishwarima.${key}`
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  return [
    value,
    (v: T) => {
      setValue(v)
      try {
        localStorage.setItem(storageKey, JSON.stringify(v))
      } catch {
        // Private mode or storage disabled: keep the in-memory value.
      }
    },
  ]
}
