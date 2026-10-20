import { Check, ChevronDown, Clock, MessageCircle, Repeat, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useHousehold } from '../app/household'
import { background } from '../app/toast'
import { SNOOZE_WINDOW_DAYS } from '../data/live'
import { setCompleted, setOverride, setResponse, setSkipped, setSubtaskDone } from '../data/mutations'
import { timeLabel, type AgendaTask } from '../domain/agenda'
import { addDays } from '../domain/dates'
import { shortDate } from '../lib/format'
import { OwnerBadge } from './bits'
import { OWNER_BAR } from './owners'

function Checkbox({ checked, label, onToggle, size = 'lg' }: { checked: boolean; label: string; onToggle: () => void; size?: 'lg' | 'sm' }) {
  const box = size === 'lg' ? 'size-7' : 'size-5'
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      // 44px tap target around a smaller visual box.
      className="-m-2 inline-flex size-11 shrink-0 items-center justify-center"
    >
      <span
        className={`${box} inline-flex items-center justify-center rounded-full border-[1.5px] transition-all duration-200 ${
          checked ? 'scale-100 border-sage-ink bg-sage-ink text-surface' : 'border-ink-muted/50 bg-surface hover:border-ink'
        }`}
      >
        <Check size={size === 'lg' ? 16 : 12} strokeWidth={3} className={`transition-all duration-200 ${checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} />
      </span>
    </button>
  )
}

export function TaskRow({ item, onEdit, showDate = false }: { item: AgendaTask; onEdit?: (item: AgendaTask) => void; showDate?: boolean }) {
  const { actor, myId, memberName, user, today } = useHousehold()
  const [open, setOpen] = useState(false)
  const { occ, state } = item
  const done = item.completed
  const skipped = Boolean(state?.skipped)
  const subtasks = occ.subtasks
  const subDone = subtasks.filter((s) => state?.subtasks?.[s.id]?.done).length
  const assignedToMeByPartner =
    item.assignedBy && item.assignedBy !== user.uid && (occ.owner === myId || occ.owner === 'both')
  const fire = background

  if (occ.kind === 'info') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/60 px-4 py-3">
        <Sparkles size={18} className="shrink-0 text-shared-ink" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-medium">{occ.title}</p>
          <p className="text-sm text-ink-muted">{timeLabel(occ.time)}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-surface transition-colors ${
        item.overdue ? 'border-danger/40' : 'border-line'
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${OWNER_BAR[occ.owner]}`} aria-hidden />
      <div className="flex items-start gap-3 py-3 pr-3 pl-4">
        <div className="pt-0.5">
          <Checkbox checked={done} label={`${done ? 'Mark not done' : 'Mark done'}: ${occ.title}`} onToggle={() => fire(setCompleted(actor, item, !done))} />
        </div>
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <p
            className={`text-[16px] leading-snug font-medium transition-all duration-300 ${
              done || skipped ? 'text-ink-muted line-through decoration-ink-muted/60' : ''
            }`}
          >
            {occ.title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-ink-muted">
            {showDate && occ.date && <span>{shortDate(occ.date)}</span>}
            <span className="inline-flex items-center gap-1">
              <Clock size={12} aria-hidden />
              {timeLabel(occ.time)}
              {occ.durationMinutes ? ` · ${occ.durationMinutes} min` : ''}
            </span>
            {item.priority === 'high' && <span className="font-medium text-danger">High priority</span>}
            {occ.optional && !item.override?.activated && <span>Optional</span>}
            {item.overdue && <span className="font-medium text-danger">Overdue</span>}
            {skipped && <span>Skipped</span>}
            {item.originalDate && item.originalDate !== occ.date && <span>Moved from {shortDate(item.originalDate)}</span>}
            {subtasks.length > 0 && (
              <span>
                {subDone}/{subtasks.length} steps
              </span>
            )}
            {state?.response === 'discuss' && (
              <span className="inline-flex items-center gap-1 text-garima-ink">
                <MessageCircle size={12} aria-hidden /> To discuss
              </span>
            )}
            {(state?.pending || false) && <span className="italic">Saving…</span>}
          </p>
          {done && state?.completedBy && (
            <p className="mt-0.5 text-[13px] text-sage-ink">
              Done by {memberName(state.completedBy)}
              {state.completedAt ? ` at ${state.completedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
            </p>
          )}
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          <OwnerBadge owner={occ.owner} />
          <ChevronDown size={16} className={`text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-line px-4 pt-3 pb-4">
          {item.assignedBy && <p className="text-[13px] text-ink-muted">Assigned by {memberName(item.assignedBy)}</p>}
          {occ.notes && <p className="text-[14px] whitespace-pre-line text-ink-muted">{occ.notes}</p>}

          {subtasks.length > 0 && (
            <ul className="space-y-1">
              {subtasks.map((s) => {
                const sDone = Boolean(state?.subtasks?.[s.id]?.done)
                return (
                  <li key={s.id} className="flex items-center gap-3">
                    <Checkbox size="sm" checked={sDone} label={`${s.title}`} onToggle={() => fire(setSubtaskDone(actor, item, s.id, !sDone))} />
                    <span className={`flex-1 text-[14px] ${sDone ? 'text-ink-muted line-through' : ''}`}>{s.title}</span>
                    {s.owner !== 'unassigned' && <OwnerBadge owner={s.owner} />}
                  </li>
                )
              })}
              <li className="pt-1 text-[12px] text-ink-muted">Ticking every step doesn’t complete the task; tick the task when it’s done.</li>
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            {onEdit && <Chip onClick={() => onEdit(item)}>Edit</Chip>}
            {occ.date && !done && snoozeTarget(item, today) && (
              <Chip
                onClick={() =>
                  fire(setOverride(actor, item, { movedTo: snoozeTarget(item, today) }, `Snoozed ${occ.title}`))
                }
              >
                Snooze a day
              </Chip>
            )}
            {occ.date && !done && <Chip onClick={() => fire(setSkipped(actor, item, !skipped))}>{skipped ? 'Unskip' : 'Skip'}</Chip>}
            {occ.optional && (
              <Chip
                onClick={() =>
                  fire(setOverride(actor, item, { activated: !item.override?.activated }, `${item.override?.activated ? 'Deactivated' : 'Activated'} ${occ.title}`))
                }
              >
                {item.override?.activated ? 'Not needed' : 'Needed this time'}
              </Chip>
            )}
            {assignedToMeByPartner && state?.response !== 'accepted' && (
              <Chip onClick={() => fire(setResponse(actor, item, 'accepted'))}>Accept</Chip>
            )}
            {assignedToMeByPartner && (
              <Chip onClick={() => fire(setResponse(actor, item, state?.response === 'discuss' ? null : 'discuss'))}>
                {state?.response === 'discuss' ? 'Resolved' : 'Let’s discuss'}
              </Chip>
            )}
            {item.source === 'plan' && (
              <span className="inline-flex items-center gap-1 self-center text-[12px] text-ink-muted">
                <Repeat size={12} aria-hidden /> From the family plan
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** The next day, unless that is past the window in which snoozed tasks are still loaded. */
function snoozeTarget(item: AgendaTask, today: string): string | null {
  const next = addDays(item.occ.date < today ? today : item.occ.date, 1)
  return next <= addDays(item.originalDate, SNOOZE_WINDOW_DAYS) ? next : null
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-9 rounded-full border border-line bg-canvas px-3.5 text-[13px] font-medium transition hover:border-ink-muted">
      {children}
    </button>
  )
}

