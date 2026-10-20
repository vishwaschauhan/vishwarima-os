import {
  collection,
  deleteField,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { useSyncExternalStore } from 'react'
import type { WhiteboardPost } from '../domain/whiteboard'
import { firebase } from '../lib/firebase'
import { useLiveQuery } from './live'
import type { Actor } from './mutations'

const db = () => firebase().db
const posts = (hid: string) => collection(db(), 'households', hid, 'whiteboardPosts')
const stamp = (uid: string) => ({ updatedBy: uid, updatedAt: serverTimestamp() })
const toDate = (v: unknown) => (v && typeof (v as Timestamp).toDate === 'function' ? (v as Timestamp).toDate() : null)

function toPost(d: QueryDocumentSnapshot<DocumentData>): WhiteboardPost {
  const x = d.data({ serverTimestamps: 'estimate' })
  return {
    id: d.id,
    authorId: x.authorId,
    body: x.body ?? '',
    pinned: Boolean(x.pinned),
    pinnedBy: x.pinnedBy ?? null,
    reactions: x.reactions ?? {},
    createdAt: toDate(x.createdAt),
    editedAt: toDate(x.editedAt),
    deleted: Boolean(x.deleted),
    pending: d.metadata.hasPendingWrites,
  }
}

/** The newest `count` messages, live. "Show earlier" raises the count rather than reading everything. */
export function useRecentPosts(hid: string, count: number) {
  return useLiveQuery(`posts:${hid}:${count}`, () => query(posts(hid), orderBy('createdAt', 'desc'), limit(count)), toPost)
}

export function usePinnedPosts(hid: string) {
  return useLiveQuery(`pinned:${hid}`, () => query(posts(hid), where('pinned', '==', true)), toPost)
}

/** A device-local "last opened the whiteboard" time, for the unread badge. */
const SEEN_KEY = 'vishwarima.whiteboard.seen'
const seenListeners = new Set<() => void>()
function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0)
  } catch {
    return 0
  }
}
let seen = readSeen()

export function markWhiteboardSeen(at = Date.now()) {
  if (at <= seen) return
  seen = at
  try {
    localStorage.setItem(SEEN_KEY, String(at))
  } catch {
    // Storage unavailable: keep it in memory.
  }
  seenListeners.forEach((l) => l())
}

export function useWhiteboardSeen(): number {
  return useSyncExternalStore(
    (l) => {
      seenListeners.add(l)
      return () => seenListeners.delete(l)
    },
    () => seen,
  )
}

/** ID made on the device, so a retried send never posts twice. */
export const newPostId = (hid: string) => doc(posts(hid)).id

export async function createPost(a: Actor, body: string, id = newPostId(a.hid)) {
  const batch = writeBatch(db())
  batch.set(doc(posts(a.hid), id), {
    authorId: a.uid,
    body,
    pinned: false,
    pinnedBy: null,
    reactions: {},
    deleted: false,
    createdAt: serverTimestamp(),
    ...stamp(a.uid),
  })
  await batch.commit()
  return id
}

export async function editPost(a: Actor, post: WhiteboardPost, body: string) {
  await updateDoc(doc(posts(a.hid), post.id), { body, editedAt: serverTimestamp(), ...stamp(a.uid) })
}

export async function setPinned(a: Actor, post: WhiteboardPost, pinned: boolean) {
  const batch = writeBatch(db())
  batch.update(doc(posts(a.hid), post.id), { pinned, pinnedBy: pinned ? a.uid : null, ...stamp(a.uid) })
  batch.set(doc(collection(db(), 'households', a.hid, 'activity')), {
    actorUid: a.uid,
    action: pinned ? 'post.pinned' : 'post.unpinned',
    summary: post.body.slice(0, 80),
    at: serverTimestamp(),
  })
  await batch.commit()
}

/** Your own reaction; choosing the same one again removes it. */
export async function setReaction(a: Actor, post: WhiteboardPost, emoji: string | null) {
  await updateDoc(doc(posts(a.hid), post.id), {
    [`reactions.${a.uid}`]: emoji ?? deleteField(),
    ...stamp(a.uid),
  })
}

/**
 * Remove a message. The text is cleared and the record marked deleted (so the feed and any
 * to-do made from it stay consistent); only its author or a household admin can do this.
 */
export async function deletePost(a: Actor, post: WhiteboardPost) {
  const batch = writeBatch(db())
  batch.update(doc(posts(a.hid), post.id), {
    body: '',
    deleted: true,
    deletedBy: a.uid,
    deletedAt: serverTimestamp(),
    pinned: false,
    pinnedBy: null,
    reactions: {},
    ...stamp(a.uid),
  })
  batch.set(doc(collection(db(), 'households', a.hid, 'activity')), {
    actorUid: a.uid,
    action: 'post.deleted',
    summary: post.authorId === a.uid ? 'their message' : 'a message',
    at: serverTimestamp(),
  })
  await batch.commit()
}
