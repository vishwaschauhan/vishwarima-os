import { collection, doc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import type { PlanVersion } from '../domain/occurrences'
import { parsePlanMarkdown } from '../domain/plan'
import { firebase } from '../lib/firebase'

export interface StoredPlanVersion extends PlanVersion {
  markdown: string
  note?: string
}

export interface PlanVersionsState {
  versions: StoredPlanVersion[]
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
        const versions: StoredPlanVersion[] = []
        const invalid: PlanVersionsState['invalid'] = []
        for (const d of snap.docs) {
          const data = d.data() as { markdown: string; effectiveFrom: string; note?: string }
          const parsed = parsePlanMarkdown(data.markdown)
          if (parsed.ok) versions.push({ id: d.id, effectiveFrom: data.effectiveFrom, plan: parsed.plan, markdown: data.markdown, note: data.note })
          else invalid.push({ id: d.id, errors: parsed.errors })
        }
        setState({ versions, invalid, loading: false })
      },
      (error) => setState((s) => ({ ...s, loading: false, error })),
    )
  }, [householdId])

  return state
}

/**
 * Activate a new plan version from `effectiveFrom` onward. The version and the household's
 * pointer change in one batch. Version IDs are sequential and versions can't be overwritten,
 * so if both of you apply at once, the second apply fails instead of replacing the first.
 */
export async function applyPlanVersion(
  a: { hid: string; uid: string },
  versionId: string,
  markdown: string,
  effectiveFrom: string,
  note: string,
) {
  const { db } = firebase()
  const ref = doc(db, 'households', a.hid)
  const batch = writeBatch(db)
  batch.set(doc(ref, 'planVersions', versionId), {
    markdown,
    effectiveFrom,
    note,
    authorUid: a.uid,
    createdAt: serverTimestamp(),
  })
  batch.update(ref, { activePlanVersion: versionId, updatedBy: a.uid, updatedAt: serverTimestamp() })
  batch.set(doc(collection(ref, 'activity')), {
    actorUid: a.uid,
    action: 'plan.applied',
    summary: `Plan ${versionId} from ${effectiveFrom}${note ? `: ${note}` : ''}`,
    at: serverTimestamp(),
  })
  await batch.commit()
}

export function nextVersionId(versions: { id: string }[]): string {
  const n = Math.max(0, ...versions.map((v) => Number(/^v(\d+)$/.exec(v.id)?.[1] ?? 0)))
  return `v${n + 1}`
}
