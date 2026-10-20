import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { AdHocTask, FamilyEvent, TaskOverride, TaskState } from '../domain/agenda'
import { addDays, type LocalDate } from '../domain/dates'
import { firebase } from '../lib/firebase'

export interface Live<T> {
  data: T[]
  loading: boolean
  error?: Error
  /** Number of documents with writes not yet acknowledged by the server. */
  pending: number
  /** True when the latest snapshot came from the local cache only. */
  fromCache: boolean
}

// Pending-write counts reported by every live query, summed for the sync indicator.
const pendingBySub = new Map<number, number>()
const pendingListeners = new Set<() => void>()
let nextSub = 0

function reportPending(sub: number, count: number) {
  if ((pendingBySub.get(sub) ?? 0) === count) return
  if (count) pendingBySub.set(sub, count)
  else pendingBySub.delete(sub)
  pendingListeners.forEach((l) => l())
}

/** Writes made on this device that the server hasn't acknowledged yet, across all open views. */
export function usePendingWrites(): number {
  return useSyncExternalStore(
    (l) => {
      pendingListeners.add(l)
      return () => pendingListeners.delete(l)
    },
    () => [...pendingBySub.values()].reduce((a, b) => a + b, 0),
  )
}

/** Subscribe to a query; `key` must change whenever the query does. */
export function useLiveQuery<T>(
  key: string | null,
  build: () => Query<DocumentData>,
  map: (d: QueryDocumentSnapshot<DocumentData>) => T,
): Live<T> {
  const [state, setState] = useState<Live<T>>({ data: [], loading: true, pending: 0, fromCache: false })
  useEffect(() => {
    if (!key) return
    setState((s) => ({ ...s, loading: true }))
    const sub = nextSub++
    const unsubscribe = onSnapshot(
      build(),
      { includeMetadataChanges: true },
      (snap) => {
        const pending = snap.docs.filter((d) => d.metadata.hasPendingWrites).length
        reportPending(sub, pending)
        setState({ data: snap.docs.map(map), loading: false, pending, fromCache: snap.metadata.fromCache })
      },
      (error) => setState((s) => ({ ...s, loading: false, error })),
    )
    return () => {
      unsubscribe()
      reportPending(sub, 0)
    }
    // build/map are recreated each render; `key` identifies the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

const col = (hid: string, name: string) => collection(firebase().db, 'households', hid, name)

const toDate = (v: unknown) => (v && typeof (v as Timestamp).toDate === 'function' ? (v as Timestamp).toDate() : null)

function toState(d: QueryDocumentSnapshot<DocumentData>): TaskState {
  const x = d.data({ serverTimestamps: 'estimate' })
  return {
    key: d.id,
    completed: Boolean(x.completed),
    completedBy: x.completedBy ?? null,
    completedAt: toDate(x.completedAt),
    skipped: Boolean(x.skipped),
    subtasks: x.subtasks ?? {},
    response: x.response ?? null,
    pending: d.metadata.hasPendingWrites,
  }
}

function toOverride(d: QueryDocumentSnapshot<DocumentData>): TaskOverride {
  return { key: d.id, ...(d.data() as Omit<TaskOverride, 'key'>) }
}

function toEvent(d: QueryDocumentSnapshot<DocumentData>): FamilyEvent {
  return { id: d.id, ...(d.data() as Omit<FamilyEvent, 'id'>), pending: d.metadata.hasPendingWrites }
}

/** Snoozes move a task up to this many days forward, so ranges look back this far for them. */
export const SNOOZE_WINDOW_DAYS = 14

/** Completion states and overrides for occurrences originally dated in [from - window, to], plus undated to-dos. */
export function useTaskRange(hid: string, from: LocalDate, to: LocalDate) {
  const start = addDays(from, -SNOOZE_WINDOW_DAYS)
  const states = useLiveQuery(`states:${hid}:${start}:${to}`, () =>
    query(col(hid, 'taskStates'), where('date', '>=', start), where('date', '<=', to)),
  toState)
  const undated = useLiveQuery(`undated:${hid}`, () => query(col(hid, 'taskStates'), where('date', '==', '')), toState)
  const overrides = useLiveQuery(`overrides:${hid}:${start}:${to}`, () =>
    query(col(hid, 'taskOverrides'), where('date', '>=', start), where('date', '<=', to)),
  toOverride)

  return useMemo(
    () => ({
      states: new Map([...states.data, ...undated.data].map((s) => [s.key, s])),
      overrides: new Map(overrides.data.map((o) => [o.key, o])),
      loading: states.loading || overrides.loading,
      pending: states.pending + undated.pending + overrides.pending,
      error: states.error ?? overrides.error ?? undated.error,
    }),
    [states, undated, overrides],
  )
}

export function useAdHocTasks(hid: string) {
  return useLiveQuery(
    `adhoc:${hid}`,
    () => query(col(hid, 'adHocTasks'), where('archived', '==', false)),
    (d) => ({ id: d.id, ...(d.data() as Omit<AdHocTask, 'id'>) }) as AdHocTask,
  )
}

/** One-off events in range plus all recurring events (there are only a few). */
export function useEventRange(hid: string, from: LocalDate, to: LocalDate) {
  const oneOff = useLiveQuery(`events:${hid}:${from}:${to}`, () =>
    query(col(hid, 'events'), where('recurring', '==', false), where('date', '>=', from), where('date', '<=', to)),
  toEvent)
  const recurring = useLiveQuery(`recurring:${hid}`, () => query(col(hid, 'events'), where('recurring', '==', true)), toEvent)
  return useMemo(
    () => ({
      events: [...oneOff.data, ...recurring.data],
      loading: oneOff.loading || recurring.loading,
      pending: oneOff.pending + recurring.pending,
      error: oneOff.error ?? recurring.error,
    }),
    [oneOff, recurring],
  )
}

export interface PrivateDetails {
  id: string
  title: string
  notes?: string
  location?: string
}

/** The signed-in member's own private event details. Rules make everyone else's unreadable. */
export function usePrivateDetails(hid: string, uid: string) {
  return useLiveQuery(
    `private:${hid}:${uid}`,
    () => query(col(hid, 'privateEventDetails'), where('ownerUid', '==', uid)),
    (d) => ({ id: d.id, ...(d.data() as Omit<PrivateDetails, 'id'>) }),
  )
}

export interface Member {
  uid: string
  displayName: string
  planMemberId: 'vishwas' | 'garima'
  email?: string
}

export function useMembers(hid: string) {
  return useLiveQuery(`members:${hid}`, () => query(col(hid, 'members')), (d) => ({ uid: d.id, ...(d.data() as Omit<Member, 'uid'>) }))
}

export interface ActivityEntry {
  id: string
  actorUid: string
  action: string
  summary?: string
  at: Date | null
}

export function useActivity(hid: string, count = 50) {
  return useLiveQuery(
    `activity:${hid}:${count}`,
    () => query(col(hid, 'activity'), orderBy('at', 'desc'), limit(count)),
    (d) => {
      const x = d.data({ serverTimestamps: 'estimate' })
      return { id: d.id, actorUid: x.actorUid, action: x.action, summary: x.summary, at: toDate(x.at) } as ActivityEntry
    },
  )
}
