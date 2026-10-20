import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import seedPlanMarkdown from '../../config/family-plan.md?raw'
import { parsePlanMarkdown } from '../domain/plan'
import { firebase } from '../lib/firebase'

export type PlanMemberId = 'vishwas' | 'garima'

export interface Household {
  id: string
  name: string
  timezone: string
  ownerUid: string
  adminUids: string[]
  memberUids: string[]
  activePlanVersion: string
  firstUseDate?: string
}

export interface Invite {
  householdId: string
  planMemberId: PlanMemberId
  role: 'admin' | 'member'
  invitedBy: string
  createdAt?: Timestamp
}

const stamp = (uid: string) => ({ updatedBy: uid, updatedAt: serverTimestamp() })

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function findMyHousehold(uid: string): Promise<Household | null> {
  const { db } = firebase()
  const snap = await getDocs(query(collection(db, 'households'), where('memberUids', 'array-contains', uid), limit(1)))
  const d = snap.docs[0]
  return d ? ({ id: d.id, ...d.data() } as Household) : null
}

/** The invite addressed to this user's verified email, if any. */
export async function findInvite(user: User): Promise<Invite | null> {
  if (!user.email || !user.emailVerified) return null
  const { db } = firebase()
  try {
    const snap = await getDoc(doc(db, 'invites', normalizeEmail(user.email)))
    return snap.exists() ? (snap.data() as Invite) : null
  } catch {
    return null
  }
}

/**
 * Deliberate first-time initialization: creates the household, seeds plan version 1 from
 * config/family-plan.md and records the founder, all in one atomic batch. Later plan
 * changes are new versions, so redeploying never overwrites them.
 */
export async function foundHousehold(user: User, displayName: string, planMemberId: PlanMemberId): Promise<string> {
  const parsed = parsePlanMarkdown(seedPlanMarkdown)
  if (!parsed.ok) throw new Error(`The bundled family plan is invalid:\n${parsed.errors.join('\n')}`)
  const { household } = parsed.plan.frontmatter

  const { db } = firebase()
  const ref = doc(collection(db, 'households'))
  const batch = writeBatch(db)
  batch.set(ref, {
    name: household.name,
    timezone: household.timezone,
    ownerUid: user.uid,
    adminUids: [user.uid],
    memberUids: [user.uid],
    activePlanVersion: 'v1',
    createdAt: serverTimestamp(),
    ...stamp(user.uid),
  })
  batch.set(doc(ref, 'planVersions', 'v1'), {
    markdown: seedPlanMarkdown,
    effectiveFrom: household.pilot?.start ?? new Date().toISOString().slice(0, 10),
    authorUid: user.uid,
    note: 'Initial plan from config/family-plan.md',
    createdAt: serverTimestamp(),
  })
  batch.set(doc(ref, 'members', user.uid), {
    displayName,
    planMemberId,
    email: user.email ? normalizeEmail(user.email) : '',
    joinedAt: serverTimestamp(),
  })
  batch.set(doc(collection(ref, 'activity')), {
    actorUid: user.uid,
    action: 'household.created',
    at: serverTimestamp(),
  })
  await batch.commit()
  return ref.id
}

export async function acceptInvite(user: User, invite: Invite, displayName: string): Promise<void> {
  const { db } = firebase()
  const ref = doc(db, 'households', invite.householdId)
  const batch = writeBatch(db)
  batch.update(ref, {
    memberUids: arrayUnion(user.uid),
    ...(invite.role === 'admin' ? { adminUids: arrayUnion(user.uid) } : {}),
    ...stamp(user.uid),
  })
  batch.set(doc(ref, 'members', user.uid), {
    displayName,
    planMemberId: invite.planMemberId,
    email: user.email ? normalizeEmail(user.email) : '',
    joinedAt: serverTimestamp(),
  })
  batch.set(doc(collection(ref, 'activity')), {
    actorUid: user.uid,
    action: 'member.joined',
    at: serverTimestamp(),
  })
  await batch.commit()
}

export async function createInvite(
  user: User,
  householdId: string,
  email: string,
  planMemberId: PlanMemberId,
  role: Invite['role'] = 'admin',
): Promise<void> {
  const { db } = firebase()
  await setDoc(doc(db, 'invites', normalizeEmail(email)), {
    householdId,
    planMemberId,
    role,
    invitedBy: user.uid,
    createdAt: serverTimestamp(),
  })
}
