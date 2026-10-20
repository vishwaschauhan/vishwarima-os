import { CalendarDays, CalendarHeart, ListChecks, Settings as SettingsIcon, Sun } from 'lucide-react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { SyncStatus, Toasts } from '../components/bits'
import { Wordmark } from '../components/ui'
import { Calendar } from '../screens/Calendar'
import { Settings } from '../screens/Settings'
import { Tasks } from '../screens/Tasks'
import { Today } from '../screens/Today'
import { Week } from '../screens/Week'

const TABS = [
  { to: '/', label: 'Today', icon: Sun, end: true },
  { to: '/week', label: 'Week', icon: CalendarDays, end: false },
  { to: '/tasks', label: 'Tasks', icon: ListChecks, end: false },
  { to: '/calendar', label: 'Calendar', icon: CalendarHeart, end: false },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false },
]

export function Shell() {
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
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition ${isActive ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-muted hover:text-ink'}`
            }
          >
            <Icon size={19} aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex min-h-14 items-center justify-between bg-canvas/85 px-5 backdrop-blur-md lg:justify-end">
          <Wordmark className="text-[18px] lg:hidden" />
          <SyncStatus />
        </header>
        <main className="mx-auto max-w-2xl px-5 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:max-w-none lg:px-8 lg:pb-12">
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/week" element={<Week />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/settings/*" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <Toasts />

      {/* Phone tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto flex max-w-xl">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${isActive ? 'text-ink' : 'text-ink-muted'}`
              }
            >
              <Icon size={22} strokeWidth={1.8} aria-hidden />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
