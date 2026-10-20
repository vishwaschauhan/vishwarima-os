import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore'
import { ChevronRight, Download, LogOut } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { useHousehold } from '../app/household'
import { useTheme, type ThemeChoice } from '../app/theme'
import { OwnerBadge, SectionTitle, Segmented } from '../components/bits'
import { Button, Card, ErrorText, Field } from '../components/ui'
import { createInvite, type PlanMemberId } from '../data/household'
import { useActivity } from '../data/live'
import { signOutUser } from '../lib/authActions'
import { friendlyError } from '../lib/errors'
import { firebase } from '../lib/firebase'
import { downloadText } from '../lib/download'
import { PlanSettings } from './PlanSettings'
import { PilotReview } from './PilotReview'

export function Settings() {
  return (
    <Routes>
      <Route index element={<SettingsHome />} />
      <Route path="plan" element={<Sub title="Family plan"><PlanSettings /></Sub>} />
      <Route path="review" element={<Sub title="Pilot review"><PilotReview /></Sub>} />
      <Route path="activity" element={<Sub title="Activity"><Activity /></Sub>} />
    </Routes>
  )
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <Link to="/settings" className="text-[14px] text-ink-muted">
        ‹ Settings
      </Link>
      <h1 className="mt-2 mb-5 font-serif text-[28px] leading-tight tracking-tight">{title}</h1>
      {children}
    </div>
  )
}

function Row({ to, label, detail }: { to: string; label: string; detail?: string }) {
  return (
    <Link to={to} className="flex min-h-14 items-center justify-between border-b border-line px-4 last:border-b-0">
      <span className="text-[16px]">{label}</span>
      <span className="flex items-center gap-1 text-[14px] text-ink-muted">
        {detail}
        <ChevronRight size={18} aria-hidden />
      </span>
    </Link>
  )
}

function SettingsHome() {
  const { household, members, me, isAdmin, user, versions, today } = useHousehold()
  const pilot = versions[0]?.plan.frontmatter.household.pilot
  return (
    <div>
      <h1 className="font-serif text-[30px] leading-tight tracking-tight">Settings</h1>

      <SectionTitle>Household</SectionTitle>
      <Card className="space-y-3">
        <p className="text-[16px] font-medium">{household.name}</p>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.uid} className="flex items-center justify-between">
              <span>
                {m.displayName}
                {m.uid === user.uid && <span className="text-ink-muted"> (you)</span>}
                {household.adminUids.includes(m.uid) && <span className="text-[13px] text-ink-muted"> · admin</span>}
              </span>
              <OwnerBadge owner={m.planMemberId} />
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-ink-muted">
          Timezone {household.timezone}. First used {household.firstUseDate ?? today}.
        </p>
      </Card>
      {me && <DisplayName current={me.displayName} />}
      {isAdmin && members.length < 2 && <InvitePartner />}

      <SectionTitle>Appearance</SectionTitle>
      <ThemePicker />

      <SectionTitle>Plan and review</SectionTitle>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <Row to="/settings/plan" label="Family plan" detail={versions.at(-1)?.id} />
        {pilot && <Row to="/settings/review" label="Pilot review" detail={`${pilot.start.slice(5)} – ${pilot.end.slice(5)}`} />}
        <Row to="/settings/activity" label="Activity" />
      </div>

      <SectionTitle>Your data</SectionTitle>
      <Card className="space-y-3">
        <ExportData />
        <p className="text-[13px] text-ink-muted">
          Household data is kept on this device so the app works offline. Use VishwarimaOS only on your own phone or computer, and sign out
          on any shared device: signing out closes the household on this device.
        </p>
        <Button variant="secondary" onClick={() => signOutUser()}>
          <LogOut size={16} aria-hidden /> Sign out
        </Button>
      </Card>
    </div>
  )
}

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Match phone' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

function ThemePicker() {
  const [theme, setTheme] = useTheme()
  return <Segmented label="Theme" value={theme} options={THEMES} onChange={setTheme} />
}

function DisplayName({ current }: { current: string }) {
  const { actor } = useHousehold()
  const [name, setName] = useState(current)
  const [saved, setSaved] = useState(false)
  async function save(e: FormEvent) {
    e.preventDefault()
    await updateDoc(doc(firebase().db, 'households', actor.hid, 'members', actor.uid), { displayName: name.trim() })
    setSaved(true)
  }
  return (
    <form onSubmit={save} className="mt-3 flex items-end gap-2">
      <div className="flex-1">
        <Field label="Your display name" required maxLength={40} value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} />
      </div>
      <Button type="submit" variant="secondary" disabled={!name.trim() || name.trim() === current}>
        {saved ? 'Saved' : 'Save'}
      </Button>
    </form>
  )
}

function InvitePartner() {
  const { user, household } = useHousehold()
  const [email, setEmail] = useState('')
  const [planMemberId, setPlanMemberId] = useState<PlanMemberId>('garima')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createInvite(user, household.id, email, planMemberId)
      setSent(email.trim())
      setEmail('')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-3">
      <h2 className="text-[17px] font-semibold">Invite your partner</h2>
      <p className="mt-1 text-sm text-ink-muted">
        They sign in with this exact email (Google, or email and password once verified) and join automatically.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="Partner’s email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink-muted">They are</span>
          <select
            className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-[16px]"
            value={planMemberId}
            onChange={(e) => setPlanMemberId(e.target.value as PlanMemberId)}
          >
            <option value="garima">Garima</option>
            <option value="vishwas">Vishwas</option>
          </select>
        </label>
        <Button type="submit" disabled={busy}>
          Create invite
        </Button>
        <ErrorText>{error}</ErrorText>
        {sent && <p className="text-sm text-sage-ink">Invite ready. Ask {sent} to open the app and sign in.</p>}
      </form>
    </Card>
  )
}

/** Download everything this member can read as JSON. Partner's private event details are excluded by the rules. */
function ExportData() {
  const { household, user } = useHousehold()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run() {
    setBusy(true)
    setError('')
    try {
      const { db } = firebase()
      const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), household }
      for (const name of ['members', 'planVersions', 'taskStates', 'taskOverrides', 'adHocTasks', 'events', 'activity', 'pilotReviews', 'lists', 'listItems']) {
        const snap = await getDocs(collection(db, 'households', household.id, name))
        out[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      }
      const mine = await getDocs(query(collection(db, 'households', household.id, 'privateEventDetails'), where('ownerUid', '==', user.uid)))
      out.myPrivateEventDetails = mine.docs.map((d) => ({ id: d.id, ...d.data() }))
      downloadText(`vishwarima-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2), 'application/json')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button variant="secondary" onClick={run} disabled={busy}>
        <Download size={16} aria-hidden /> Export household data (JSON)
      </Button>
      <ErrorText>{error}</ErrorText>
    </>
  )
}

const ACTION_LABEL: Record<string, string> = {
  'household.created': 'created the household',
  'member.joined': 'joined',
  'task.completed': 'completed',
  'task.reopened': 'reopened',
  'task.skipped': 'skipped',
  'task.unskipped': 'unskipped',
  'task.accepted': 'accepted',
  'task.discuss': 'wants to discuss',
  'task.changed': 'changed',
  'task.created': 'added',
  'task.edited': 'edited',
  'task.reassigned': 'reassigned',
  'task.archived': 'deleted',
  'event.created': 'added event',
  'event.edited': 'edited event',
  'event.deleted': 'deleted event',
  'plan.applied': 'applied',
  'list.created': 'created list',
  'list.renamed': 'renamed list',
  'list.archived': 'archived list',
  'list.restored': 'restored list',
  'list.cleared': 'cleared',
  'item.created': 'added',
  'item.edited': 'edited',
  'item.reassigned': 'reassigned',
  'item.completed': 'completed',
  'item.purchased': 'bought',
  'item.reopened': 'reopened',
  'item.deleted': 'deleted',
  'item.restored': 'put back',
  'item.converted': 'turned into a task:',
}

function Activity() {
  const { household, memberName } = useHousehold()
  const { data, loading } = useActivity(household.id, 100)
  if (loading && !data.length) return <p className="text-ink-muted">Loading…</p>
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {data.map((a) => (
        <li key={a.id} className="px-4 py-3 text-[14px]">
          <span className="font-medium">{memberName(a.actorUid)}</span> {ACTION_LABEL[a.action] ?? a.action}
          {a.summary ? <span> {a.summary}</span> : null}
          <span className="block text-[12px] text-ink-muted">{a.at?.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </li>
      ))}
    </ul>
  )
}
