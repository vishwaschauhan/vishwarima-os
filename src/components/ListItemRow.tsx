import { ArrowDown, ArrowUp, CalendarDays, Minus, Plus, Store } from 'lucide-react'
import { useHousehold } from '../app/household'
import { background } from '../app/toast'
import { setItemCompleted, setItemQuantity } from '../data/lists'
import { formatPrice, isItemOverdue, quantityLabel, type ListItem } from '../domain/lists'
import { shortDate } from '../lib/format'
import { OwnerBadge } from './bits'
import { OWNER_BAR } from './owners'
import { Checkbox } from './TaskRow'

/** One list item: check it off, adjust the quantity, or tap to edit. */
export function ListItemRow({
  item,
  shopping,
  onEdit,
  listName,
  reorder,
}: {
  item: ListItem
  shopping: boolean
  onEdit: (item: ListItem) => void
  /** Shown when the row appears outside its list (on Today or Week). */
  listName?: string
  reorder?: { onUp?: () => void; onDown?: () => void }
}) {
  const { actor, memberName, today } = useHousehold()
  const done = item.completed
  const overdue = isItemOverdue(item, today)
  const qty = quantityLabel(item)

  return (
    <div className={`relative flex items-center gap-3 overflow-hidden rounded-card border bg-surface py-2.5 pr-2 pl-4 shadow-paper ${overdue ? 'border-danger/40' : 'border-line'} ${done ? 'bg-surface/70' : ''}`}>
      <span className={`absolute inset-y-2 left-0 w-1.5 rounded-r-full ${OWNER_BAR[item.assignedTo]}`} aria-hidden />
      <Checkbox
        checked={done}
        label={`${done ? (shopping ? 'Mark not bought' : 'Mark not done') : shopping ? 'Mark bought' : 'Mark done'}: ${item.title}`}
        onToggle={() => background(setItemCompleted(actor, item, !done, shopping))}
      />
      <button type="button" className="min-w-0 flex-1 py-0.5 text-left" onClick={() => onEdit(item)} aria-label={`Edit ${item.title}`}>
        <p className={`font-hand text-[16.5px] leading-snug font-medium transition-colors duration-300 ${done ? 'text-ink-muted' : ''}`}>
          <span className={`strike ${done ? 'is-done' : ''}`}>{item.title}</span>
          {qty && !shopping && <span className="font-normal text-ink-muted"> {qty}</span>}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-ink-muted">
          {listName && <span>{listName}</span>}
          {/* The stepper shows the count; the unit still needs saying. */}
          {shopping && qty && (done || item.unit) && <span className="font-medium text-ink">{done ? qty : item.unit}</span>}
          {item.store && (
            <span className="inline-flex items-center gap-1">
              <Store size={12} aria-hidden /> {item.store}
            </span>
          )}
          {item.price ? <span>{formatPrice(item.price * (item.quantity ?? 1))}</span> : null}
          {item.dueDate && (
            <span className={`inline-flex items-center gap-1 ${overdue ? 'font-medium text-danger' : ''}`}>
              <CalendarDays size={12} aria-hidden />
              {item.dueDate === today ? 'Today' : shortDate(item.dueDate)}
              {overdue && ' · Overdue'}
            </span>
          )}
          {item.priority === 'high' && <span className="font-medium text-danger">High priority</span>}
          {item.details && <span className="max-w-full truncate">{item.details}</span>}
          {item.pending && <span className="italic">Saving…</span>}
        </p>
        {done && item.completedBy && (
          <p className="mt-0.5 text-[13px] text-sage-ink">
            {shopping ? 'Bought' : 'Done'} by {memberName(item.completedBy)}
            {item.completedAt ? ` · ${item.completedAt.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}
          </p>
        )}
      </button>

      {reorder ? (
        <span className="flex shrink-0">
          <MiniButton label={`Move ${item.title} up`} onClick={reorder.onUp}>
            <ArrowUp size={16} />
          </MiniButton>
          <MiniButton label={`Move ${item.title} down`} onClick={reorder.onDown}>
            <ArrowDown size={16} />
          </MiniButton>
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1">
          {shopping && !done && (
            <span className="flex items-center rounded-full bg-marigold-wash/70 ring-1 ring-line" aria-label={`Quantity of ${item.title}`}>
              <MiniButton
                label={`Fewer ${item.title}`}
                onClick={(item.quantity ?? 1) > 1 ? () => background(setItemQuantity(actor, item, (item.quantity ?? 1) - 1 || null)) : undefined}
              >
                <Minus size={14} />
              </MiniButton>
              <span className="min-w-5 text-center text-[14px] font-medium tabular-nums">{item.quantity ?? 1}</span>
              <MiniButton label={`More ${item.title}`} onClick={() => background(setItemQuantity(actor, item, Math.min(999, (item.quantity ?? 1) + 1)))}>
                <Plus size={14} />
              </MiniButton>
            </span>
          )}
          {item.assignedTo !== 'unassigned' && <OwnerBadge owner={item.assignedTo} />}
        </span>
      )}
    </div>
  )
}

function MiniButton({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!onClick}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className="inline-flex size-10 items-center justify-center rounded-full text-ink-muted transition hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  )
}
