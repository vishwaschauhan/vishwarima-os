import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore'
import type { AdHocTask, AgendaTask, FamilyEvent, TaskOverride } from '../domain/agenda'
import { firebase } from '../lib/firebase'

// Firestore applies writes to the local cache immediately and syncs in the background, so none
// of these are awaited by the UI for feedback; listeners show the change (marked pending) at once.

export interface Actor {
  hid: string
  uid: string
}

const stamp = (uid: string) => ({ updatedBy: uid, updatedAt: serverTimestamp() })
const hdoc = (hid: string, ...path: string[]) => doc(firebase().db, 'households', hid, ...path)

function logTo(batch: WriteBatch, a: Actor, action: string, summary: string) {
  batch.set(doc(collection(firebase().db, 'households', a.hid, 'activity')), {
    actorUid: a.uid,
    action,
    summary,
    at: serverTimestamp(),
  })
}

export async function logActivity(a: Actor, action: string, summary: string) {
  const batch = writeBatch(firebase().db)
  logTo(batch, a, action, summary)
  await batch.commit()
}

/** Fields every task state carries so history survives plan changes. */
function stateIdentity(t: AgendaTask) {
  return { taskId: t.occ.taskId, date: t.originalDate, title: t.occ.title }
}

export async function setCompleted(a: Actor, t: AgendaTask, completed: boolean) {
  const batch = writeBatch(firebase().db)
  batch.set(
    hdoc(a.hid, 'taskStates', t.occ.key),
    {
      ...stateIdentity(t),
      completed,
      completedBy: completed ? a.uid : null,
      completedAt: completed ? serverTimestamp() : null,
      ...(completed ? { skipped: false } : {}),
      ...stamp(a.uid),
    },
    { merge: true },
  )
  logTo(batch, a, completed ? 'task.completed' : 'task.reopened', `${t.occ.title}${t.occ.date ? ` (${t.occ.date})` : ''}`)
  await batch.commit()
}

export async function setSubtaskDone(a: Actor, t: AgendaTask, subtaskId: string, done: boolean) {
  await setDoc(
    hdoc(a.hid, 'taskStates', t.occ.key),
    {
      ...stateIdentity(t),
      // `completed` is required on a new state document; never overwrite an existing one here.
      ...(t.state ? {} : { completed: false }),
      subtasks: { [subtaskId]: { done, by: a.uid } },
      ...stamp(a.uid),
    },
    { merge: true },
  )
}

export async function setSkipped(a: Actor, t: AgendaTask, skipped: boolean) {
  const batch = writeBatch(firebase().db)
  batch.set(
    hdoc(a.hid, 'taskStates', t.occ.key),
    { ...stateIdentity(t), ...(t.state ? {} : { completed: false }), skipped, ...stamp(a.uid) },
    { merge: true },
  )
  logTo(batch, a, skipped ? 'task.skipped' : 'task.unskipped', `${t.occ.title} (${t.occ.date})`)
  await batch.commit()
}

export async function setResponse(a: Actor, t: AgendaTask, response: 'accepted' | 'discuss' | null) {
  const batch = writeBatch(firebase().db)
  batch.set(
    hdoc(a.hid, 'taskStates', t.occ.key),
    { ...stateIdentity(t), ...(t.state ? {} : { completed: false }), response, ...stamp(a.uid) },
    { merge: true },
  )
  if (response) logTo(batch, a, `task.${response}`, t.occ.title)
  await batch.commit()
}

/** "This occurrence only": stored as an override, never written back into the plan. */
export async function setOverride(a: Actor, t: AgendaTask, change: Omit<TaskOverride, 'key' | 'assignedBy'>, summary: string) {
  const batch = writeBatch(firebase().db)
  batch.set(
    hdoc(a.hid, 'taskOverrides', t.occ.key),
    {
      taskId: t.occ.taskId,
      date: t.originalDate,
      ...change,
      ...('owner' in change ? { assignedBy: a.uid } : {}),
      ...stamp(a.uid),
    },
    { merge: true },
  )
  logTo(batch, a, 'task.changed', summary)
  await batch.commit()
}

export async function clearOverride(a: Actor, t: AgendaTask) {
  await deleteDoc(hdoc(a.hid, 'taskOverrides', t.occ.key))
}

// ---------------------------------------------------------------------------
// Ad-hoc tasks

export type AdHocInput = Omit<AdHocTask, 'id' | 'createdBy' | 'assignedBy'>

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 12)}`

export async function createAdHoc(a: Actor, input: AdHocInput): Promise<string> {
  const id = newId('t')
  const batch = writeBatch(firebase().db)
  batch.set(hdoc(a.hid, 'adHocTasks', id), {
    ...input,
    archived: false,
    createdBy: a.uid,
    assignedBy: a.uid,
    createdAt: serverTimestamp(),
    ...stamp(a.uid),
  })
  logTo(batch, a, 'task.created', input.title)
  await batch.commit()
  return id
}

export async function updateAdHoc(a: Actor, before: AdHocTask, input: AdHocInput) {
  const batch = writeBatch(firebase().db)
  batch.update(hdoc(a.hid, 'adHocTasks', before.id), {
    ...input,
    ...(input.owner !== before.owner ? { assignedBy: a.uid } : {}),
    ...stamp(a.uid),
  })
  logTo(batch, a, input.owner !== before.owner ? 'task.reassigned' : 'task.edited', input.title)
  await batch.commit()
}

/**
 * "This and future" for a recurring ad-hoc task: end the old one the day before `from`
 * and start a new one from `from`, so past occurrences and their history stay as they were.
 */
export async function splitAdHoc(a: Actor, before: AdHocTask, from: string, input: AdHocInput) {
  const prevDay = new Date(`${from}T12:00:00Z`)
  prevDay.setUTCDate(prevDay.getUTCDate() - 1)
  const id = newId('t')
  const batch = writeBatch(firebase().db)
  batch.update(hdoc(a.hid, 'adHocTasks', before.id), { until: prevDay.toISOString().slice(0, 10), ...stamp(a.uid) })
  batch.set(hdoc(a.hid, 'adHocTasks', id), {
    ...input,
    date: from,
    archived: false,
    createdBy: a.uid,
    assignedBy: a.uid,
    createdAt: serverTimestamp(),
    ...stamp(a.uid),
  })
  logTo(batch, a, 'task.edited', `${input.title} from ${from} on`)
  await batch.commit()
}

export async function archiveAdHoc(a: Actor, task: AdHocTask) {
  const batch = writeBatch(firebase().db)
  batch.update(hdoc(a.hid, 'adHocTasks', task.id), { archived: true, ...stamp(a.uid) })
  logTo(batch, a, 'task.archived', task.title)
  await batch.commit()
}

// ---------------------------------------------------------------------------
// Events

export interface EventInput {
  title: string
  type: FamilyEvent['type']
  date: string
  start: string | null
  end: string | null
  participants: FamilyEvent['participants']
  busy: boolean
  visibility: FamilyEvent['visibility']
  coverage: FamilyEvent['coverage']
  recurrence: FamilyEvent['recurrence']
  location: string
  notes: string
}

/**
 * The shared record of a private block says only "Busy" and carries no notes or location;
 * the real title and details go to a document only the owner can read.
 */
function eventDocs(input: EventInput) {
  const common = {
    date: input.date,
    start: input.start,
    end: input.end,
    participants: input.participants,
    busy: input.busy,
    visibility: input.visibility,
    coverage: input.coverage ?? null,
    recurrence: input.recurrence,
    recurring: input.recurrence.type !== 'none',
  }
  if (input.visibility === 'private') {
    return {
      shared: { ...common, title: 'Busy', type: 'busy' as const },
      details: { title: input.title, notes: input.notes, location: input.location },
    }
  }
  return {
    shared: { ...common, title: input.title, type: input.type, notes: input.notes, location: input.location },
    details: null,
  }
}

export async function createEvent(a: Actor, input: EventInput): Promise<string> {
  const id = newId('e')
  const { shared, details } = eventDocs(input)
  const batch = writeBatch(firebase().db)
  batch.set(hdoc(a.hid, 'events', id), {
    ...shared,
    ownerUid: a.uid,
    createdBy: a.uid,
    createdAt: serverTimestamp(),
    ...stamp(a.uid),
  })
  if (details) batch.set(hdoc(a.hid, 'privateEventDetails', id), { ownerUid: a.uid, ...details, ...stamp(a.uid) })
  logTo(batch, a, 'event.created', `${shared.title} on ${input.date}`)
  await batch.commit()
  return id
}

export async function updateEvent(a: Actor, before: FamilyEvent, input: EventInput) {
  const { shared, details } = eventDocs(input)
  const batch = writeBatch(firebase().db)
  // Replace rather than merge so switching to private drops the old notes and location.
  batch.set(hdoc(a.hid, 'events', before.id), {
    ...shared,
    ownerUid: before.ownerUid,
    createdBy: before.createdBy,
    createdAt: (before as FamilyEvent & { createdAt?: unknown }).createdAt ?? serverTimestamp(),
    ...stamp(a.uid),
  })
  if (details) batch.set(hdoc(a.hid, 'privateEventDetails', before.id), { ownerUid: a.uid, ...details, ...stamp(a.uid) })
  else if (before.visibility === 'private') batch.delete(hdoc(a.hid, 'privateEventDetails', before.id))
  logTo(batch, a, 'event.edited', `${shared.title} on ${input.date}`)
  await batch.commit()
}

export async function deleteEvent(a: Actor, event: FamilyEvent) {
  const batch = writeBatch(firebase().db)
  batch.delete(hdoc(a.hid, 'events', event.id))
  if (event.visibility === 'private' && event.ownerUid === a.uid) batch.delete(hdoc(a.hid, 'privateEventDetails', event.id))
  logTo(batch, a, 'event.deleted', `${event.title} on ${event.date}`)
  await batch.commit()
}

// ---------------------------------------------------------------------------
// Household

export async function recordFirstUse(a: Actor, date: string) {
  await updateDoc(hdoc(a.hid), { firstUseDate: date, ...stamp(a.uid) })
}
