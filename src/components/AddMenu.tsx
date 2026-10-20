import { CalendarPlus, ListPlus, MessageSquarePlus, Mic, Plus, ShoppingBasket } from 'lucide-react'
import { useState, type ReactNode } from 'react'
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
      className="fixed right-5 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 inline-flex size-14 items-center justify-center rounded-full bg-ink text-canvas shadow-[0_6px_24px_rgba(0,0,0,0.18)] transition active:scale-95 lg:right-8 lg:bottom-8"
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
      className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl text-[15px] font-medium transition ${
        wide ? 'col-span-2 bg-ink text-canvas' : 'border border-line bg-canvas hover:border-ink-muted'
      }`}
    >
      <span aria-hidden className={wide ? '' : 'text-ink-muted'}>
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
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-line/50 hover:text-ink"
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
      className="flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface px-1 text-[14px] font-medium transition hover:border-ink-muted"
    >
      <Mic size={18} className="text-garima-ink" aria-hidden />
      {label}
    </button>
  )
}
