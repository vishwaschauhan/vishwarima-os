import { localDateAt, type LocalDate } from './dates'

// The family whiteboard: a shared, chronological message feed (`whiteboardPosts/{id}`).

export const MAX_POST_LENGTH = 4000
export const REACTIONS = ['❤️', '👍', '😂', '🙏', '✅'] as const

export interface WhiteboardPost {
  id: string
  authorId: string
  body: string
  pinned: boolean
  pinnedBy?: string | null
  /** uid → emoji; one reaction per person. */
  reactions: Record<string, string>
  createdAt: Date | null
  editedAt?: Date | null
  deleted: boolean
  pending?: boolean
}

/**
 * A safe Markdown subset: **bold**, *italic*, `code`, and http(s) links. Rendered as React
 * elements by the caller, never as HTML, so nothing in a message can run as markup.
 */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string }

const TOKEN = /(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(`[^`\n]+`)|(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,!?;:])/g

export function parseInline(line: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of line.matchAll(TOKEN)) {
    const i = m.index ?? 0
    if (i > last) out.push({ kind: 'text', text: line.slice(last, i) })
    const t = m[0]
    if (m[1]) out.push({ kind: 'bold', text: t.slice(2, -2) })
    else if (m[2]) out.push({ kind: 'italic', text: t.slice(1, -1) })
    else if (m[3]) out.push({ kind: 'code', text: t.slice(1, -1) })
    else out.push({ kind: 'link', text: t, href: safeHref(t) ?? '' })
    last = i + t.length
  }
  if (last < line.length) out.push({ kind: 'text', text: line.slice(last) })
  return out.map((p) => (p.kind === 'link' && !p.href ? { kind: 'text', text: p.text } : p))
}

/** Only absolute http(s) URLs become links. */
export function safeHref(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

/** Links in a message, for the link chips under it. */
export function linksIn(body: string): { href: string; host: string }[] {
  const seen = new Set<string>()
  const out: { href: string; host: string }[] = []
  for (const line of body.split('\n')) {
    for (const p of parseInline(line)) {
      if (p.kind === 'link' && !seen.has(p.href)) {
        seen.add(p.href)
        out.push({ href: p.href, host: new URL(p.href).hostname.replace(/^www\./, '') })
      }
    }
  }
  return out
}

/** Oldest first, grouped by calendar day in the household timezone. */
export function groupByDay(posts: WhiteboardPost[], timezone: string, now: Date): { date: LocalDate; posts: WhiteboardPost[] }[] {
  const sorted = [...posts].sort((a, b) => (a.createdAt ?? now).getTime() - (b.createdAt ?? now).getTime())
  const groups: { date: LocalDate; posts: WhiteboardPost[] }[] = []
  for (const p of sorted) {
    const date = localDateAt(p.createdAt ?? now, timezone)
    const g = groups.at(-1)
    if (g && g.date === date) g.posts.push(p)
    else groups.push({ date, posts: [p] })
  }
  return groups
}

/** Messages from someone else posted after `lastSeen`. */
export function unreadCount(posts: WhiteboardPost[], me: string, lastSeen: number): number {
  return posts.filter((p) => !p.deleted && p.authorId !== me && p.createdAt && p.createdAt.getTime() > lastSeen).length
}

export function matchesSearch(post: WhiteboardPost, search: string): boolean {
  const s = search.trim().toLowerCase()
  return !s || post.body.toLowerCase().includes(s)
}

/** A short title for a to-do or event made from a message: its first line, trimmed. */
export function titleFromPost(body: string): string {
  const first = body.split('\n').find((l) => l.trim()) ?? ''
  const plain = first.replace(/\*\*|`/g, '').replace(/\*/g, '').trim()
  return plain.length > 120 ? `${plain.slice(0, 117)}…` : plain
}
