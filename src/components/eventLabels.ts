import { useHousehold } from '../app/household'
import { formatTime, type FamilyEvent } from '../domain/agenda'

export const TYPE_LABEL: Record<FamilyEvent['type'], string> = {
  appointment: 'Appointment',
  gym: 'Gym',
  work: 'Work',
  kids: 'Kids’ activity',
  outing: 'Family outing',
  school: 'School event',
  busy: 'Busy',
  other: 'Event',
}

export const EVENT_TYPES = Object.entries(TYPE_LABEL).filter(([k]) => k !== 'busy') as [FamilyEvent['type'], string][]

/** How an event reads for the signed-in member: private blocks show their real title only to the owner. */
export function useEventTitle() {
  const { user, privateDetails, memberName } = useHousehold()
  return (e: FamilyEvent) => {
    if (e.visibility !== 'private') return e.title
    if (e.ownerUid === user.uid) return privateDetails.get(e.id)?.title ?? 'Busy'
    return `${memberName(e.ownerUid)} busy`
  }
}

export function eventTimeLabel(e: FamilyEvent): string {
  if (!e.start) return 'All day'
  return e.end ? `${formatTime(e.start)} – ${formatTime(e.end)}` : formatTime(e.start)
}
