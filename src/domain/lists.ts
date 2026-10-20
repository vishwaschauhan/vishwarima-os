import type { Priority } from './agenda'
import type { LocalDate } from './dates'
import type { Owner } from './plan'

// Shared to-do and shopping lists (`lists/{id}`, `listItems/{id}`). These are ad-hoc items kept in
// Firestore only; the Markdown family plan never touches them.

export type ListType = 'todo' | 'shopping'

export interface ListDef {
  id: string
  title: string
  type: ListType
  sortOrder: number
  archived: boolean
  createdBy: string
}

export interface ListItem {
  id: string
  listId: string
  title: string
  details?: string | null
  assignedTo: Owner
  assignedBy?: string | null
  dueDate?: LocalDate | null
  priority: Priority
  quantity?: number | null
  unit?: string | null
  store?: string | null
  price?: number | null
  completed: boolean
  completedBy?: string | null
  completedAt?: Date | null
  /** Cleared from the list; kept for history. */
  archived: boolean
  sortOrder: number
  createdBy: string
  createdAt?: Date | null
  /** Set when the to-do was turned into a calendar task, so it is never converted twice. */
  convertedTaskId?: string | null
  /** The whiteboard message it was made from. */
  sourcePostId?: string | null
  pending?: boolean
}

/** Lists every household starts with. Fixed IDs keep two phones from creating duplicates. */
export const DEFAULT_LISTS: Omit<ListDef, 'createdBy' | 'archived'>[] = [
  { id: 'groceries', title: 'Groceries', type: 'shopping', sortOrder: 0 },
  { id: 'costco', title: 'Costco', type: 'shopping', sortOrder: 1 },
  { id: 'sams-club', title: 'Sam’s Club', type: 'shopping', sortOrder: 2 },
  { id: 'household', title: 'Household', type: 'todo', sortOrder: 10 },
  { id: 'errands', title: 'Errands', type: 'todo', sortOrder: 11 },
  { id: 'kids', title: 'Kids', type: 'todo', sortOrder: 12 },
]

/** Suggestions for the store field; any store can be typed. */
export const STORE_SUGGESTIONS = ['Costco', 'Sam’s Club', 'H-E-B', 'Kroger', 'Target', 'Walmart', 'Indian grocery', 'Amazon']

export function sortLists(lists: ListDef[]): ListDef[] {
  return [...lists].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
}

export type ItemOwnerFilter = 'everyone' | 'vishwas' | 'garima' | 'mine'
export type ItemStatusFilter = 'all' | 'active' | 'done'
export type ItemSort = 'manual' | 'due' | 'priority'

export interface ItemQuery {
  owner: ItemOwnerFilter
  status: ItemStatusFilter
  search: string
  sort: ItemSort
  me?: 'vishwas' | 'garima'
}

/** A person's filter includes items for both of you; "mine" is the signed-in member's own name. */
export function itemMatches(item: ListItem, q: ItemQuery): boolean {
  if (q.owner !== 'everyone') {
    const person = q.owner === 'mine' ? q.me : q.owner
    if (item.assignedTo !== person && item.assignedTo !== 'both') return false
  }
  if (q.status === 'active' && item.completed) return false
  if (q.status === 'done' && !item.completed) return false
  const s = q.search.trim().toLowerCase()
  if (s && !`${item.title} ${item.details ?? ''} ${item.store ?? ''}`.toLowerCase().includes(s)) return false
  return true
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 }

/** Open items first (in the chosen order), then completed ones, most recently completed first. */
export function sortItems(items: ListItem[], sort: ItemSort): ListItem[] {
  const manual = (a: ListItem, b: ListItem) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)
  const by: Record<ItemSort, (a: ListItem, b: ListItem) => number> = {
    manual,
    due: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || manual(a, b),
    priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || manual(a, b),
  }
  const open = items.filter((i) => !i.completed).sort(by[sort])
  const done = items
    .filter((i) => i.completed)
    .sort((a, b) => (b.completedAt?.getTime() ?? Infinity) - (a.completedAt?.getTime() ?? Infinity) || manual(a, b))
  return [...open, ...done]
}

export function filterItems(items: ListItem[], q: ItemQuery): ListItem[] {
  return sortItems(items.filter((i) => itemMatches(i, q)), q.sort)
}

/**
 * Items to show on a day's agenda: open items due that day, and on today also open items that
 * are past due. Items without a due date stay in Lists.
 */
export function itemsForDay(items: ListItem[], date: LocalDate, today: LocalDate): ListItem[] {
  return items.filter(
    (i) => !i.archived && i.dueDate && (i.dueDate === date || (date === today && i.dueDate < today && !i.completed)),
  )
}

export function isItemOverdue(item: ListItem, today: LocalDate): boolean {
  return Boolean(!item.completed && item.dueDate && item.dueDate < today)
}

/**
 * Quick entry: "Milk x2", "Milk × 2" or "Eggs x 2 dozen" set a quantity (and unit).
 * Anything else is taken as the title, so "2% milk" stays as typed.
 */
export function parseQuickEntry(text: string): { title: string; quantity: number | null; unit: string | null } {
  const t = text.trim().replace(/\s+/g, ' ')
  const m = /^(.+?)\s*[x×]\s*(\d{1,3})(?:\s+([a-z]{1,15}))?$/i.exec(t)
  if (m && Number(m[2]) > 0) return { title: m[1].trim(), quantity: Number(m[2]), unit: m[3]?.toLowerCase() ?? null }
  return { title: t, quantity: null, unit: null }
}

export function quantityLabel(item: Pick<ListItem, 'quantity' | 'unit'>): string {
  if (!item.quantity) return ''
  return item.unit ? `${item.quantity} ${item.unit}` : `× ${item.quantity}`
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)
}

/** Estimated total of the open items that have a price. */
export function estimatedTotal(items: ListItem[]): number {
  return items.filter((i) => !i.completed && i.price).reduce((sum, i) => sum + (i.price ?? 0) * (i.quantity ?? 1), 0)
}
