import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const HID = 'singh'
const VISHWAS = 'uid-vishwas'
const GARIMA = 'uid-garima'
const STRANGER = 'uid-stranger'
const GARIMA_EMAIL = 'garima@example.com'

let env: RulesTestEnvironment

const db = (uid: string, email?: string): Firestore =>
  env
    .authenticatedContext(uid, email ? { email, email_verified: true } : {})
    .firestore() as unknown as Firestore

const stamp = (uid: string) => ({ updatedBy: uid, updatedAt: serverTimestamp() })

/** Vishwas founds the household, seeds plan v1 and his member record in one batch. */
async function foundHousehold() {
  const v = db(VISHWAS, 'vishwas@example.com')
  const batch = writeBatch(v)
  batch.set(doc(v, 'households', HID), {
    name: 'Singh Family',
    timezone: 'America/Chicago',
    ownerUid: VISHWAS,
    adminUids: [VISHWAS],
    memberUids: [VISHWAS],
    activePlanVersion: 'v1',
    createdAt: serverTimestamp(),
    ...stamp(VISHWAS),
  })
  batch.set(doc(v, 'households', HID, 'planVersions', 'v1'), {
    markdown: '---\nschemaVersion: 1\n---\n',
    effectiveFrom: '2026-10-19',
    authorUid: VISHWAS,
    createdAt: serverTimestamp(),
  })
  batch.set(doc(v, 'households', HID, 'members', VISHWAS), {
    displayName: 'Vishwas',
    planMemberId: 'vishwas',
    joinedAt: serverTimestamp(),
  })
  await batch.commit()
}

async function inviteGarima(role: 'admin' | 'member' = 'admin') {
  await setDoc(doc(db(VISHWAS), 'invites', GARIMA_EMAIL), {
    householdId: HID,
    planMemberId: 'garima',
    role,
    invitedBy: VISHWAS,
    createdAt: serverTimestamp(),
  })
}

async function garimaJoins() {
  const g = db(GARIMA, GARIMA_EMAIL)
  const batch = writeBatch(g)
  batch.update(doc(g, 'households', HID), {
    memberUids: arrayUnion(GARIMA),
    adminUids: arrayUnion(GARIMA),
    ...stamp(GARIMA),
  })
  batch.set(doc(g, 'households', HID, 'members', GARIMA), {
    displayName: 'Garima',
    planMemberId: 'garima',
    joinedAt: serverTimestamp(),
  })
  await batch.commit()
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-vishwarima',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
})

describe('household creation and isolation', () => {
  it('lets a signed-in user found a household with plan and member record in one batch', async () => {
    await assertSucceeds(foundHousehold())
  })

  it('rejects founding a household that lists someone else as a member', async () => {
    const v = db(VISHWAS)
    await assertFails(
      setDoc(doc(v, 'households', 'h2'), {
        name: 'X',
        timezone: 'America/Chicago',
        ownerUid: VISHWAS,
        adminUids: [VISHWAS],
        memberUids: [VISHWAS, STRANGER],
        createdAt: serverTimestamp(),
        ...stamp(VISHWAS),
      }),
    )
  })

  it('denies anonymous users and non-members everything', async () => {
    await foundHousehold()
    const anon = env.unauthenticatedContext().firestore() as unknown as Firestore
    await assertFails(getDoc(doc(anon, 'households', HID)))
    const s = db(STRANGER, 'stranger@example.com')
    await assertFails(getDoc(doc(s, 'households', HID)))
    await assertFails(getDoc(doc(s, 'households', HID, 'planVersions', 'v1')))
    await assertFails(getDocs(collection(s, 'households', HID, 'events')))
    await assertFails(
      setDoc(doc(s, 'households', HID, 'taskStates', 'car-wash_2026-10-23_0'), {
        completed: true,
        completedBy: STRANGER,
        completedAt: serverTimestamp(),
        ...stamp(STRANGER),
      }),
    )
  })

  it('lets members find their household by query', async () => {
    await foundHousehold()
    await assertSucceeds(
      getDocs(query(collection(db(VISHWAS), 'households'), where('memberUids', 'array-contains', VISHWAS))),
    )
  })
})

describe('invitations', () => {
  it('lets an invited, verified email join as themselves', async () => {
    await foundHousehold()
    await inviteGarima()
    await assertSucceeds(getDoc(doc(db(GARIMA, GARIMA_EMAIL), 'invites', GARIMA_EMAIL)))
    await assertSucceeds(garimaJoins())
    await assertSucceeds(getDoc(doc(db(GARIMA, GARIMA_EMAIL), 'households', HID)))
  })

  it('does not let someone join just by knowing the household ID', async () => {
    await foundHousehold()
    await inviteGarima()
    const s = db(STRANGER, 'stranger@example.com')
    await assertFails(
      updateDoc(doc(s, 'households', HID), { memberUids: arrayUnion(STRANGER), ...stamp(STRANGER) }),
    )
    await assertFails(getDoc(doc(s, 'invites', GARIMA_EMAIL)))
  })

  it('requires a verified email to use an invite', async () => {
    await foundHousehold()
    await inviteGarima()
    const unverified = env
      .authenticatedContext(GARIMA, { email: GARIMA_EMAIL, email_verified: false })
      .firestore() as unknown as Firestore
    await assertFails(
      updateDoc(doc(unverified, 'households', HID), { memberUids: arrayUnion(GARIMA), ...stamp(GARIMA) }),
    )
  })

  it('does not let an invitee claim a different plan identity or admin role', async () => {
    await foundHousehold()
    await inviteGarima('member')
    const g = db(GARIMA, GARIMA_EMAIL)
    await assertFails(
      updateDoc(doc(g, 'households', HID), {
        memberUids: arrayUnion(GARIMA),
        adminUids: arrayUnion(GARIMA),
        ...stamp(GARIMA),
      }),
    )
    const batch = writeBatch(g)
    batch.update(doc(g, 'households', HID), { memberUids: arrayUnion(GARIMA), ...stamp(GARIMA) })
    batch.set(doc(g, 'households', HID, 'members', GARIMA), {
      displayName: 'Garima',
      planMemberId: 'vishwas',
      joinedAt: serverTimestamp(),
    })
    await assertFails(batch.commit())
  })

  it('only lets household admins create invites', async () => {
    await foundHousehold()
    await assertFails(
      setDoc(doc(db(STRANGER), 'invites', 'stranger2@example.com'), {
        householdId: HID,
        planMemberId: 'garima',
        role: 'admin',
        invitedBy: STRANGER,
        createdAt: serverTimestamp(),
      }),
    )
  })
})

describe('tasks', () => {
  beforeEach(async () => {
    await foundHousehold()
    await inviteGarima()
    await garimaJoins()
  })

  const key = 'car-wash_2026-10-23_0'

  it('records completion with the completer stamped', async () => {
    await assertSucceeds(
      setDoc(doc(db(VISHWAS), 'households', HID, 'taskStates', key), {
        taskId: 'car-wash',
        date: '2026-10-23',
        completed: true,
        completedBy: VISHWAS,
        completedAt: serverTimestamp(),
        ...stamp(VISHWAS),
      }),
    )
    await assertSucceeds(getDoc(doc(db(GARIMA, GARIMA_EMAIL), 'households', HID, 'taskStates', key)))
  })

  it('rejects completing a task in the partner’s name', async () => {
    await assertFails(
      setDoc(doc(db(VISHWAS), 'households', HID, 'taskStates', key), {
        completed: true,
        completedBy: GARIMA,
        completedAt: serverTimestamp(),
        ...stamp(VISHWAS),
      }),
    )
  })

  it('lets either member undo a completion', async () => {
    await setDoc(doc(db(VISHWAS), 'households', HID, 'taskStates', key), {
      completed: true,
      completedBy: VISHWAS,
      completedAt: serverTimestamp(),
      ...stamp(VISHWAS),
    })
    await assertSucceeds(
      setDoc(doc(db(GARIMA, GARIMA_EMAIL), 'households', HID, 'taskStates', key), {
        completed: false,
        completedBy: null,
        completedAt: null,
        ...stamp(GARIMA),
      }),
    )
  })

  it('records who assigned an ad-hoc task', async () => {
    const g = db(GARIMA, GARIMA_EMAIL)
    const task = {
      title: 'Call the pediatrician',
      owner: 'vishwas',
      createdBy: GARIMA,
      assignedBy: GARIMA,
      createdAt: serverTimestamp(),
      ...stamp(GARIMA),
    }
    await assertSucceeds(setDoc(doc(g, 'households', HID, 'adHocTasks', 't1'), task))
    await assertFails(setDoc(doc(g, 'households', HID, 'adHocTasks', 't2'), { ...task, assignedBy: VISHWAS }))
  })
})

describe('plan versions and history', () => {
  beforeEach(async () => {
    await foundHousehold()
    await inviteGarima('member')
    const g = db(GARIMA, GARIMA_EMAIL)
    const batch = writeBatch(g)
    batch.update(doc(g, 'households', HID), { memberUids: arrayUnion(GARIMA), ...stamp(GARIMA) })
    batch.set(doc(g, 'households', HID, 'members', GARIMA), {
      displayName: 'Garima',
      planMemberId: 'garima',
      joinedAt: serverTimestamp(),
    })
    await batch.commit()
  })

  const version = (uid: string) => ({
    markdown: '---\nschemaVersion: 1\n---\n',
    effectiveFrom: '2026-10-26',
    authorUid: uid,
    createdAt: serverTimestamp(),
  })

  it('restricts new plan versions to admins and keeps versions immutable', async () => {
    await assertFails(setDoc(doc(db(GARIMA, GARIMA_EMAIL), 'households', HID, 'planVersions', 'v2'), version(GARIMA)))
    await assertSucceeds(setDoc(doc(db(VISHWAS), 'households', HID, 'planVersions', 'v2'), version(VISHWAS)))
    await assertFails(
      updateDoc(doc(db(VISHWAS), 'households', HID, 'planVersions', 'v1'), { effectiveFrom: '2026-10-20' }),
    )
    await assertFails(deleteDoc(doc(db(VISHWAS), 'households', HID, 'planVersions', 'v1')))
  })

  it('only switches the active plan to a version that exists', async () => {
    const v = db(VISHWAS)
    await assertFails(updateDoc(doc(v, 'households', HID), { activePlanVersion: 'nope', ...stamp(VISHWAS) }))
    await setDoc(doc(v, 'households', HID, 'planVersions', 'v2'), version(VISHWAS))
    await assertSucceeds(updateDoc(doc(v, 'households', HID), { activePlanVersion: 'v2', ...stamp(VISHWAS) }))
  })

  it('keeps activity append-only and stamped with the actor', async () => {
    const g = db(GARIMA, GARIMA_EMAIL)
    const ref = doc(g, 'households', HID, 'activity', 'a1')
    await assertSucceeds(setDoc(ref, { actorUid: GARIMA, action: 'task.completed', at: serverTimestamp() }))
    await assertFails(setDoc(doc(g, 'households', HID, 'activity', 'a2'), { actorUid: VISHWAS, action: 'x', at: serverTimestamp() }))
    await assertFails(updateDoc(ref, { action: 'edited' }))
    await assertFails(deleteDoc(ref))
  })
})

describe('private busy blocks', () => {
  beforeEach(async () => {
    await foundHousehold()
    await inviteGarima()
    await garimaJoins()
  })

  const gym = (uid: string) => ({
    title: 'Busy',
    visibility: 'private',
    ownerUid: uid,
    participants: ['garima'],
    busy: true,
    date: '2026-10-20',
    start: '17:30',
    end: '19:00',
    createdBy: uid,
    createdAt: serverTimestamp(),
    ...stamp(uid),
  })

  it('shows the partner the busy time but keeps the details owner-only', async () => {
    const g = db(GARIMA, GARIMA_EMAIL)
    await assertSucceeds(setDoc(doc(g, 'households', HID, 'events', 'gym'), gym(GARIMA)))
    await assertSucceeds(
      setDoc(doc(g, 'households', HID, 'privateEventDetails', 'gym'), {
        ownerUid: GARIMA,
        title: 'Gym',
        notes: 'Spin class',
        ...stamp(GARIMA),
      }),
    )
    const v = db(VISHWAS)
    await assertSucceeds(getDoc(doc(v, 'households', HID, 'events', 'gym')))
    await assertFails(getDoc(doc(v, 'households', HID, 'privateEventDetails', 'gym')))
    await assertSucceeds(getDoc(doc(g, 'households', HID, 'privateEventDetails', 'gym')))
  })

  it('rejects private details leaking into the shared record', async () => {
    const g = db(GARIMA, GARIMA_EMAIL)
    await assertFails(setDoc(doc(g, 'households', HID, 'events', 'gym'), { ...gym(GARIMA), title: 'Gym' }))
    await assertFails(setDoc(doc(g, 'households', HID, 'events', 'gym'), { ...gym(GARIMA), notes: 'Spin class' }))
  })

  it('stops the partner editing or deleting a private block', async () => {
    await setDoc(doc(db(GARIMA, GARIMA_EMAIL), 'households', HID, 'events', 'gym'), gym(GARIMA))
    const v = db(VISHWAS)
    await assertFails(updateDoc(doc(v, 'households', HID, 'events', 'gym'), { end: '20:00', ...stamp(VISHWAS) }))
    await assertFails(deleteDoc(doc(v, 'households', HID, 'events', 'gym')))
  })

  it('lets either member edit a shared event', async () => {
    const v = db(VISHWAS)
    await setDoc(doc(v, 'households', HID, 'events', 'dentist'), {
      ...gym(VISHWAS),
      title: 'Dentist — Vihan',
      visibility: 'shared',
      notes: 'Bring insurance card',
    })
    await assertSucceeds(
      updateDoc(doc(db(GARIMA, GARIMA_EMAIL), 'households', HID, 'events', 'dentist'), {
        start: '16:00',
        ...stamp(GARIMA),
      }),
    )
  })
})
