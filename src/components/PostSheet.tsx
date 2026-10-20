import { CalendarPlus, Copy, ListPlus, Pencil, Pin, PinOff } from 'lucide-react'
import { Fragment, useState, type ReactNode } from 'react'
import { useHousehold } from '../app/household'
import { background } from '../app/toast'
import { deletePost, editPost, setPinned, setReaction } from '../data/whiteboard'
import { MAX_POST_LENGTH, parseInline, REACTIONS, titleFromPost, type WhiteboardPost } from '../domain/whiteboard'
import { ConfirmButton, Sheet } from './bits'
import { EventSheet, type EventSheetMode } from './EventSheet'
import { ListItemSheet, type ItemSheetMode } from './ListItemSheet'
import { TextArea } from './TaskSheet'
import { Button } from './ui'

/**
 * A message's text with the safe Markdown subset applied. No HTML is ever injected. Inside a
 * tappable bubble links render as text (the chips under the bubble open them).
 */
export function MessageText({ body, linkify = true }: { body: string; linkify?: boolean }) {
  return (
    <span className="block text-[16px] leading-snug break-words whitespace-pre-wrap">
      {body.split('\n').map((line, i) => (
        <Fragment key={i}>
          {i > 0 && '\n'}
          {parseInline(line).map((p, j) => {
            switch (p.kind) {
              case 'bold':
                return <strong key={j}>{p.text}</strong>
              case 'italic':
                return <em key={j}>{p.text}</em>
              case 'code':
                return (
                  <code key={j} className="rounded bg-ink/5 px-1 text-[14px]">
                    {p.text}
                  </code>
                )
              case 'link':
                if (!linkify)
                  return (
                    <span key={j} className="underline underline-offset-2 break-all">
                      {p.text}
                    </span>
                  )
                return (
                  <a
                    key={j}
                    href={p.href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    onClick={(e) => e.stopPropagation()}
                    className="underline underline-offset-2 break-all"
                  >
                    {p.text}
                  </a>
                )
              default:
                return <Fragment key={j}>{p.text}</Fragment>
            }
          })}
        </Fragment>
      ))}
    </span>
  )
}

/** Actions on one message: react, pin, edit, delete, or turn it into a to-do or event. */
export function PostSheet({ post, onClose }: { post: WhiteboardPost | null; onClose: () => void }) {
  const [item, setItem] = useState<ItemSheetMode | null>(null)
  const [event, setEvent] = useState<EventSheetMode | null>(null)
  return (
    <>
      <Sheet open={post !== null && !post.deleted} onClose={onClose} title="Message">
        {post && (
          <PostActions
            key={post.id}
            post={post}
            onDone={onClose}
            onTodo={(mode) => {
              onClose()
              setItem(mode)
            }}
            onEvent={(mode) => {
              onClose()
              setEvent(mode)
            }}
          />
        )}
      </Sheet>
      <ListItemSheet mode={item} onClose={() => setItem(null)} />
      <EventSheet mode={event} onClose={() => setEvent(null)} />
    </>
  )
}

function PostActions({
  post,
  onDone,
  onTodo,
  onEvent,
}: {
  post: WhiteboardPost
  onDone: () => void
  onTodo: (m: ItemSheetMode) => void
  onEvent: (m: EventSheetMode) => void
}) {
  const { actor, user, isAdmin, memberName, lists, today } = useHousehold()
  const mine = post.authorId === user.uid
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(post.body)
  const myReaction = post.reactions[user.uid]
  const todoList = lists.find((l) => !l.archived && l.type === 'todo')

  if (editing) {
    return (
      <form
        className="space-y-3 pb-1"
        onSubmit={(e) => {
          e.preventDefault()
          const body = text.trim().slice(0, MAX_POST_LENGTH)
          if (body && body !== post.body) background(editPost(actor, post, body))
          onDone()
        }}
      >
        <TextArea label="Message" value={text} onChange={setText} rows={5} />
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={!text.trim()}>
            Save
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="space-y-4 pb-1">
      <div className="rounded-2xl bg-canvas px-4 py-3">
        <p className="mb-1 text-[12px] text-ink-muted">
          {mine ? 'You' : memberName(post.authorId)} · {post.createdAt?.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
          {post.editedAt && ' · edited'}
        </p>
        <MessageText body={post.body} />
      </div>

      <div className="flex justify-between gap-1" role="group" aria-label="React">
        {REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            aria-label={`React ${e}`}
            aria-pressed={myReaction === e}
            onClick={() => {
              background(setReaction(actor, post, myReaction === e ? null : e))
              onDone()
            }}
            className={`flex size-12 items-center justify-center rounded-full text-[22px] transition ${myReaction === e ? 'bg-shared ring-1 ring-shared-ink/30' : 'bg-canvas hover:bg-line/60'}`}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
        <Action
          icon={post.pinned ? <PinOff size={18} /> : <Pin size={18} />}
          onClick={() => {
            background(setPinned(actor, post, !post.pinned))
            onDone()
          }}
        >
          {post.pinned ? 'Unpin' : 'Pin to the top'}
        </Action>
        {todoList && (
          <Action
            icon={<ListPlus size={18} />}
            onClick={() =>
              onTodo({ kind: 'new', listId: todoList.id, title: titleFromPost(post.body), details: post.body.slice(0, 2000), sourcePostId: post.id })
            }
          >
            Turn into a to-do
          </Action>
        )}
        <Action
          icon={<CalendarPlus size={18} />}
          onClick={() => onEvent({ kind: 'new', date: today, title: titleFromPost(post.body), notes: post.body.slice(0, 2000) })}
        >
          Create an event
        </Action>
        <Action
          icon={<Copy size={18} />}
          onClick={() => {
            navigator.clipboard?.writeText(post.body).catch(() => {})
            onDone()
          }}
        >
          Copy text
        </Action>
        {mine && (
          <Action icon={<Pencil size={18} />} onClick={() => setEditing(true)}>
            Edit
          </Action>
        )}
      </div>

      {(mine || isAdmin) && (
        <ConfirmButton
          className="w-full"
          confirmLabel="Tap again to delete"
          onConfirm={() => {
            background(deletePost(actor, post))
            onDone()
          }}
        >
          Delete message
        </ConfirmButton>
      )}
    </div>
  )
}

function Action({ icon, onClick, children }: { icon: ReactNode; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-12 w-full items-center gap-3 bg-surface px-4 text-left text-[15px] hover:bg-canvas">
      <span className="text-ink-muted" aria-hidden>
        {icon}
      </span>
      {children}
    </button>
  )
}
