import { describe, expect, it } from 'vitest'
import { groupByDay, linksIn, parseInline, titleFromPost, unreadCount, type WhiteboardPost } from './whiteboard'

const post = (p: Partial<WhiteboardPost>): WhiteboardPost => ({
  id: 'p',
  authorId: 'uid-g',
  body: 'Hi',
  pinned: false,
  reactions: {},
  createdAt: new Date('2026-10-20T15:00:00Z'),
  deleted: false,
  ...p,
})

describe('message formatting', () => {
  it('turns the safe Markdown subset into parts', () => {
    expect(parseInline('Pick up **milk** and *bread* at `5pm`')).toEqual([
      { kind: 'text', text: 'Pick up ' },
      { kind: 'bold', text: 'milk' },
      { kind: 'text', text: ' and ' },
      { kind: 'italic', text: 'bread' },
      { kind: 'text', text: ' at ' },
      { kind: 'code', text: '5pm' },
    ])
  })

  it('links only http(s) URLs and leaves trailing punctuation out', () => {
    expect(parseInline('See https://photos.app.goo.gl/abc.')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'link', text: 'https://photos.app.goo.gl/abc', href: 'https://photos.app.goo.gl/abc' },
      { kind: 'text', text: '.' },
    ])
    expect(parseInline('javascript:alert(1)').every((p) => p.kind === 'text')).toBe(true)
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([{ kind: 'text', text: '<img src=x onerror=alert(1)>' }])
  })

  it('lists each link once with its host', () => {
    expect(linksIn('https://www.drive.google.com/x\nagain https://www.drive.google.com/x')).toEqual([
      { href: 'https://www.drive.google.com/x', host: 'drive.google.com' },
    ])
  })

  it('makes a to-do title from the first line', () => {
    expect(titleFromPost('\n**Order diapers** size 4\nfrom Costco')).toBe('Order diapers size 4')
  })
})

describe('feed', () => {
  it('groups by day in Chicago time, oldest first', () => {
    const late = post({ id: 'a', createdAt: new Date('2026-10-21T04:30:00Z') }) // 11:30 PM Oct 20 in Chicago
    const next = post({ id: 'b', createdAt: new Date('2026-10-21T14:00:00Z') })
    const early = post({ id: 'c', createdAt: new Date('2026-10-20T14:00:00Z') })
    const groups = groupByDay([next, late, early], 'America/Chicago', new Date())
    expect(groups.map((g) => [g.date, g.posts.map((p) => p.id)])).toEqual([
      ['2026-10-20', ['c', 'a']],
      ['2026-10-21', ['b']],
    ])
  })

  it('counts only the partner’s new, undeleted messages as unread', () => {
    const seen = new Date('2026-10-20T12:00:00Z').getTime()
    const posts = [
      post({ id: '1' }),
      post({ id: '2', authorId: 'uid-v' }),
      post({ id: '3', deleted: true }),
      post({ id: '4', createdAt: new Date('2026-10-20T10:00:00Z') }),
    ]
    expect(unreadCount(posts, 'uid-v', seen)).toBe(1)
  })
})
