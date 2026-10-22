import { CalendarPlus, ListPlus, MessageSquarePlus, Mic, Plus, ShoppingBasket } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useHousehold } from '../app/household'
import { closeAddMenu, openAddMenu, openVoice, useQuickAdd } from '../app/quickAdd'
import { Sheet } from './bits'
import { EventSheet, type EventSheetMode } from './EventSheet'
import { ListItemSheet, type ItemSheetMode } from './ListItemSheet'
import { TaskSheet, type TaskSheetMode } from './TaskSheet'

/** The "+" button: add a task, shopping item, event, message, or speak one. */
export function AddButton() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/whiteboard') || pathname.startsWith('/settings')) return null
  return (
    <button
      type="button"
      onClick={openAddMenu}
      aria-label="Quick add"
      className="press fixed right-5 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 inline-flex size-14 items-center justify-center rounded-[22px_26px_22px_26px] bg-primary text-on-primary shadow-lift ring-4 ring-canvas/70 hover:brightness-105 lg:right-8 lg:bottom-8"
    >
      <Plus size={26} />
    </button>
  )
}

export function AddMenu() {
  const { addMenu } = useQuickAdd()
  const { lists, today } = useHousehold()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const [task, setTask] = useState<TaskSheetMode | null>(null)
  const [item, setItem] = useState<ItemSheetMode | null>(null)
  const [event, setEvent] = useState<EventSheetMode | null>(null)

  // On a day or list screen, add to what's on screen.
  const day = new URLSearchParams(search).get('d') ?? today
  const listOnScreen = /^\/lists\/([^/]+)/.exec(pathname)?.[1]
  const shoppingList = lists.find((l) => l.id === listOnScreen && l.type === 'shopping') ?? lists.find((l) => !l.archived && l.type === 'shopping')

  // Direct links for iPhone Shortcuts and bookmarks: ?add=voice|menu|task|item|event opens that
  // quick add on arrival (e.g. /lists/groceries?add=voice). The parameter is removed once handled.
  const add = new URLSearchParams(search).get('add')
  const listsReady = lists.length > 0
  useEffect(() => {
    if (!add || (add === 'item' && !listsReady)) return
    const params = new URLSearchParams(search)
    params.delete('add')
    const rest = params.toString()
    navigate(`${pathname}${rest ? `?${rest}` : ''}`, { replace: true })
    const date = pathname === '/' || pathname === '/week' ? day : today
    // The link is outside input arriving once, so opening a sheet from this effect is intended.
    /* oxlint-disable react/set-state-in-effect */
    if (add === 'voice') openVoice({ listId: listOnScreen })
    else if (add === 'menu') openAddMenu()
    else if (add === 'task') setTask({ kind: 'new', date })
    else if (add === 'event') setEvent({ kind: 'new', date })
    else if (add === 'item' && shoppingList) setItem({ kind: 'new', listId: shoppingList.id })
    /* oxlint-enable react/set-state-in-effect */
  }, [add, listsReady]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Sheet open={addMenu} onClose={closeAddMenu} title="Add">
        <div className="grid grid-cols-2 gap-2 pb-1">
          <Option icon={<Mic size={22} />} label="Speak it" wide onClick={() => openVoice({ listId: listOnScreen })} />
          <Option icon={<ListPlus size={22} />} label="Task" onClick={() => { closeAddMenu(); setTask({ kind: 'new', date: pathname === '/' || pathname === '/week' ? day : today }) }} />
          {shoppingList && (
            <Option icon={<ShoppingBasket size={22} />} label="Shopping item" onClick={() => { closeAddMenu(); setItem({ kind: 'new', listId: shoppingList.id }) }} />
          )}
          <Option icon={<CalendarPlus size={22} />} label="Event" onClick={() => { closeAddMenu(); setEvent({ kind: 'new', date: pathname === '/' || pathname === '/week' ? day : today }) }} />
          <Option icon={<MessageSquarePlus size={22} />} label="Message" onClick={() => { closeAddMenu(); navigate('/whiteboard') }} />
        </div>
      </Sheet>
      <TaskSheet mode={task} onClose={() => setTask(null)} />
      <ListItemSheet mode={item} onClose={() => setItem(null)} />
      <EventSheet mode={event} onClose={() => setEvent(null)} />
    </>
  )
}

function Option({ icon, label, onClick, wide }: { icon: ReactNode; label: string; onClick: () => void; wide?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-card text-[15px] font-semibold ${
        wide ? 'col-span-2 bg-primary text-on-primary shadow-paper' : 'border border-line bg-canvas shadow-paper hover:border-ink-muted/60'
      }`}
    >
      <span aria-hidden className={wide ? '' : 'text-primary'}>
        {icon}
      </span>
      {label}
    </button>
  )
}

/** A microphone button for screens with their own quick-add row. */
export function MicButton({ listId, label = 'Voice', compact = false }: { listId?: string; label?: string; compact?: boolean }) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => openVoice({ listId })}
        aria-label="Add by voice"
        className="press inline-flex size-10 shrink-0 items-center justify-center rounded-full text-garima-ink hover:bg-garima/60"
      >
        <Mic size={20} />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={() => openVoice({ listId })}
      aria-label="Add by voice"
      className="press flex min-h-12 items-center justify-center gap-1.5 rounded-card border border-line bg-surface px-1 text-[14px] font-semibold shadow-paper hover:border-ink-muted/60"
    >
      <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-full bg-garima text-garima-ink">
        <Mic size={16} />
      </span>
      {label}
    </button>
  )
}
