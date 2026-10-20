import { collection, onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import type { PlanVersion } from '../domain/occurrences'
import { parsePlanMarkdown } from '../domain/plan'
import { firebase } from '../lib/firebase'

export interface PlanVersionsState {
  versions: PlanVersion[]
  /** Versions whose stored Markdown failed validation; they are ignored for scheduling. */
  invalid: { id: string; errors: string[] }[]
  loading: boolean
  error?: Error
}

/** Live list of the household's plan versions. There are only a handful, so all are loaded. */
export function usePlanVersions(householdId: string): PlanVersionsState {
  const [state, setState] = useState<PlanVersionsState>({ versions: [], invalid: [], loading: true })

  useEffect(() => {
    const { db } = firebase()
    return onSnapshot(
      collection(db, 'households', householdId, 'planVersions'),
      (snap) => {
        const versions: PlanVersion[] = []
        const invalid: PlanVersionsState['invalid'] = []
        for (const d of snap.docs) {
          const data = d.data() as { markdown: string; effectiveFrom: string }
          const parsed = parsePlanMarkdown(data.markdown)
          if (parsed.ok) versions.push({ id: d.id, effectiveFrom: data.effectiveFrom, plan: parsed.plan })
          else invalid.push({ id: d.id, errors: parsed.errors })
        }
        setState({ versions, invalid, loading: false })
      },
      (error) => setState((s) => ({ ...s, loading: false, error })),
    )
  }, [householdId])

  return state
}
