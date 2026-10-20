import { ArrowDownUp, ChevronRight, History, ListChecks, Plus, Search, Settings2, ShoppingBasket } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useHousehold } from '../app/household'
import { background } from '../app/toast'
import { useStoredState } from '../app/useStoredState'
import { ConfirmButton, Empty, OwnerFilterBar, Segmented, Skeleton } from '../components/bits'
import { ListItemRow } from '../components/ListItemRow'
import { ListItemSheet, type ItemSheetMode } from '../components/ListItemSheet'
import { ManageListsSheet } from '../components/ManageListsSheet'
import { Sheet } from '../components/bits'
import { clearCompleted, createItem, restoreItem, swapOrder, useClearedItems } from '../data/lists'
import {
  estimatedTotal,
  filterItems,
  formatPrice,
  parseQuickEntry,
  type ItemOwnerFilter,
  type ItemSort,
  type ItemStatusFilter,
  type ListDef,
  type ListItem,
} from '../domain/lists'

/** Shared to-do and shopping lists. `/lists/:listId` shows one list; `/lists` opens the last one used. */
export function Lists() {
  const { lists, listsLoaded } = useHousehold()
  const { listId } = useParams()
  const [last, setLast] = useStoredState<string | null>('lists.last', null)

  const active = lists.filter((l) => !l.archived)
  const list = lists.find((l) => l.id === listId)
  useEffect(() => {
    if (list && list.id !== last) setLast(list.id)
  }, [list, last, setLast])

  // `/lists` opens the last list used. Navigating (rather than rendering <Navigate>) keeps the
  // header, and any sheet opened from it, mounted.
  const navigate = useNavigate()
  const target = listId ? undefined : (active.find((l) => l.id === last) ?? active[0])
  useEffect(() => {
    if (target) navigate(`/lists/${target.id}`, { replace: true })
  }, [target, navigate])

  return (
    <div>
      <ListsHeader active={active} current={list} />
      {!list ? (
        lists.length === 0 || !listsLoaded ? (
          <div className="mt-6">
            <Skeleton rows={4} />
          </div>
        ) : (
          <div className="mt-6">
            <Empty>That list doesn’t exist anymore.</Empty>
          </div>
        )
      ) : (
        <ListView key={list.id} list={list} />
      )}
    </div>
  )
}

function ListsHeader({ active, current }: { active: ListDef[]; current?: ListDef }) {
  const { listItems } = useHousehold()
  const [manage, setManage] = useState(false)
  const openCount = (id: string) => listItems.filter((i) => i.listId === id && !i.completed).length
  const groups: [string, ListDef[]][] = [
    ['Shopping', active.filter((l) => l.type === 'shopping')],
    ['To-dos', active.filter((l) => l.type === 'todo')],
  ]

  return (
    <>
      <div className="flex items-end justify-between gap-2">
        <h1 className="font-serif text-[30px] leading-tight tracking-tight">Lists</h1>
        <div className="flex items-center gap-1">
          <Link to="/tasks" className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-[14px] font-medium text-ink-muted hover:text-ink">
            <ListChecks size={17} aria-hidden /> Tasks
            <ChevronRight size={15} aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => setManage(true)}
            aria-label="Manage lists"
            className="inline-flex size-11 items-center justify-center rounded-full text-ink-muted transition hover:bg-line/50 hover:text-ink"
          >
            <Settings2 size={19} />
          </button>
        </div>
      </div>

      <nav aria-label="Lists" className="mt-3 space-y-2">
        {groups.map(([label, items]) =>
          items.length === 0 ? null : (
            <div key={label} className="-mx-5 overflow-x-auto px-5">
              <div className="flex items-center gap-1.5">
                <span className="mr-1 shrink-0 text-ink-muted" aria-label={label} title={label}>
                  {label === 'Shopping' ? <ShoppingBasket size={17} /> : <ListChecks size={17} />}
                </span>
                {items.map((l) => {
                  const sel = l.id === current?.id
                  const n = openCount(l.id)
                  return (
                    <Link
                      key={l.id}
                      to={`/lists/${l.id}`}
                      replace
                      aria-current={sel ? 'page' : undefined}
                      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium whitespace-nowrap transition ${
                        sel ? 'bg-ink text-canvas' : 'bg-surface text-ink ring-1 ring-line hover:ring-ink-muted'
                      }`}
                    >
                      {l.title}
                      {n > 0 && <span className={`text-[12px] tabular-nums ${sel ? 'text-canvas/70' : 'text-ink-muted'}`}>{n}</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          ),
        )}
      </nav>
      <ManageListsSheet open={manage} onClose={() => setManage(false)} />
    </>
  )
}

function ListView({ list }: { list: ListDef }) {
  const { actor, listItems, myId } = useHousehold()
  const shopping = list.type === 'shopping'
  const [owner, setOwner] = useStoredState<ItemOwnerFilter>('lists.owner', 'everyone')
  const [status, setStatus] = useStoredState<ItemStatusFilter>(`lists.status.${list.type}`, 'all')
  const [sort, setSort] = useStoredState<ItemSort>('lists.sort', 'manual')
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [reorder, setReorder] = useState(false)
  const [sheet, setSheet] = useState<ItemSheetMode | null>(null)
  const [cleared, setCleared] = useState(false)

  const all = listItems.filter((i) => i.listId === list.id)
  const shown = filterItems(all, { owner, status, search, sort, me: myId })
  const doneCount = all.filter((i) => i.completed).length
  const total = shopping ? estimatedTotal(all) : 0
  const canReorder = sort === 'manual' && owner === 'everyone' && !search.trim() && status !== 'done'
  const openShown = shown.filter((i) => !i.completed)

  const move = (i: number, dir: -1 | 1) => {
    const a = openShown[i]
    const b = openShown[i + dir]
    if (a && b) background(swapOrder(actor, 'listItems', a, b))
  }

  return (
    <div className="mt-5">
      <QuickAddItem list={list} />

      <div className="mt-4 space-y-2">
        <OwnerFilterBar value={owner} onChange={setOwner} myId={myId} />
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            {shopping ? (
              <button
                type="button"
                aria-pressed={status === 'active'}
                onClick={() => setStatus(status === 'active' ? 'all' : 'active')}
                className={`min-h-11 w-full rounded-full px-4 text-sm font-medium transition ${
                  status === 'active' ? 'bg-ink text-canvas' : 'bg-line/60 text-ink-muted hover:text-ink'
                }`}
              >
                Hide purchased
              </button>
            ) : (
              <Segmented
                label="Status"
                value={status}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'active', label: 'Active' },
                  { value: 'done', label: 'Done' },
                ]}
                onChange={setStatus}
              />
            )}
          </div>
          <ToolButton label="Search" pressed={showSearch} onClick={() => { setShowSearch(!showSearch); setSearch('') }}>
            <Search size={18} />
          </ToolButton>
          <ToolButton label="Reorder" pressed={reorder} disabled={!canReorder} onClick={() => setReorder(!reorder)}>
            <ArrowDownUp size={18} />
          </ToolButton>
        </div>
        {showSearch && (
          <div className="flex gap-2">
            <input
              type="search"
              autoFocus
              aria-label={`Search ${list.title}`}
              placeholder={`Search ${list.title}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-[16px] outline-none focus:border-ink-muted"
            />
            <select
              aria-label="Sort by"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as ItemSort)
                setReorder(false)
              }}
              className="min-h-11 rounded-xl border border-line bg-surface px-2 text-[15px]"
            >
              <option value="manual">My order</option>
              <option value="due">Due date</option>
              <option value="priority">Priority</option>
            </select>
          </div>
        )}
      </div>

      <div className="mt-4">
        {shown.length === 0 ? (
          <Empty>
            {all.length === 0
              ? shopping
                ? 'Nothing to buy. Add the first item above.'
                : 'Nothing to do here yet. Add the first to-do above.'
              : 'Nothing matches these filters.'}
          </Empty>
        ) : (
          <ul className="space-y-2">
            {shown.map((item) => {
              const i = openShown.indexOf(item)
              return (
                <li key={item.id} className="list-item-enter">
                  <ListItemRow
                    item={item}
                    shopping={shopping}
                    onEdit={(it) => setSheet({ kind: 'edit', item: it })}
                    reorder={
                      reorder && canReorder && i >= 0
                        ? { onUp: i > 0 ? () => move(i, -1) : undefined, onDown: i < openShown.length - 1 ? () => move(i, 1) : undefined }
                        : undefined
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {total > 0 && <p className="mt-3 px-1 text-right text-[13px] text-ink-muted">Estimated total {formatPrice(total)}</p>}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setCleared(true)} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[14px] text-ink-muted hover:text-ink">
          <History size={16} aria-hidden /> Cleared items
        </button>
        {doneCount > 0 && (
          <ConfirmButton
            confirmLabel={`Clear ${doneCount}? Tap again`}
            onConfirm={() => background(clearCompleted(actor, list, all))}
          >
            {shopping ? 'Clear purchased' : 'Clear completed'} ({doneCount})
          </ConfirmButton>
        )}
      </div>

      <ListItemSheet mode={sheet} onClose={() => setSheet(null)} />
      <ClearedSheet list={list} open={cleared} onClose={() => setCleared(false)} />
    </div>
  )
}

/** Type and press Enter to add another; the field keeps focus. "Milk x2" sets the quantity. */
function QuickAddItem({ list }: { list: ListDef }) {
  const { actor } = useHousehold()
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const shopping = list.type === 'shopping'

  function add(e: FormEvent) {
    e.preventDefault()
    const parsed = shopping ? parseQuickEntry(text) : { title: text.trim(), quantity: null, unit: null }
    if (!parsed.title) return
    background(
      createItem(actor, {
        listId: list.id,
        title: parsed.title.slice(0, 200),
        details: null,
        assignedTo: 'unassigned',
        dueDate: null,
        priority: 'normal',
        quantity: parsed.quantity,
        unit: parsed.unit,
        store: null,
        price: null,
      }),
    )
    setText('')
    inputRef.current?.focus()
  }

  return (
    <form onSubmit={add} className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-1.5 pl-4 focus-within:border-ink-muted">
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={200}
        enterKeyHint="enter"
        aria-label={`Add to ${list.title}`}
        placeholder={shopping ? `Add to ${list.title} (e.g. Milk x2)` : `Add a to-do to ${list.title}`}
        className="min-h-10 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-muted/70"
      />
      <button
        type="submit"
        aria-label="Add"
        disabled={!text.trim()}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-canvas transition disabled:opacity-30"
      >
        <Plus size={20} />
      </button>
    </form>
  )
}

function ToolButton({ label, pressed, disabled, onClick, children }: { label: string; pressed: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-30 ${
        pressed ? 'bg-ink text-canvas' : 'bg-line/60 text-ink-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/** Items cleared off a list, most recent first. Any of them can be put back. */
function ClearedSheet({ list, open, onClose }: { list: ListDef; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={`Cleared from ${list.title}`}>
      {open && <ClearedItems list={list} />}
    </Sheet>
  )
}

function ClearedItems({ list }: { list: ListDef }) {
  const { household, actor, memberName } = useHousehold()
  const { data, loading } = useClearedItems(household.id, list.id)
  const navigate = useNavigate()
  if (loading && !data.length) return <Skeleton rows={2} />
  const items = [...data].sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)).slice(0, 100)
  if (!items.length) return <p className="pb-4 text-[14px] text-ink-muted">Nothing cleared yet.</p>
  return (
    <ul className="divide-y divide-line pb-2">
      {items.map((i: ListItem) => (
        <li key={i.id} className="flex min-h-14 items-center gap-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[15px]">{i.title}</p>
            <p className="text-[12px] text-ink-muted">
              {i.convertedTaskId
                ? `Moved to the calendar${i.dueDate ? ` on ${i.dueDate}` : ''}`
                : i.completedBy
                  ? `${list.type === 'shopping' ? 'Bought' : 'Done'} by ${memberName(i.completedBy)}${i.completedAt ? `, ${i.completedAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}`
                  : 'Cleared'}
            </p>
          </div>
          {i.convertedTaskId ? (
            i.dueDate && (
              <button type="button" className="min-h-9 rounded-full border border-line px-3 text-[13px] font-medium" onClick={() => navigate(`/?d=${i.dueDate}`)}>
                Open day
              </button>
            )
          ) : (
            <button type="button" className="min-h-9 rounded-full border border-line px-3 text-[13px] font-medium" onClick={() => background(restoreItem(actor, i))}>
              Put back
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
