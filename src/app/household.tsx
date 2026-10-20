import type { User } from 'firebase/auth'
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import type { Household } from '../data/household'
import { useAdHocTasks, useMembers, usePrivateDetails, type Member, type PrivateDetails } from '../data/live'
import { recordFirstUse, type Actor } from '../data/mutations'
import { usePlanVersions, type StoredPlanVersion } from '../data/plans'
import type { AdHocTask, PersonId } from '../domain/agenda'
import { todayIn } from '../domain/dates'
import { useNow } from './useNow'

export interface HouseholdCtx {
  user: User
  household: Household
  actor: Actor
  me: Member | undefined
  /** `vishwas` or `garima` for the signed-in member. */
  myId: PersonId | undefined
  isAdmin: boolean
  members: Member[]
  memberName: (uid: string | null | undefined) => string
  versions: StoredPlanVersion[]
  invalidVersions: { id: string; errors: string[] }[]
  plansLoading: boolean
  adHoc: AdHocTask[]
  privateDetails: Map<string, PrivateDetails>
  today: string
  timezone: string
}

const Ctx = createContext<HouseholdCtx | null>(null)

export function HouseholdProvider({ user, household, children }: { user: User; household: Household; children: ReactNode }) {
  const hid = household.id
  const members = useMembers(hid)
  const plans = usePlanVersions(hid)
  const adHoc = useAdHocTasks(hid)
  const privateDetails = usePrivateDetails(hid, user.uid)
  const now = useNow()
  const today = todayIn(household.timezone, now)
  const actor = useMemo(() => ({ hid, uid: user.uid }), [hid, user.uid])

  // The first day anyone opens the app; earlier days are never counted as missed.
  useEffect(() => {
    if (!household.firstUseDate) recordFirstUse(actor, today).catch(() => {})
  }, [household.firstUseDate, actor, today])

  const value = useMemo<HouseholdCtx>(() => {
    const me = members.data.find((m) => m.uid === user.uid)
    const byUid = new Map(members.data.map((m) => [m.uid, m]))
    const sortedVersions = [...plans.versions].sort(
      (a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)) || a.id.localeCompare(b.id),
    )
    return {
      user,
      household,
      actor,
      me,
      myId: me?.planMemberId,
      isAdmin: household.adminUids.includes(user.uid),
      members: members.data,
      memberName: (uid) => (uid ? (byUid.get(uid)?.displayName ?? 'Someone') : ''),
      versions: sortedVersions,
      invalidVersions: plans.invalid,
      plansLoading: plans.loading,
      adHoc: adHoc.data,
      privateDetails: new Map(privateDetails.data.map((d) => [d.id, d])),
      today,
      timezone: household.timezone,
    }
  }, [user, household, actor, members.data, plans, adHoc.data, privateDetails.data, today])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useHousehold(): HouseholdCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useHousehold outside HouseholdProvider')
  return ctx
}
