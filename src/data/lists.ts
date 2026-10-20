import {
  collection,
  doc,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import type { Priority } from '../domain/agenda'
import { DEFAULT_LISTS, type ListDef, type ListItem, type ListType } from '../domain/lists'
import type { Owner } from '../domain/plan'
import { firebase } from '../lib/firebase'
import { useLiveQuery } from './live'
import type { Actor } from './mutations'

// Shared lists. Like every other write in the app these apply to the local cache at once and
// sync in the background; IDs are generated on the device, so a retried write never duplicates.

const db = () => firebase().db
const col = (hid: string, name: string) => collection(db(), 'households', hid, name)
const hdoc = (hid: string, ...path: string[]) => doc(db(), 'households', hid, ...path)
const stamp = (uid: string) => ({ updatedBy: uid, updatedAt: serverTimestamp() })
const toDate = (v: unknown) => (v && typeof (v as Timestamp).toDate === 'function' ? (v as Timestamp).toDate() : null)

function logTo(batch: ReturnType<typeof writeBatch>, a: Actor, action: string, summary: string) {
  batch.set(doc(col(a.hid, 'activity')), { actorUid: a.uid, action, summary, at: serverTimestamp() })
}

function toList(d: QueryDocumentSnapshot<DocumentData>): ListDef {
  const x = d.data()
  return { id: d.id, title: x.title, type: x.type, sortOrder: x.sortOrder ?? 0, archived: Boolean(x.archived), createdBy: x.createdBy }
}

function toItem(d: QueryDocumentSnapshot<DocumentData>): ListItem {
  const x = d.data({ serverTimestamps: 'estimate' })
  return {
    id: d.id,
    listId: x.listId,
    title: x.title,
    details: x.details ?? null,
    assignedTo: x.assignedTo ?? 'unassigned',
    assignedBy: x.assignedBy ?? null,
    dueDate: x.dueDate ?? null,
    priority: x.priority ?? 'normal',
    quantity: x.quantity ?? null,
    unit: x.unit ?? null,
    store: x.store ?? null,
    price: x.price ?? null,
    completed: Boolean(x.completed),
    completedBy: x.completedBy ?? null,
    completedAt: toDate(x.completedAt),
    archived: Boolean(x.archived),
    sortOrder: x.sortOrder ?? 0,
    createdBy: x.createdBy,
    createdAt: toDate(x.createdAt),
    convertedTaskId: x.convertedTaskId ?? null,
    pending: d.metadata.hasPendingWrites,
  }
}

/** Every list, including archived ones (there are only a few). */
export function useListDefs(hid: string) {
  return useLiveQuery(`lists:${hid}`, () => query(col(hid, 'lists')), toList)
}

/** Items still on their lists. Cleared items are archived and not loaded. */
export function useActiveListItems(hid: string) {
  return useLiveQuery(`listItems:${hid}`, () => query(col(hid, 'listItems'), where('archived', '==', false)), toItem)
}

/** Recently cleared items of one list, newest first. */
export function useClearedItems(hid: string, listId: string | null) {
  return useLiveQuery(
    listId ? `cleared:${hid}:${listId}` : null,
    () => query(col(hid, 'listItems'), where('listId', '==', listId), where('archived', '==', true)),
    toItem,
  )
}

/**
 * Create the starter lists the first time anyone opens Lists. Runs in a transaction so the two
 * phones can't both create them; any list that already exists is left alone.
 */
export async function ensureDefaultLists(a: Actor) {
  await runTransaction(db(), async (tx) => {
    const refs = DEFAULT_LISTS.map((l) => hdoc(a.hid, 'lists', l.id))
    const snaps = await Promise.all(refs.map((r) => tx.get(r)))
    DEFAULT_LISTS.forEach(({ id: _id, ...l }, i) => {
      if (snaps[i].exists()) return
      tx.set(refs[i], { ...l, archived: false, createdBy: a.uid, createdAt: serverTimestamp(), ...stamp(a.uid) })
    })
  })
}

export const newListId = (hid: string) => doc(col(hid, 'lists')).id

export async function createList(a: Actor, title: string, type: ListType, sortOrder: number, id = newListId(a.hid)): Promise<string> {
  const ref = hdoc(a.hid, 'lists', id)
  const batch = writeBatch(db())
  batch.set(ref, { title, type, sortOrder, archived: false, createdBy: a.uid, createdAt: serverTimestamp(), ...stamp(a.uid) })
  logTo(batch, a, 'list.created', title)
  await batch.commit()
  return ref.id
}

export async function updateList(a: Actor, list: ListDef, change: Partial<Pick<ListDef, 'title' | 'archived'>>) {
  const batch = writeBatch(db())
  batch.update(hdoc(a.hid, 'lists', list.id), { ...change, ...stamp(a.uid) })
  if (change.archived !== undefined) logTo(batch, a, change.archived ? 'list.archived' : 'list.restored', list.title)
  else if (change.title) logTo(batch, a, 'list.renamed', `${list.title} → ${change.title}`)
  await batch.commit()
}

/** Swap the positions of two lists (or two items). */
export async function swapOrder(a: Actor, collectionName: 'lists' | 'listItems', x: { id: string; sortOrder: number }, y: { id: string; sortOrder: number }) {
  const batch = writeBatch(db())
  // Equal orders (e.g. two items added in the same millisecond) still need to end up apart.
  const [xo, yo] = x.sortOrder === y.sortOrder ? [y.sortOrder + 1, x.sortOrder] : [y.sortOrder, x.sortOrder]
  batch.update(hdoc(a.hid, collectionName, x.id), { sortOrder: xo, ...stamp(a.uid) })
  batch.update(hdoc(a.hid, collectionName, y.id), { sortOrder: yo, ...stamp(a.uid) })
  await batch.commit()
}

export interface ItemInput {
  listId: string
  title: string
  details: string | null
  assignedTo: Owner
  dueDate: string | null
  priority: Priority
  quantity: number | null
  unit: string | null
  store: string | null
  price: number | null
}

/** Pre-generated ID for a new item, so callers can refer to it before the write lands. */
export const newItemId = (hid: string) => doc(col(hid, 'listItems')).id

export async function createItem(a: Actor, input: ItemInput, id = newItemId(a.hid)): Promise<string> {
  const batch = writeBatch(db())
  batch.set(hdoc(a.hid, 'listItems', id), {
    ...input,
    assignedBy: a.uid,
    completed: false,
    completedBy: null,
    completedAt: null,
    archived: false,
    // Newest at the bottom in manual order.
    sortOrder: Date.now(),
    createdBy: a.uid,
    createdAt: serverTimestamp(),
    ...stamp(a.uid),
  })
  logTo(batch, a, 'item.created', input.title)
  await batch.commit()
  return id
}

export async function updateItem(a: Actor, before: ListItem, input: ItemInput) {
  const reassigned = input.assignedTo !== before.assignedTo
  const batch = writeBatch(db())
  batch.update(hdoc(a.hid, 'listItems', before.id), {
    ...input,
    ...(reassigned ? { assignedBy: a.uid } : {}),
    ...stamp(a.uid),
  })
  logTo(batch, a, reassigned ? 'item.reassigned' : 'item.edited', input.title)
  await batch.commit()
}

export async function setItemCompleted(a: Actor, item: ListItem, completed: boolean, shopping: boolean) {
  const batch = writeBatch(db())
  batch.update(hdoc(a.hid, 'listItems', item.id), {
    completed,
    completedBy: completed ? a.uid : null,
    completedAt: completed ? serverTimestamp() : null,
    ...stamp(a.uid),
  })
  logTo(batch, a, completed ? (shopping ? 'item.purchased' : 'item.completed') : 'item.reopened', item.title)
  await batch.commit()
}

export async function setItemQuantity(a: Actor, item: ListItem, quantity: number | null) {
  const batch = writeBatch(db())
  batch.update(hdoc(a.hid, 'listItems', item.id), { quantity, ...stamp(a.uid) })
  await batch.commit()
}

export async function deleteItem(a: Actor, item: ListItem) {
  const batch = writeBatch(db())
  batch.delete(hdoc(a.hid, 'listItems', item.id))
  logTo(batch, a, 'item.deleted', item.title)
  await batch.commit()
}

/** Clear finished items off a list. They're archived, not deleted, so the history stays. */
export async function clearCompleted(a: Actor, list: ListDef, items: ListItem[]) {
  const done = items.filter((i) => i.completed && i.listId === list.id)
  // A batch holds at most 500 writes; leave room for the activity entry.
  for (let i = 0; i < done.length; i += 450) {
    const batch = writeBatch(db())
    for (const item of done.slice(i, i + 450)) {
      batch.update(hdoc(a.hid, 'listItems', item.id), { archived: true, archivedBy: a.uid, archivedAt: serverTimestamp(), ...stamp(a.uid) })
    }
    if (i === 0) logTo(batch, a, 'list.cleared', `${done.length} from ${list.title}`)
    await batch.commit()
  }
}

/** Put a cleared item back on its list as not done. */
export async function restoreItem(a: Actor, item: ListItem) {
  const batch = writeBatch(db())
  batch.update(hdoc(a.hid, 'listItems', item.id), {
    archived: false,
    archivedBy: null,
    archivedAt: null,
    completed: false,
    completedBy: null,
    completedAt: null,
    ...stamp(a.uid),
  })
  logTo(batch, a, 'item.restored', item.title)
  await batch.commit()
}

/**
 * Turn a dated to-do into a calendar task. The task's ID is derived from the item's, and the
 * item is archived with a link to it in the same batch, so a retry can never make two tasks.
 */
export async function convertToTask(a: Actor, item: ListItem): Promise<string> {
  if (!item.dueDate) throw new Error('Set a due date first.')
  const taskId = `t-li-${item.id}`
  const batch = writeBatch(db())
  batch.set(hdoc(a.hid, 'adHocTasks', taskId), {
    title: item.title,
    details: item.details ?? '',
    owner: item.assignedTo,
    priority: item.priority,
    date: item.dueDate,
    time: null,
    durationMinutes: null,
    recurrence: { type: 'none' },
    until: null,
    checklist: [],
    archived: false,
    createdBy: a.uid,
    assignedBy: a.uid,
    createdAt: serverTimestamp(),
    ...stamp(a.uid),
  })
  batch.update(hdoc(a.hid, 'listItems', item.id), {
    convertedTaskId: taskId,
    archived: true,
    archivedBy: a.uid,
    archivedAt: serverTimestamp(),
    ...stamp(a.uid),
  })
  logTo(batch, a, 'item.converted', `${item.title} → task on ${item.dueDate}`)
  await batch.commit()
  return taskId
}
