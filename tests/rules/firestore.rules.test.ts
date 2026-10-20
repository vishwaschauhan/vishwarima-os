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

async function garimaJoins(asAdmin = true) {
  const g = db(GARIMA, GARIMA_EMAIL)
  const batch = writeBatch(g)
  batch.update(doc(g, 'households', HID), {
    memberUids: arrayUnion(GARIMA),
    ...(asAdmin ? { adminUids: arrayUnion(GARIMA) } : {}),
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

describe('core app writes', () => {
  beforeEach(async () => {
    await foundHousehold()
    await inviteGarima()
    await garimaJoins()
  })

  it('applies a new plan version and switches to it in one batch', async () => {
    const v = db(VISHWAS)
    const batch = writeBatch(v)
    batch.set(doc(v, 'households', HID, 'planVersions', 'v2'), {
      markdown: '---\nschemaVersion: 1\n---\n',
      effectiveFrom: '2026-10-26',
      note: 'Swap baths',
      authorUid: VISHWAS,
      createdAt: serverTimestamp(),
    })
    batch.update(doc(v, 'households', HID), { activePlanVersion: 'v2', ...stamp(VISHWAS) })
    await assertSucceeds(batch.commit())
  })

  it('refuses to overwrite an existing plan version when two people apply at once', async () => {
    const g = db(GARIMA, GARIMA_EMAIL)
    await assertFails(
      setDoc(doc(g, 'households', HID, 'planVersions', 'v1'), {
        markdown: 'x',
        effectiveFrom: '2026-10-26',
        authorUid: GARIMA,
        createdAt: serverTimestamp(),
      }),
    )
  })

  it('records the first day of use only once', async () => {
    const g = db(GARIMA, GARIMA_EMAIL)
    await assertSucceeds(updateDoc(doc(g, 'households', HID), { firstUseDate: '2026-10-20', ...stamp(GARIMA) }))
    await assertFails(updateDoc(doc(g, 'households', HID), { firstUseDate: '2026-10-19', ...stamp(GARIMA) }))
  })

  it('reassigns one occurrence with the assigner recorded, and rejects a forged assigner', async () => {
    const g = db(GARIMA, GARIMA_EMAIL)
    const ref = doc(g, 'households', HID, 'taskOverrides', 'car-wash_2026-10-23_0')
    await assertFails(setDoc(ref, { taskId: 'car-wash', date: '2026-10-23', owner: 'garima', assignedBy: VISHWAS, ...stamp(GARIMA) }))
    await assertSucceeds(setDoc(ref, { taskId: 'car-wash', date: '2026-10-23', owner: 'garima', assignedBy: GARIMA, ...stamp(GARIMA) }))
  })

  it('lets the partner tick a subtask without un-completing the task', async () => {
    const key = 'weekly-family-reset_2026-10-25_0'
    await setDoc(doc(db(VISHWAS), 'households', HID, 'taskStates', key), {
      taskId: 'weekly-family-reset',
      date: '2026-10-25',
      completed: true,
      completedBy: VISHWAS,
      completedAt: serverTimestamp(),
      ...stamp(VISHWAS),
    })
    await assertSucceeds(
      setDoc(
        doc(db(GARIMA, GARIMA_EMAIL), 'households', HID, 'taskStates', key),
        { subtasks: { 'vyomika-supplies': { done: true, by: GARIMA } }, ...stamp(GARIMA) },
        { merge: true },
      ),
    )
  })

  it('stores a weekly private busy block with only "Busy" shared', async () => {
    const g = db(GARIMA, GARIMA_EMAIL)
    const batch = writeBatch(g)
    batch.set(doc(g, 'households', HID, 'events', 'gym'), {
      title: 'Busy',
      type: 'busy',
      date: '2026-10-20',
      start: '17:30',
      end: '19:00',
      participants: ['garima'],
      busy: true,
      visibility: 'private',
      coverage: null,
      recurrence: { type: 'weekly', days: ['tue'], until: null },
      recurring: true,
      ownerUid: GARIMA,
      createdBy: GARIMA,
      createdAt: serverTimestamp(),
      ...stamp(GARIMA),
    })
    batch.set(doc(g, 'households', HID, 'privateEventDetails', 'gym'), {
      ownerUid: GARIMA,
      title: 'Gym',
      notes: '',
      location: '',
      ...stamp(GARIMA),
    })
    await assertSucceeds(batch.commit())
    const v = db(VISHWAS)
    await assertSucceeds(getDocs(query(collection(v, 'households', HID, 'events'), where('recurring', '==', true))))
    await assertSucceeds(getDocs(query(collection(v, 'households', HID, 'privateEventDetails'), where('ownerUid', '==', VISHWAS))))
    await assertFails(getDocs(query(collection(v, 'households', HID, 'privateEventDetails'), where('ownerUid', '==', GARIMA))))
  })
})

describe('shared lists', () => {
  beforeEach(async () => {
    await foundHousehold()
    await inviteGarima()
    await garimaJoins()
    await setDoc(doc(db(VISHWAS), 'households', HID, 'lists', 'groceries'), groceries())
  })

  const groceries = () => ({
    title: 'Groceries',
    type: 'shopping',
    sortOrder: 0,
    archived: false,
    createdBy: VISHWAS,
    createdAt: serverTimestamp(),
    ...stamp(VISHWAS),
  })

  const milk = (uid: string, extra: Record<string, unknown> = {}) => ({
    listId: 'groceries',
    title: 'Buy milk',
    details: null,
    assignedTo: 'unassigned',
    assignedBy: uid,
    dueDate: null,
    priority: 'normal',
    quantity: 2,
    unit: 'cartons',
    store: null,
    price: null,
    completed: false,
    completedBy: null,
    completedAt: null,
    archived: false,
    sortOrder: 1,
    createdBy: uid,
    createdAt: serverTimestamp(),
    ...stamp(uid),
    ...extra,
  })

  const item = (uid: string, id = 'milk') => doc(db(uid, uid === GARIMA ? GARIMA_EMAIL : undefined), 'households', HID, 'listItems', id)

  it('lets one of you add an item and the other check it off in their own name', async () => {
    await assertSucceeds(setDoc(item(VISHWAS), milk(VISHWAS)))
    await assertSucceeds(getDoc(item(GARIMA)))
    await assertSucceeds(
      updateDoc(item(GARIMA), { completed: true, completedBy: GARIMA, completedAt: serverTimestamp(), ...stamp(GARIMA) }),
    )
    // Undo by either of you clears the completer.
    await assertSucceeds(updateDoc(item(VISHWAS), { completed: false, completedBy: null, completedAt: null, ...stamp(VISHWAS) }))
  })

  it('rejects checking off an item in the partner’s name', async () => {
    await setDoc(item(VISHWAS), milk(VISHWAS))
    await assertFails(
      updateDoc(item(VISHWAS), { completed: true, completedBy: GARIMA, completedAt: serverTimestamp(), ...stamp(VISHWAS) }),
    )
  })

  it('records who reassigned an item and only to a household member', async () => {
    await setDoc(item(GARIMA), milk(GARIMA, { assignedTo: 'vishwas' }))
    await assertSucceeds(updateDoc(item(VISHWAS), { assignedTo: 'garima', assignedBy: VISHWAS, ...stamp(VISHWAS) }))
    await assertFails(updateDoc(item(VISHWAS), { assignedTo: 'vishwas', assignedBy: GARIMA, ...stamp(VISHWAS) }))
    await assertFails(updateDoc(item(VISHWAS), { assignedTo: 'grandma', assignedBy: VISHWAS, ...stamp(VISHWAS) }))
  })

  it('validates item fields and keeps the creator fixed', async () => {
    await assertFails(setDoc(item(VISHWAS, 'a'), milk(VISHWAS, { listId: 'no-such-list' })))
    await assertFails(setDoc(item(VISHWAS, 'b'), milk(VISHWAS, { quantity: 0 })))
    await assertFails(setDoc(item(VISHWAS, 'c'), milk(VISHWAS, { dueDate: 'Friday' })))
    await assertFails(setDoc(item(VISHWAS, 'd'), milk(VISHWAS, { createdBy: GARIMA })))
    await assertFails(setDoc(item(VISHWAS, 'e'), milk(VISHWAS, { photo: 'data:image/png;base64,AAAA' })))
    await assertFails(setDoc(item(VISHWAS, 'f'), milk(VISHWAS, { completed: true, completedBy: VISHWAS, completedAt: serverTimestamp() })))
    await setDoc(item(VISHWAS), milk(VISHWAS))
    await assertFails(updateDoc(item(GARIMA), { createdBy: GARIMA, ...stamp(GARIMA) }))
  })

  it('clears purchased items by archiving them with who cleared them', async () => {
    await setDoc(item(VISHWAS), milk(VISHWAS))
    await assertSucceeds(updateDoc(item(GARIMA), { archived: true, archivedBy: GARIMA, archivedAt: serverTimestamp(), ...stamp(GARIMA) }))
    await assertSucceeds(
      getDocs(query(collection(db(VISHWAS), 'households', HID, 'listItems'), where('listId', '==', 'groceries'), where('archived', '==', true))),
    )
  })

  it('lets members rename, reorder and archive lists but not change their type', async () => {
    const list = doc(db(GARIMA, GARIMA_EMAIL), 'households', HID, 'lists', 'groceries')
    await assertSucceeds(updateDoc(list, { title: 'Weekly groceries', sortOrder: 3, ...stamp(GARIMA) }))
    await assertSucceeds(updateDoc(list, { archived: true, ...stamp(GARIMA) }))
    await assertFails(updateDoc(list, { type: 'todo', ...stamp(GARIMA) }))
    await assertFails(deleteDoc(list))
  })

  it('keeps lists and items away from people outside the household', async () => {
    await setDoc(item(VISHWAS), milk(VISHWAS))
    const s = db(STRANGER, 'stranger@example.com')
    // The stranger has a household of their own; that grants nothing here.
    await setDoc(doc(s, 'households', 'other'), {
      name: 'Other',
      timezone: 'America/Chicago',
      ownerUid: STRANGER,
      adminUids: [STRANGER],
      memberUids: [STRANGER],
      activePlanVersion: 'v1',
      createdAt: serverTimestamp(),
      ...stamp(STRANGER),
    })
    await assertFails(getDocs(collection(s, 'households', HID, 'lists')))
    await assertFails(getDoc(doc(s, 'households', HID, 'listItems', 'milk')))
    await assertFails(setDoc(doc(s, 'households', HID, 'listItems', 'x'), milk(STRANGER)))
    await assertFails(updateDoc(doc(s, 'households', HID, 'listItems', 'milk'), { title: 'Hacked', ...stamp(STRANGER) }))
    await assertFails(deleteDoc(doc(s, 'households', HID, 'listItems', 'milk')))
    const anon = env.unauthenticatedContext().firestore() as unknown as Firestore
    await assertFails(getDocs(collection(anon, 'households', HID, 'listItems')))
  })

  it('creates the starter lists only once', async () => {
    const v = db(VISHWAS)
    await assertSucceeds(setDoc(doc(v, 'households', HID, 'lists', 'kids'), { ...groceries(), title: 'Kids', type: 'todo' }))
    // A second create of the same list would be an update that rewrites its creator.
    await assertFails(setDoc(doc(db(GARIMA, GARIMA_EMAIL), 'households', HID, 'lists', 'kids'), { ...groceries(), title: 'Kids', type: 'todo', createdBy: GARIMA, ...stamp(GARIMA) }))
  })
})

describe('family whiteboard', () => {
  beforeEach(async () => {
    await foundHousehold()
    await inviteGarima('member')
    await garimaJoins(false)
  })

  const post = (uid: string, extra: Record<string, unknown> = {}) => ({
    authorId: uid,
    body: 'Vihan’s school photo day is Friday',
    pinned: false,
    pinnedBy: null,
    reactions: {},
    deleted: false,
    createdAt: serverTimestamp(),
    ...stamp(uid),
    ...extra,
  })
  const ref = (uid: string, id = 'p1') =>
    doc(db(uid, uid === GARIMA ? GARIMA_EMAIL : undefined), 'households', HID, 'whiteboardPosts', id)

  it('lets members post as themselves and read each other’s posts', async () => {
    await assertSucceeds(setDoc(ref(VISHWAS), post(VISHWAS)))
    await assertSucceeds(getDoc(ref(GARIMA)))
    await assertFails(setDoc(ref(VISHWAS, 'p2'), post(GARIMA)))
    await assertFails(setDoc(ref(VISHWAS, 'p3'), post(VISHWAS, { body: '' })))
    await assertFails(setDoc(ref(VISHWAS, 'p4'), post(VISHWAS, { body: 'x'.repeat(4001) })))
    await assertFails(setDoc(ref(VISHWAS, 'p5'), post(VISHWAS, { image: 'data:image/png;base64,AAAA' })))
  })

  it('lets only the author edit, and marks the edit', async () => {
    await setDoc(ref(VISHWAS), post(VISHWAS))
    await assertSucceeds(updateDoc(ref(VISHWAS), { body: 'Photo day moved to Monday', editedAt: serverTimestamp(), ...stamp(VISHWAS) }))
    await assertFails(updateDoc(ref(GARIMA), { body: 'Changed by Garima', editedAt: serverTimestamp(), ...stamp(GARIMA) }))
    await assertFails(updateDoc(ref(VISHWAS), { body: 'Sneaky', ...stamp(VISHWAS) }))
  })

  it('lets either member pin, and each react only for themselves', async () => {
    await setDoc(ref(VISHWAS), post(VISHWAS))
    await assertSucceeds(updateDoc(ref(GARIMA), { pinned: true, pinnedBy: GARIMA, ...stamp(GARIMA) }))
    await assertFails(updateDoc(ref(GARIMA), { pinned: true, pinnedBy: VISHWAS, ...stamp(GARIMA) }))
    await assertSucceeds(updateDoc(ref(GARIMA), { [`reactions.${GARIMA}`]: '❤️', ...stamp(GARIMA) }))
    await assertFails(updateDoc(ref(GARIMA), { [`reactions.${VISHWAS}`]: '👍', ...stamp(GARIMA) }))
  })

  it('lets the author or an admin delete, and nobody else', async () => {
    const del = (uid: string) => ({
      body: '',
      deleted: true,
      deletedBy: uid,
      deletedAt: serverTimestamp(),
      pinned: false,
      pinnedBy: null,
      reactions: {},
      ...stamp(uid),
    })
    // Garima is a member, not an admin, in this household.
    await setDoc(ref(VISHWAS), post(VISHWAS))
    await assertFails(updateDoc(ref(GARIMA), del(GARIMA)))
    await setDoc(ref(GARIMA, 'g1'), post(GARIMA))
    await assertSucceeds(updateDoc(ref(VISHWAS, 'g1'), del(VISHWAS)))
    await assertSucceeds(updateDoc(ref(VISHWAS), del(VISHWAS)))
    await assertFails(deleteDoc(ref(VISHWAS, 'p1')))
    // A deleted message can't be edited back.
    await assertFails(updateDoc(ref(VISHWAS), { body: 'Back', editedAt: serverTimestamp(), ...stamp(VISHWAS) }))
  })

  it('keeps posts away from people outside the household', async () => {
    await setDoc(ref(VISHWAS), post(VISHWAS))
    const s = db(STRANGER, 'stranger@example.com')
    await assertFails(getDoc(doc(s, 'households', HID, 'whiteboardPosts', 'p1')))
    await assertFails(getDocs(collection(s, 'households', HID, 'whiteboardPosts')))
    await assertFails(setDoc(doc(s, 'households', HID, 'whiteboardPosts', 'x'), post(STRANGER)))
  })
})
