import { ArrowDown, ArrowUp, Archive, ArchiveRestore } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHousehold } from '../app/household'
import { background } from '../app/toast'
import { createList, newListId, swapOrder, updateList } from '../data/lists'
import type { ListDef, ListType } from '../domain/lists'
import { Segmented, Sheet } from './bits'
import { Button, Field } from './ui'

/** Create, rename, reorder and archive lists. Archiving keeps every item. */
export function ManageListsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Manage lists">
      {open && <Manage onDone={onClose} />}
    </Sheet>
  )
}

function Manage({ onDone }: { onDone: () => void }) {
  const { lists, actor } = useHousehold()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ListType>('todo')
  const active = lists.filter((l) => !l.archived)
  const archived = lists.filter((l) => l.archived)

  function add(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const order = Math.max(0, ...lists.map((l) => l.sortOrder)) + 1
    // The ID is made on the device, so the new list opens at once, even offline.
    const id = newListId(actor.hid)
    background(createList(actor, title.trim().slice(0, 60), type, order, id))
    navigate(`/lists/${id}`, { replace: true })
    onDone()
  }

  return (
    <div className="space-y-5 pb-2">
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {active.map((l, i) => (
          <ListRow
            key={l.id}
            list={l}
            onUp={i > 0 ? () => background(swapOrder(actor, 'lists', l, active[i - 1])) : undefined}
            onDown={i < active.length - 1 ? () => background(swapOrder(actor, 'lists', l, active[i + 1])) : undefined}
          />
        ))}
      </ul>

      <form onSubmit={add} className="space-y-3 rounded-2xl bg-canvas p-4">
        <p className="text-[15px] font-medium">New list</p>
        <Field label="New list name" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Segmented
          label="Kind of list"
          value={type}
          options={[
            { value: 'todo', label: 'To-do' },
            { value: 'shopping', label: 'Shopping' },
          ]}
          onChange={setType}
        />
        <Button type="submit" className="w-full" disabled={!title.trim()}>
          Create list
        </Button>
      </form>

      {archived.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] font-semibold tracking-wide text-ink-muted uppercase">Archived</p>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {archived.map((l) => (
              <li key={l.id} className="flex min-h-14 items-center justify-between gap-2 px-4">
                <span className="text-[15px] text-ink-muted">{l.title}</span>
                <button
                  type="button"
                  onClick={() => background(updateList(actor, l, { archived: false }))}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-medium"
                >
                  <ArchiveRestore size={14} aria-hidden /> Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ListRow({ list, onUp, onDown }: { list: ListDef; onUp?: () => void; onDown?: () => void }) {
  const { actor } = useHousehold()
  const [title, setTitle] = useState(list.title)
  const save = () => {
    const t = title.trim().slice(0, 60)
    if (t && t !== list.title) background(updateList(actor, list, { title: t }))
    else setTitle(list.title)
  }
  return (
    <li className="flex min-h-14 items-center gap-1 pr-1 pl-3">
      <input
        aria-label={`Rename ${list.title}`}
        value={title}
        maxLength={60}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="min-h-10 min-w-0 flex-1 rounded-lg bg-transparent px-1 text-[15px] outline-none focus:bg-canvas"
      />
      <span className="shrink-0 text-[12px] text-ink-muted">{list.type === 'shopping' ? 'Shopping' : 'To-do'}</span>
      <Icon label={`Move ${list.title} up`} onClick={onUp}>
        <ArrowUp size={16} />
      </Icon>
      <Icon label={`Move ${list.title} down`} onClick={onDown}>
        <ArrowDown size={16} />
      </Icon>
      <Icon label={`Archive ${list.title}`} onClick={() => background(updateList(actor, list, { archived: true }))}>
        <Archive size={16} />
      </Icon>
    </li>
  )
}

function Icon({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!onClick}
      onClick={onClick}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink disabled:opacity-25"
    >
      {children}
    </button>
  )
}
