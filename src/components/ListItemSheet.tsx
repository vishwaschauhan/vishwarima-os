import { CalendarPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useHousehold } from '../app/household'
import { background } from '../app/toast'
import { convertToTask, createItem, deleteItem, updateItem, type ItemInput } from '../data/lists'
import type { Priority } from '../domain/agenda'
import { STORE_SUGGESTIONS, type ListItem } from '../domain/lists'
import type { Owner } from '../domain/plan'
import { ConfirmButton, Segmented, Sheet } from './bits'
import { TextArea } from './TaskSheet'
import { Button, ErrorText, Field } from './ui'

export type ItemSheetMode =
  | { kind: 'new'; listId: string; title?: string; dueDate?: string; details?: string; sourcePostId?: string }
  | { kind: 'edit'; item: ListItem }

const OWNERS: { value: Owner; label: string }[] = [
  { value: 'unassigned', label: 'Anyone' },
  { value: 'vishwas', label: 'Vishwas' },
  { value: 'garima', label: 'Garima' },
  { value: 'both', label: 'Both' },
]

export function ListItemSheet({ mode, onClose }: { mode: ItemSheetMode | null; onClose: () => void }) {
  const { lists } = useHousehold()
  const listId = mode?.kind === 'edit' ? mode.item.listId : mode?.listId
  const shopping = lists.find((l) => l.id === listId)?.type === 'shopping'
  const noun = shopping ? 'item' : 'to-do'
  return (
    <Sheet open={mode !== null} onClose={onClose} title={mode?.kind === 'edit' ? `Edit ${noun}` : `New ${noun}`}>
      {mode && <ItemForm key={mode.kind === 'edit' ? mode.item.id : 'new'} mode={mode} onDone={onClose} />}
    </Sheet>
  )
}

function ItemForm({ mode, onDone }: { mode: ItemSheetMode; onDone: () => void }) {
  const { actor, lists } = useHousehold()
  const item = mode.kind === 'edit' ? mode.item : undefined
  const [listId, setListId] = useState(item?.listId ?? (mode.kind === 'new' ? mode.listId : ''))
  const list = lists.find((l) => l.id === listId)
  const shopping = list?.type === 'shopping'
  const [title, setTitle] = useState(item?.title ?? (mode.kind === 'new' ? (mode.title ?? '') : ''))
  const [assignedTo, setAssignedTo] = useState<Owner>(item?.assignedTo ?? 'unassigned')
  const [dueDate, setDueDate] = useState(item?.dueDate ?? (mode.kind === 'new' ? (mode.dueDate ?? '') : ''))
  const [priority, setPriority] = useState<Priority>(item?.priority ?? 'normal')
  const [quantity, setQuantity] = useState(item?.quantity ? String(item.quantity) : '')
  const [unit, setUnit] = useState(item?.unit ?? '')
  const [store, setStore] = useState(item?.store ?? '')
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : '')
  const [details, setDetails] = useState(item?.details ?? (mode.kind === 'new' ? (mode.details ?? '') : ''))
  const sourcePostId = item?.sourcePostId ?? (mode.kind === 'new' ? mode.sourcePostId : undefined)
  const [error, setError] = useState('')

  function input(): ItemInput | string {
    if (!title.trim()) return 'Give it a name.'
    if (!list) return 'Pick a list.'
    const q = quantity.trim() ? Number(quantity) : null
    if (q !== null && (!Number.isInteger(q) || q < 1 || q > 999)) return 'Quantity is a whole number from 1 to 999.'
    const p = price.trim() ? Number(price.replace(/^\$/, '')) : null
    if (p !== null && (!Number.isFinite(p) || p < 0 || p > 100000)) return 'Enter a price like 4.99.'
    return {
      listId,
      title: title.trim().slice(0, 200),
      details: details.trim() || null,
      assignedTo,
      dueDate: dueDate || null,
      priority,
      quantity: q,
      unit: unit.trim().slice(0, 20) || null,
      store: store.trim().slice(0, 40) || null,
      price: p === null ? null : Math.round(p * 100) / 100,
      ...(mode.kind === 'new' && mode.sourcePostId ? { sourcePostId: mode.sourcePostId } : {}),
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const result = input()
    if (typeof result === 'string') return setError(result)
    // Saved locally at once; syncs in the background (failures show as a toast).
    background(item ? updateItem(actor, item, result) : createItem(actor, result))
    onDone()
  }

  function convert() {
    if (!item) return
    background(convertToTask(actor, item))
    onDone()
  }

  const activeLists = lists.filter((l) => !l.archived || l.id === listId)

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />

      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-muted">List</span>
        <select value={listId} onChange={(e) => setListId(e.target.value)} className="min-h-11 w-full rounded-2xl border border-line bg-surface px-3 text-[16px]">
          {activeLists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title} {l.type === 'shopping' ? '(shopping)' : '(to-do)'}
            </option>
          ))}
        </select>
      </label>

      {shopping && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity" type="number" inputMode="numeric" min={1} max={999} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <Field label="Unit (optional)" maxLength={20} placeholder="cartons, lb…" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Store (optional)" maxLength={40} list="store-suggestions" value={store} onChange={(e) => setStore(e.target.value)} />
            <Field label="Est. price each" inputMode="decimal" placeholder="$" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <datalist id="store-suggestions">
            {STORE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </>
      )}

      <div>
        <span className="mb-1.5 block text-sm text-ink-muted">Who</span>
        <Segmented label="Who" value={assignedTo} options={OWNERS} onChange={setAssignedTo} />
      </div>

      <Field label="Due date (optional)" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

      {!shopping && (
        <div>
          <span className="mb-1.5 block text-sm text-ink-muted">Priority</span>
          <Segmented
            label="Priority"
            value={priority}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'High' },
            ]}
            onChange={setPriority}
          />
        </div>
      )}

      <TextArea label="Notes" value={details} onChange={setDetails} rows={2} />
      {sourcePostId && (
        <Link to={`/whiteboard#post-${sourcePostId}`} className="block text-[13px] text-ink-muted underline underline-offset-2">
          Made from a whiteboard message
        </Link>
      )}

      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" className="flex-1">
          {item ? 'Save' : 'Add'}
        </Button>
        {item && (
          <ConfirmButton confirmLabel="Tap again to delete" onConfirm={() => { background(deleteItem(actor, item)); onDone() }}>
            Delete
          </ConfirmButton>
        )}
      </div>
      {item && !shopping && !item.completed && (
        <div className="border-t border-line pt-4">
          <Button type="button" variant="secondary" className="w-full" disabled={!item.dueDate} onClick={convert}>
            <CalendarPlus size={16} aria-hidden /> Move to the calendar as a task
          </Button>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            {item.dueDate
              ? `It becomes a task on ${item.dueDate} and leaves this list, so it’s never in both places.`
              : 'Set and save a due date first.'}
          </p>
        </div>
      )}
    </form>
  )
}
