import { CalendarDays, CalendarHeart, ListChecks, ListTodo, MessagesSquare, Settings as SettingsIcon, Sun } from 'lucide-react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AddButton, AddMenu } from '../components/AddMenu'
import { SyncStatus, Toasts } from '../components/bits'
import { VoiceSheet } from '../components/VoiceSheet'
import { PaintedHeart, Sprig } from '../components/paint'
import { Wordmark } from '../components/ui'
import { Calendar } from '../screens/Calendar'
import { Lists } from '../screens/Lists'
import { Whiteboard } from '../screens/Whiteboard'
import { useRecentPosts, useWhiteboardSeen } from '../data/whiteboard'
import { unreadCount } from '../domain/whiteboard'
import { useHousehold } from './household'
import { Settings } from '../screens/Settings'
import { Tasks } from '../screens/Tasks'
import { Today } from '../screens/Today'
import { Week } from '../screens/Week'

// The phone tab bar keeps the everyday screens; Tasks (chores and scheduled tasks) opens from Lists and
// Settings from the header. The desktop sidebar has room for all of them.
const TABS = [
  { to: '/', label: 'Today', icon: Sun, end: true, phone: true },
  { to: '/week', label: 'Week', icon: CalendarDays, end: false, phone: true },
  { to: '/lists', label: 'Lists', icon: ListTodo, end: false, phone: true },
  { to: '/whiteboard', label: 'Whiteboard', icon: MessagesSquare, end: false, phone: true },
  { to: '/tasks', label: 'Tasks', icon: ListChecks, end: false, phone: false },
  { to: '/calendar', label: 'Calendar', icon: CalendarHeart, end: false, phone: true },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false, phone: false },
]

/** Messages from your partner since this device last opened the whiteboard. */
function useUnread() {
  const { household, user } = useHousehold()
  const recent = useRecentPosts(household.id, 20)
  const seen = useWhiteboardSeen()
  return unreadCount(recent.data, user.uid, seen)
}

function Badge({ count }: { count: number }) {
  if (!count) return null
  return (
    <span aria-hidden className="absolute -top-1 left-1/2 ml-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-bold text-on-primary ring-2 ring-canvas">
      {count > 9 ? '9+' : count}
    </span>
  )
}

export function Shell() {
  const unread = useUnread()
  // Screens settle in when you change tab (not when only the day or list in the URL changes).
  const section = useLocation().pathname.split('/')[1]
  return (
    <div className="mx-auto min-h-dvh max-w-6xl lg:flex">
      {/* Desktop sidebar */}
      <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 px-4 py-6 lg:flex">
        <div className="mb-6 px-3">
          <Wordmark className="text-[23px]" />
          <p className="mt-0.5 font-serif text-[13px] whitespace-nowrap text-ink-muted italic">
            Our days, beautifully organized <PaintedHeart className="inline size-3 align-[-1px]" />
          </p>
        </div>
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={to === '/whiteboard' && unread ? `${label}, ${unread} unread` : undefined}
            className={({ isActive }) =>
              `press flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-semibold ${isActive ? 'bg-surface text-ink shadow-paper ring-1 ring-line [&_svg]:text-primary' : 'text-ink-muted hover:bg-surface/60 hover:text-ink'}`
            }
          >
            <span className="relative">
              <Icon size={19} aria-hidden />
              {to === '/whiteboard' && <Badge count={unread} />}
            </span>
            {label}
          </NavLink>
        ))}
        <Sprig className="mt-auto ml-2 h-12 w-28 opacity-80" />
      </nav>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex min-h-14 items-center justify-between bg-canvas/80 px-5 backdrop-blur-md lg:justify-end lg:bg-transparent lg:backdrop-blur-none">
          <Wordmark className="text-[20px] lg:hidden" />
          <div className="flex items-center gap-1">
            <SyncStatus />
            <NavLink
              to="/settings"
              aria-label="Settings"
              className={({ isActive }) =>
                `-mr-2 inline-flex size-11 items-center justify-center rounded-full transition lg:hidden ${isActive ? 'text-ink' : 'text-ink-muted hover:text-ink'}`
              }
            >
              <SettingsIcon size={20} strokeWidth={1.8} aria-hidden />
            </NavLink>
          </div>
        </header>
        <main key={section} className="page-enter mx-auto max-w-2xl px-5 pt-2 pb-[calc(9rem+env(safe-area-inset-bottom))] lg:max-w-none lg:px-8 lg:pb-12">
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/week" element={<Week />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/lists/:listId?" element={<Lists />} />
            <Route path="/whiteboard" element={<Whiteboard />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/settings/*" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <Toasts />
      <AddButton />
      <AddMenu />
      <VoiceSheet />

      {/* Phone tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-20px_rgb(120_80_50/0.35)] backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto flex max-w-xl">
          {TABS.filter((t) => t.phone).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={to === '/whiteboard' && unread ? `${label}, ${unread} unread` : undefined}
              className={({ isActive }) =>
                `group flex min-h-[3.75rem] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${isActive ? 'active text-ink' : 'text-ink-muted'}`
              }
            >
              <span className="relative inline-flex h-8 w-14 items-center justify-center rounded-full transition duration-200 group-[.active]:bg-marigold-wash group-[.active]:text-primary">
                <Icon size={22} strokeWidth={1.8} aria-hidden />
                {to === '/whiteboard' && <Badge count={unread} />}
              </span>
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
