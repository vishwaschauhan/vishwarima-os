import { describe, expect, it } from 'vitest'
import { estimatedTotal, filterItems, itemsForDay, parseQuickEntry, quantityLabel, sortItems, type ListItem } from './lists'

function item(partial: Partial<ListItem>): ListItem {
  return {
    id: partial.title ?? 'x',
    listId: 'groceries',
    title: 'Milk',
    assignedTo: 'unassigned',
    priority: 'normal',
    completed: false,
    archived: false,
    sortOrder: 0,
    createdBy: 'uid-v',
    ...partial,
  }
}

const q = { owner: 'everyone' as const, status: 'all' as const, search: '', sort: 'manual' as const }

describe('quick entry', () => {
  it('reads a quantity and unit from "x" or "×"', () => {
    expect(parseQuickEntry('Milk x2')).toEqual({ title: 'Milk', quantity: 2, unit: null })
    expect(parseQuickEntry('Eggs × 2 dozen')).toEqual({ title: 'Eggs', quantity: 2, unit: 'dozen' })
    expect(parseQuickEntry('  bananas  ')).toEqual({ title: 'bananas', quantity: null, unit: null })
  })

  it('leaves numbers that are part of the name alone', () => {
    expect(parseQuickEntry('2% milk')).toEqual({ title: '2% milk', quantity: null, unit: null })
    expect(parseQuickEntry('Diapers size 4')).toEqual({ title: 'Diapers size 4', quantity: null, unit: null })
    expect(parseQuickEntry('Box x0').quantity).toBeNull()
  })

  it('labels quantities', () => {
    expect(quantityLabel({ quantity: 2, unit: 'cartons' })).toBe('2 cartons')
    expect(quantityLabel({ quantity: 3, unit: null })).toBe('× 3')
    expect(quantityLabel({ quantity: null, unit: null })).toBe('')
  })
})

describe('filters and order', () => {
  const items = [
    item({ title: 'Milk', assignedTo: 'vishwas', sortOrder: 2 }),
    item({ title: 'Diapers', assignedTo: 'garima', sortOrder: 1, priority: 'high', dueDate: '2026-10-29' }),
    item({ title: 'Yogurt', assignedTo: 'both', sortOrder: 3, dueDate: '2026-10-24' }),
    item({ title: 'Bananas', completed: true, completedAt: new Date('2026-10-20T10:00:00Z'), sortOrder: 0 }),
  ]
  const titles = (xs: ListItem[]) => xs.map((x) => x.title)

  it('keeps open items in manual order with completed ones after', () => {
    expect(titles(sortItems(items, 'manual'))).toEqual(['Diapers', 'Milk', 'Yogurt', 'Bananas'])
  })

  it('sorts by due date (undated last) or priority', () => {
    expect(titles(sortItems(items, 'due'))).toEqual(['Yogurt', 'Diapers', 'Milk', 'Bananas'])
    expect(titles(sortItems(items, 'priority'))).toEqual(['Diapers', 'Milk', 'Yogurt', 'Bananas'])
  })

  it('filters by person (including items for both), status and search', () => {
    expect(titles(filterItems(items, { ...q, owner: 'vishwas' }))).toEqual(['Milk', 'Yogurt'])
    expect(titles(filterItems(items, { ...q, owner: 'mine', me: 'garima' }))).toEqual(['Diapers', 'Yogurt'])
    expect(titles(filterItems(items, { ...q, status: 'active' }))).toEqual(['Diapers', 'Milk', 'Yogurt'])
    expect(titles(filterItems(items, { ...q, status: 'done' }))).toEqual(['Bananas'])
    expect(titles(filterItems(items, { ...q, search: 'diap' }))).toEqual(['Diapers'])
  })
})

describe('items on the day view', () => {
  const items = [
    item({ title: 'Order diapers', dueDate: '2026-10-22' }),
    item({ title: 'Book pediatrician', dueDate: '2026-10-20' }),
    item({ title: 'Done early', dueDate: '2026-10-19', completed: true }),
    item({ title: 'Someday', dueDate: null }),
  ]

  it('shows items due that day, and overdue open items only on today', () => {
    expect(itemsForDay(items, '2026-10-22', '2026-10-21').map((i) => i.title)).toEqual(['Order diapers'])
    expect(itemsForDay(items, '2026-10-21', '2026-10-21').map((i) => i.title)).toEqual(['Book pediatrician'])
    expect(itemsForDay(items, '2026-10-19', '2026-10-21').map((i) => i.title)).toEqual(['Done early'])
  })
})

it('totals the estimated price of open items', () => {
  expect(estimatedTotal([item({ price: 2.5, quantity: 2 }), item({ price: 4 }), item({ price: 10, completed: true })])).toBe(9)
})
