import type { Owner } from '../domain/plan'

export const OWNER_LABEL: Record<Owner, string> = {
  vishwas: 'Vishwas',
  garima: 'Garima',
  both: 'Both',
  unassigned: 'Unassigned',
}

export const OWNER_STYLE: Record<Owner, string> = {
  vishwas: 'bg-vishwas text-vishwas-ink',
  garima: 'bg-garima text-garima-ink',
  both: 'bg-shared text-shared-ink',
  unassigned: 'bg-canvas text-ink-muted ring-1 ring-line ring-inset',
}

export const OWNER_BAR: Record<Owner, string> = {
  vishwas: 'bg-vishwas-ink/70',
  garima: 'bg-garima-ink/70',
  both: 'bg-shared-ink/70',
  unassigned: 'bg-line',
}
