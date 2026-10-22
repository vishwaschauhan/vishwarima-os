import { ArrowUp, ExternalLink, Pin, Search } from 'lucide-react'
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useHousehold } from '../app/household'
import { background } from '../app/toast'
import { useNow } from '../app/useNow'
import { Empty, Skeleton } from '../components/bits'
import { PageTitle } from '../components/paint'
import { MessageText, PostSheet } from '../components/PostSheet'
import { createPost, markWhiteboardSeen, newPostId, usePinnedPosts, useRecentPosts } from '../data/whiteboard'
import { addDays } from '../domain/dates'
import { groupByDay, linksIn, matchesSearch, MAX_POST_LENGTH, titleFromPost, type WhiteboardPost } from '../domain/whiteboard'
import { longDate } from '../lib/format'

const PAGE = 30

/** The family whiteboard: a calm, shared message feed, newest at the bottom, with pinned notes on top. */
export function Whiteboard() {
  const { household, timezone, today } = useHousehold()
  const [count, setCount] = useState(PAGE)
  const recent = useRecentPosts(household.id, count)
  const pinned = usePinnedPosts(household.id)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [open, setOpen] = useState<WhiteboardPost | null>(null)
  const now = useNow()
  const bottom = useRef<HTMLDivElement>(null)
  const scrolledOnce = useRef(false)

  const visible = recent.data.filter((p) => !p.deleted && matchesSearch(p, search))
  const groups = groupByDay(visible, timezone, now)
  const hasMore = recent.data.length >= count
  const newest = recent.data[0]

  // Opening the whiteboard marks everything up to the newest message as seen.
  useEffect(() => {
    if (newest?.createdAt) markWhiteboardSeen(newest.createdAt.getTime())
  }, [newest])

  // Start at the newest message, and follow new ones as they arrive.
  useLayoutEffect(() => {
    if (recent.loading || !bottom.current) return
    const target = location.hash.startsWith('#post-') ? document.getElementById(location.hash.slice(1)) : null
    if (!scrolledOnce.current) {
      ;(target ?? bottom.current).scrollIntoView({ block: target ? 'center' : 'end' })
      scrolledOnce.current = true
    }
  }, [recent.loading])
  const lastId = newest?.id
  useEffect(() => {
    if (scrolledOnce.current) bottom.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [lastId])

  const dayLabel = (d: string) =>
    d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : longDate(d, timezone, { weekday: 'short', month: 'short', day: 'numeric' })
  const pins = pinned.data.filter((p) => !p.deleted).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))

  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <PageTitle eyebrow="Family noticeboard">Whiteboard</PageTitle>
        <button
          type="button"
          aria-label="Search messages"
          aria-pressed={showSearch}
          onClick={() => {
            setShowSearch(!showSearch)
            setSearch('')
          }}
          className={`inline-flex size-11 items-center justify-center rounded-full transition ${showSearch ? 'bg-ink text-canvas' : 'text-ink-muted hover:bg-line/50 hover:text-ink'}`}
        >
          <Search size={19} />
        </button>
      </div>
      {showSearch && (
        <input
          type="search"
          autoFocus
          aria-label="Search messages"
          placeholder="Search loaded messages"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-3 min-h-11 w-full rounded-2xl border border-line bg-surface px-3.5 text-[16px] outline-none focus:border-teal-ink"
        />
      )}

      {pins.length > 0 && (
        <section aria-label="Pinned" className="-mx-5 mt-4 overflow-x-auto px-5 pt-2 pb-2">
          <div className="flex gap-3">
            {pins.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setOpen(p)}
                className="press relative w-64 shrink-0 rounded-[18px] bg-marigold-wash px-4 pt-4 pb-3 text-left shadow-paper ring-1 ring-marigold/30"
              >
                {/* A strip of washi tape holds the note up. */}
                <span aria-hidden className="absolute -top-2 left-1/2 h-4 w-16 -translate-x-1/2 -rotate-3 rounded-[3px] bg-coral/35" />
                <span className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-primary uppercase">
                  <Pin size={12} aria-hidden /> Pinned
                </span>
                <span className="font-hand line-clamp-3 text-[15px] leading-snug">{titleFromPost(p.body) || p.body}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Tall enough that the composer sits near the bottom even with few messages. */}
      <div className="mt-5 min-h-[calc(100dvh-24rem)]">
        {hasMore && !search && (
          <div className="mb-4 text-center">
            <button type="button" onClick={() => setCount(count + PAGE)} className="press min-h-10 rounded-full bg-surface px-4 text-[14px] font-semibold text-ink-muted ring-1 ring-line hover:text-ink">
              Show earlier messages
            </button>
          </div>
        )}
        {recent.loading && recent.data.length === 0 ? (
          <Skeleton rows={3} />
        ) : visible.length === 0 ? (
          <Empty>{search ? 'No loaded messages match.' : 'A shared space for notes to each other. Write the first one below.'}</Empty>
        ) : (
          <ol className="space-y-1.5" aria-label="Messages">
            {groups.map((g) => (
              <Fragment key={g.date}>
                <li className="flex items-center gap-3 pt-4 pb-1.5 text-[13px] text-ink-muted" aria-hidden>
                  <span className="h-px flex-1 bg-gradient-to-r from-transparent to-line" />
                  <span className="font-serif italic">{dayLabel(g.date)}</span>
                  <span className="h-px flex-1 bg-gradient-to-l from-transparent to-line" />
                </li>
                {g.posts.map((p, i) => (
                  <li key={p.id} id={`post-${p.id}`}>
                    <Message post={p} showAuthor={i === 0 || g.posts[i - 1].authorId !== p.authorId} onOpen={() => setOpen(p)} />
                  </li>
                ))}
              </Fragment>
            ))}
          </ol>
        )}
        <div ref={bottom} />
      </div>

      <Composer />
      <PostSheet post={open ? (recent.data.find((p) => p.id === open.id) ?? pinned.data.find((p) => p.id === open.id) ?? open) : null} onClose={() => setOpen(null)} />
    </div>
  )
}

function Message({ post, showAuthor, onOpen }: { post: WhiteboardPost; showAuthor: boolean; onOpen: () => void }) {
  const { user, members, memberName } = useHousehold()
  const mine = post.authorId === user.uid
  const author = members.find((m) => m.uid === post.authorId)
  const tone = author?.planMemberId === 'garima' ? 'bg-garima/75' : author?.planMemberId === 'vishwas' ? 'bg-vishwas/75' : 'bg-surface'
  const links = linksIn(post.body)
  const reactions = Object.entries(post.reactions)
  const time = post.createdAt?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      {showAuthor && <p className="mt-2 mb-1 px-1 text-[12px] font-semibold text-ink-muted">{mine ? 'You' : memberName(post.authorId)}</p>}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Message from ${mine ? 'you' : memberName(post.authorId)}${time ? ` at ${time}` : ''}. Open actions`}
        className={`press max-w-[85%] rounded-[22px] px-4 py-2.5 text-left shadow-paper ring-1 ring-ink/5 ${tone} ${mine ? 'rounded-br-md' : 'rounded-bl-md'} ${post.pinned ? 'ring-marigold/60' : ''}`}
      >
        <MessageText body={post.body} linkify={false} />
        <span className="mt-1 flex items-center justify-end gap-1.5 text-[12px] text-ink-muted">
          {post.pinned && <Pin size={11} aria-label="Pinned" />}
          {post.editedAt && <span>edited</span>}
          {post.pending ? <span className="italic">Sending…</span> : <span>{time}</span>}
        </span>
      </button>
      {links.length > 0 && (
        <div className={`mt-1 flex max-w-[85%] flex-wrap gap-1.5 ${mine ? 'justify-end' : ''}`}>
          {links.slice(0, 3).map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-[13px] font-semibold text-teal-ink shadow-paper ring-1 ring-line hover:ring-teal-ink/40"
            >
              <ExternalLink size={12} aria-hidden /> {l.host}
            </a>
          ))}
        </div>
      )}
      {reactions.length > 0 && (
        <p className="mt-0.5 px-2 text-[13px]" aria-label={reactions.map(([uid, e]) => `${memberName(uid)} reacted ${e}`).join(', ')}>
          {reactions.map(([uid, e]) => (
            <span key={uid} className="mr-0.5">
              {e}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

/** Write a message. Enter adds a line on phones; ⌘/Ctrl+Enter or the arrow sends. */
function Composer() {
  const { actor } = useHousehold()
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  function send(e?: FormEvent) {
    e?.preventDefault()
    const body = text.trim()
    if (!body) return
    background(createPost(actor, body.slice(0, MAX_POST_LENGTH), newPostId(actor.hid)))
    setText('')
    ref.current?.focus()
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
  }

  return (
    <form
      onSubmit={send}
      className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 mt-5 flex items-end gap-2 rounded-[26px] border border-line bg-surface/95 p-1.5 pl-4 shadow-lift backdrop-blur-md transition focus-within:border-teal-ink lg:bottom-4"
    >
      <textarea
        ref={ref}
        rows={1}
        value={text}
        maxLength={MAX_POST_LENGTH}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        aria-label="Write a message"
        placeholder="Write a note… (links welcome)"
        className="max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2 text-[16px] leading-snug outline-none placeholder:text-ink-muted/80"
      />
      <button
        type="submit"
        aria-label="Send"
        disabled={!text.trim()}
        className="press inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-30"
      >
        <ArrowUp size={20} />
      </button>
    </form>
  )
}
