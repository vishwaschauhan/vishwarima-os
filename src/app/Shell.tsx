import { CalendarDays, CalendarHeart, ListChecks, ListTodo, MessagesSquare, Settings as SettingsIcon, Sun } from 'lucide-react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { AddButton, AddMenu } from '../components/AddMenu'
import { SyncStatus, Toasts } from '../components/bits'
import { VoiceSheet } from '../components/VoiceSheet'
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
    <span aria-hidden className="absolute -top-1 left-1/2 ml-1.5 min-w-4 rounded-full bg-garima-ink px-1 text-center text-[10px] leading-4 font-semibold text-canvas">
      {count > 9 ? '9+' : count}
    </span>
  )
}

export function Shell() {
  const unread = useUnread()
  return (
    <div className="mx-auto min-h-dvh max-w-6xl lg:flex">
      {/* Desktop sidebar */}
      <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-line px-4 py-6 lg:flex">
        <Wordmark className="mb-6 px-3 text-[20px]" />
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={to === '/whiteboard' && unread ? `${label}, ${unread} unread` : undefined}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition ${isActive ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-muted hover:text-ink'}`
            }
          >
            <span className="relative">
              <Icon size={19} aria-hidden />
              {to === '/whiteboard' && <Badge count={unread} />}
            </span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex min-h-14 items-center justify-between bg-canvas/85 px-5 backdrop-blur-md lg:justify-end">
          <Wordmark className="text-[18px] lg:hidden" />
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
        <main className="mx-auto max-w-2xl px-5 pt-2 pb-[calc(9rem+env(safe-area-inset-bottom))] lg:max-w-none lg:px-8 lg:pb-12">
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
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto flex max-w-xl">
          {TABS.filter((t) => t.phone).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={to === '/whiteboard' && unread ? `${label}, ${unread} unread` : undefined}
              className={({ isActive }) =>
                `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${isActive ? 'text-ink' : 'text-ink-muted'}`
              }
            >
              <span className="relative">
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
