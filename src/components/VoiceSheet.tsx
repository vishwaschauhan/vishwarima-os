import { Mic, MicOff, RotateCcw, Square, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useHousehold } from '../app/household'
import { closeVoice, useQuickAdd, type VoiceOptions } from '../app/quickAdd'
import { background, notify } from '../app/toast'
import { useSpeech } from '../app/useSpeech'
import { createItem, newItemId } from '../data/lists'
import { createEvent } from '../data/mutations'
import type { PersonId } from '../domain/agenda'
import { formatTime } from '../domain/agenda'
import { WEEKDAYS } from '../domain/dates'
import type { Owner } from '../domain/plan'
import { describeMissing, missingFor, parseVoiceCommand, validateForSave, type Intent, type VoiceAction } from '../domain/voice'
import { shortDate } from '../lib/format'
import { Segmented, Sheet } from './bits'
import { Button, ErrorText, Field } from './ui'

/** Voice Quick Add: listen (or type), show an editable preview, and save only on Confirm. */
export function VoiceSheet() {
  const { voice } = useQuickAdd()
  return (
    <Sheet open={voice !== null} onClose={closeVoice} title="Speak or type">
      {voice && <Voice key={JSON.stringify(voice)} options={voice} />}
    </Sheet>
  )
}

function Voice({ options }: { options: VoiceOptions }) {
  const { lists, listsLoaded, myId, timezone } = useHousehold()
  const speech = useSpeech()
  const [typed, setTyped] = useState(options.text ?? '')
  const [action, setAction] = useState<VoiceAction | null>(null)
  const [heard, setHeard] = useState('')
  const started = useRef(false)
  const activeLists = lists.filter((l) => !l.archived).map((l) => ({ id: l.id, title: l.title, type: l.type }))

  function parse(text: string) {
    const a = parseVoiceCommand(text, { now: new Date(), timezone, speaker: myId ?? 'vishwas', lists: activeLists })
    // The list on screen wins over the default list when the command didn't name one.
    const ctxList = activeLists.find((l) => l.id === options.listId)
    if (ctxList && a.intent && a.intent !== 'event' && ctxList.type === (a.intent === 'shopping' ? 'shopping' : 'todo')) {
      const named = activeLists.some((l) => l.id === a.listId && text.toLowerCase().includes(l.title.toLowerCase()))
      if (!named) {
        a.listId = ctxList.id
        a.hints = a.hints.filter((h) => !h.startsWith('Added to'))
      }
    }
    setHeard(text)
    setAction(a)
  }

  // Start listening as soon as the sheet opens, when the browser can.
  useEffect(() => {
    if (!started.current && speech.supported && !options.text) {
      started.current = true
      speech.start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Parse once something was heard (or prefilled) and the lists are known, so list names match.
  const ready = listsLoaded || activeLists.length > 0
  const pendingText = options.text ?? (speech.state === 'done' ? speech.transcript : '')
  useEffect(() => {
    if (ready && pendingText && !action) parse(pendingText)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pendingText])

  if (action) {
    return (
      <Preview
        heard={heard}
        lowConfidence={(speech.confidence !== null && speech.confidence < 0.6) || action.confidence < 0.5}
        initial={action}
        onRetry={() => {
          setAction(null)
          setTyped(heard)
          if (speech.supported && speech.state !== 'error') speech.start()
        }}
      />
    )
  }

  const listening = speech.state === 'listening'
  return (
    <div className="space-y-5 pb-1">
      {speech.supported ? (
        <div className="flex flex-col items-center gap-3 pt-2">
          <button
            type="button"
            onClick={listening ? speech.stop : speech.start}
            aria-label={listening ? 'Stop listening' : 'Start listening'}
            className={`relative inline-flex size-24 items-center justify-center rounded-full transition ${listening ? 'bg-garima-ink text-canvas' : 'bg-ink text-canvas'}`}
          >
            {listening && <span className="absolute inset-0 animate-ping rounded-full bg-garima-ink/30 [animation-duration:1.6s]" aria-hidden />}
            {listening ? <Square size={30} fill="currentColor" /> : <Mic size={36} />}
          </button>
          <p role="status" className="min-h-6 text-center text-[15px] text-ink-muted">
            {listening ? 'Listening… tap to stop' : speech.state === 'done' && !speech.transcript ? 'I didn’t catch that. Tap to try again.' : 'Tap the microphone and speak'}
          </p>
          {speech.transcript && <p className="w-full rounded-2xl bg-canvas px-4 py-3 text-[17px]">“{speech.transcript}”</p>}
          <ErrorText>{speech.error}</ErrorText>
          {listening && (
            <button type="button" onClick={speech.cancel} className="text-[14px] text-ink-muted underline underline-offset-2">
              Cancel
            </button>
          )}
        </div>
      ) : (
        <div className="flex gap-3 rounded-2xl bg-canvas px-4 py-3 text-[14px] text-ink-muted">
          <MicOff size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p>Voice input isn’t available in this browser. Type the same thing instead; it works the same way.</p>
        </div>
      )}

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (typed.trim()) {
            speech.cancel()
            parse(typed.trim())
          }
        }}
        className="space-y-2"
      >
        <Field
          label={speech.supported ? 'Or type it' : 'What should I add?'}
          value={typed}
          maxLength={300}
          placeholder="Add two cartons of milk to groceries"
          onChange={(e) => setTyped(e.target.value)}
        />
        <Button type="submit" variant="secondary" className="w-full" disabled={!typed.trim()}>
          Preview
        </Button>
      </form>

      <p className="text-[12px] leading-relaxed text-ink-muted">
        Try “Add bananas to groceries”, “Remind Garima to order diapers by Thursday” or “Gym tomorrow 6 to 7 PM”. Your browser turns speech into
        text and may send the audio to Apple or Google to do it. VishwarimaOS never records or keeps audio; only what you confirm is saved.
      </p>
    </div>
  )
}

const KINDS: { value: Intent; label: string }[] = [
  { value: 'shopping', label: 'Shopping' },
  { value: 'todo', label: 'To-do' },
  { value: 'event', label: 'Event' },
]

function Preview({ heard, initial, lowConfidence, onRetry }: { heard: string; initial: VoiceAction; lowConfidence: boolean; onRetry: () => void }) {
  const { actor, lists, myId } = useHousehold()
  const [a, setA] = useState<VoiceAction>(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const activeLists = lists.filter((l) => !l.archived)
  const listMeta = activeLists.map((l) => ({ id: l.id, title: l.title, type: l.type }))
  const missing = missingFor(a, listMeta)
  const up = (patch: Partial<VoiceAction>) => setA((x) => ({ ...x, ...patch }))

  function setIntent(intent: Intent) {
    const listOfType = (t: 'shopping' | 'todo') => (lists.find((l) => l.id === a.listId)?.type === t ? a.listId : (activeLists.find((l) => l.type === t)?.id ?? null))
    up({
      intent,
      listId: intent === 'event' ? null : listOfType(intent === 'shopping' ? 'shopping' : 'todo'),
      participants: intent === 'event' && a.participants.length === 0 && myId ? [myId] : a.participants,
    })
  }

  function confirm() {
    // Validate the edited action again; nothing is written unless it passes.
    const result = validateForSave(a, listMeta)
    if (!result.ok) return setError(result.error)
    const v = result.action
    setSaving(true)
    if (v.intent === 'event') {
      background(
        createEvent(actor, {
          title: v.title.trim(),
          type: v.eventType,
          date: v.date!,
          start: v.startAt,
          end: v.endAt,
          participants: v.participants,
          busy: v.busy,
          visibility: 'shared',
          coverage: 'unassigned',
          recurrence: v.recurrence.type === 'none' ? { type: 'none' } : v.recurrence.type === 'daily' ? { type: 'daily', until: null } : { type: 'weekly', days: v.recurrence.days, until: null },
          location: '',
          notes: '',
        }),
      )
      notify(`Added “${v.title.trim()}” to the calendar`)
    } else {
      background(
        createItem(
          actor,
          {
            listId: v.listId!,
            title: v.title.trim(),
            details: null,
            assignedTo: v.assigneeId,
            dueDate: v.intent === 'todo' ? v.dueAt : null,
            priority: 'normal',
            quantity: v.intent === 'shopping' ? v.quantity : null,
            unit: v.intent === 'shopping' ? v.unit : null,
            store: null,
            price: null,
          },
          newItemId(actor.hid),
        ),
      )
      notify(`Added “${v.title.trim()}” to ${lists.find((l) => l.id === v.listId)?.title ?? 'the list'}`)
    }
    closeVoice()
  }

  const whoValue: 'vishwas' | 'garima' | 'both' | '' = a.participants.length === 2 ? 'both' : (a.participants[0] ?? '')

  return (
    <div className="space-y-4 pb-1">
      <div className="flex items-start gap-2 rounded-2xl bg-canvas px-4 py-3">
        <p className="min-w-0 flex-1 text-[15px]">
          <span className="block text-[12px] text-ink-muted">You said</span>“{heard}”
        </p>
        <button type="button" onClick={onRetry} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-2 text-[13px] font-medium text-ink-muted hover:text-ink">
          <RotateCcw size={14} aria-hidden /> Try again
        </button>
      </div>

      {(lowConfidence || missing.length > 0 || a.hints.length > 0) && (
        <div role="status" className="space-y-1 rounded-2xl bg-garima/50 px-4 py-3 text-[13px] text-garima-ink">
          {lowConfidence && <p className="flex gap-1.5"><TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden /> I may have misheard. Check the details below.</p>}
          {missing.length > 0 && <p className="font-medium">Still needed: {describeMissing(missing)}.</p>}
          {a.hints.map((h) => (
            <p key={h}>{h}</p>
          ))}
        </div>
      )}

      <div>
        <span className="mb-1.5 block text-sm text-ink-muted">Add as</span>
        <Segmented label="Add as" value={(a.intent ?? '') as Intent} options={KINDS} onChange={setIntent} />
      </div>

      {a.intent && (
        <>
          <Field label="Title" maxLength={200} value={a.title} onChange={(e) => up({ title: e.target.value })} />

          {a.intent !== 'event' && (
            <label className="block">
              <span className="mb-1.5 block text-sm text-ink-muted">List</span>
              <select
                value={a.listId ?? ''}
                onChange={(e) => up({ listId: e.target.value || null })}
                className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-[16px]"
              >
                <option value="">Choose a list</option>
                {activeLists
                  .filter((l) => l.type === (a.intent === 'shopping' ? 'shopping' : 'todo'))
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {a.intent === 'shopping' && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Quantity"
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                value={a.quantity ?? ''}
                onChange={(e) => up({ quantity: e.target.value ? Math.max(1, Math.min(999, Math.round(Number(e.target.value)))) : null })}
              />
              <Field label="Unit" maxLength={20} value={a.unit ?? ''} onChange={(e) => up({ unit: e.target.value || null })} />
            </div>
          )}

          {a.intent !== 'event' && (
            <div>
              <span className="mb-1.5 block text-sm text-ink-muted">Who</span>
              <Segmented
                label="Who"
                value={a.assigneeId}
                options={[
                  { value: 'unassigned' as Owner, label: 'Anyone' },
                  { value: 'vishwas' as Owner, label: 'Vishwas' },
                  { value: 'garima' as Owner, label: 'Garima' },
                  { value: 'both' as Owner, label: 'Both' },
                ]}
                onChange={(v) => up({ assigneeId: v })}
              />
            </div>
          )}

          {a.intent === 'todo' && (
            <Field label={a.dueAt ? `Due ${shortDate(a.dueAt)}` : 'Due date (optional)'} type="date" value={a.dueAt ?? ''} onChange={(e) => up({ dueAt: e.target.value || null })} />
          )}

          {a.intent === 'event' && (
            <>
              <Field label={a.date ? `Date · ${shortDate(a.date)}` : 'Date'} type="date" value={a.date ?? ''} onChange={(e) => up({ date: e.target.value || null })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label={a.startAt ? `Start · ${formatTime(a.startAt)}` : 'Start'} type="time" value={a.startAt ?? ''} onChange={(e) => up({ startAt: e.target.value || null })} />
                <Field label={a.endAt ? `End · ${formatTime(a.endAt)}` : 'End'} type="time" value={a.endAt ?? ''} onChange={(e) => up({ endAt: e.target.value || null, endAssumed: false })} />
              </div>
              <div>
                <span className="mb-1.5 block text-sm text-ink-muted">Who</span>
                <Segmented
                  label="Who it’s for"
                  value={whoValue as 'vishwas' | 'garima' | 'both'}
                  options={[
                    { value: 'vishwas' as const, label: 'Vishwas' },
                    { value: 'garima' as const, label: 'Garima' },
                    { value: 'both' as const, label: 'Both' },
                  ]}
                  onChange={(v) => up({ participants: v === 'both' ? ['vishwas', 'garima'] : [v as PersonId] })}
                />
              </div>
              <label className="flex min-h-11 items-center justify-between">
                <span className="text-[15px]">Blocks time (busy)</span>
                <input type="checkbox" className="size-5 accent-[var(--ink)]" checked={a.busy} onChange={(e) => up({ busy: e.target.checked })} />
              </label>
              {a.recurrence.type !== 'none' && (
                <label className="flex min-h-11 items-center justify-between">
                  <span className="text-[15px]">
                    Repeats{' '}
                    {a.recurrence.type === 'daily'
                      ? 'every day'
                      : `every ${[...a.recurrence.days].sort((x, y) => WEEKDAYS.indexOf(x) - WEEKDAYS.indexOf(y)).map((d) => d[0].toUpperCase() + d.slice(1)).join(', ')}`}
                  </span>
                  <input type="checkbox" className="size-5 accent-[var(--ink)]" checked onChange={() => up({ recurrence: { type: 'none' } })} />
                </label>
              )}
            </>
          )}
        </>
      )}

      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2 pt-1">
        <Button type="button" className="flex-1" disabled={saving || missing.length > 0} onClick={confirm}>
          Confirm
        </Button>
        <Button type="button" variant="secondary" onClick={closeVoice}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
