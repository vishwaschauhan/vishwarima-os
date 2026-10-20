# VishwarimaOS

*Our days, beautifully organized.*

A private, installable web app for Vishwas and Garima to share household tasks, childcare
routines, groceries and the family calendar. Both phones see the same household in real time.

Built with React, TypeScript, Vite and Tailwind CSS on Firebase Authentication, Cloud
Firestore and Firebase Hosting. Everything runs on Firebase's free **Spark** plan: no
billing account, Cloud Functions or Cloud Storage.

## Status

| Area | State |
| --- | --- |
| Sign-in (Google, email and password), household setup, partner invite | Done |
| Family plan (`config/family-plan.md`), validation and schedule engine | Done |
| Today: date navigation, owner filters, completion with live sync, subtasks, snooze, skip, quick add, tomorrow preview | Done |
| Week: date strip on phones, seven columns on desktop, two-week pilot view, filters | Done |
| Tasks: overdue, today, to-dos, next 7 days, to-discuss; create, edit, reassign, delete | Done |
| Family Calendar: events and busy blocks, private "Busy" blocks, childcare coverage, overlap warnings | Done |
| Settings: plan download, upload, preview and apply; cleaning-team setup; pilot review; activity; JSON export | Done |
| Offline use with pending-sync indicator | Done |
| Design pass: Inter and Newsreader fonts, light/dark/system theme, portrait greeting, sheet animation | Done |
| Install to the home screen (PWA manifest, app icon, offline app shell) | Done |
| Deploy to Firebase Hosting, automatic deploys on merge | Done |
| v2 · Family Whiteboard: shared message feed with pinned notes, reactions, edit/delete, links, search, unread badge, turn into a to-do or event | Done |
| v2 · Photo and PDF uploads on the Whiteboard | Not built: Cloud Storage needs the Blaze billing plan (see below) |
| v2 · Shared lists: to-do and shopping lists with live check-off, assignment, due dates, quantities, filters, search, reorder, clear purchased (archived, can be put back) | Done |

## Project layout

```
config/family-plan.md        Seed household plan (YAML frontmatter + notes)
src/domain/                  Pure logic: dates, plan parsing/validation, occurrence generation
src/data/                    Firestore reads and writes
src/lib/                     Firebase init, auth
src/screens/                 Screens
firestore.rules              Security rules
tests/rules/                 Security rules tests (Firestore emulator)
tests/e2e/                   Playwright tests (Auth + Firestore emulators)
brand/                       Original family portrait and app icon source (not served)
public/brand/                Optimized portrait sizes served by the app
public/icons/                App icons rendered from brand/icon.svg (scripts/render-icons.mjs)
```

## Develop locally

Requires Node 22+ and Java 21+ (for the Firebase emulators).

```sh
npm install
npm run emulators          # terminal 1: local Auth + Firestore
npm run dev:emulators      # terminal 2: app at http://localhost:5173 using the emulators
```

### Checks

```sh
npm run typecheck
npm run lint
npm test                   # unit tests: plan parsing, schedule, dates and DST
npm run test:rules         # security rules in the Firestore emulator
npm run test:e2e           # two-person sign-up and invite in a mobile browser
npm run build
```

To review the design, save phone screenshots of every screen in light and dark mode:

```sh
SCREENSHOT_DIR=$PWD/screens npm run test:e2e -- screens
```

## Install on a phone

The app is a Progressive Web App. On iPhone, open it in Safari, tap **Share → Add to Home Screen**.
On Android, open it in Chrome and tap **Install app**. It then opens full screen with its own icon.

The service worker caches only the app's own files, so it opens instantly and offline. Household
data is never cached by it; Firestore's offline cache handles that. A new version installs itself
in the background and applies the next time the app is opened.

After changing `brand/icon.svg`, run `node scripts/render-icons.mjs` to regenerate the PNG icons.

## Firebase setup (one time)

1. In the [Firebase console](https://console.firebase.google.com), **Create a project**
   (for example `vishwarima-os`). Google Analytics is not needed. Stay on the free Spark plan.
2. **Build → Authentication → Get started.** Enable **Google** and **Email/Password**.
3. **Build → Firestore Database → Create database.** Choose a location (for example
   `us-central1`; it cannot be changed later) and **production mode**.
4. **Project overview → Add app → Web.** Register the app and copy its `firebaseConfig`.
5. `npm run build` reads the web config from `.env.production`, which is committed for the
   `vishwarima-os` project. These values identify the project; they are not secrets. Access is
   enforced by `firestore.rules`. For another project, edit `.env.production` (see `.env.example`).
6. `.firebaserc` points at the `vishwarima-os` project; change it if you use another project ID.

### Authorized domains

Authentication → Settings → Authorized domains already includes `localhost`,
`<project-id>.firebaseapp.com` and `<project-id>.web.app`. Add any custom domain you use.

### Deploy

```sh
npm install -g firebase-tools   # or use npx firebase
firebase login
npm run deploy                  # builds, then deploys Hosting and the Firestore rules
```

The app is then live at `https://<project-id>.web.app`.

### Automatic deploys

Once set up, every merge to `main` deploys itself after CI passes (the `deploy` job in
`.github/workflows/ci.yml`). One-time setup:

1. [Google Cloud console → IAM → Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=vishwarima-os)
   → **Create service account**, named `github-deploy`.
2. Grant it the roles **Firebase Admin** and **Service Usage Consumer**, then **Done**.
3. Open the account → **Keys → Add key → Create new key → JSON**. A file downloads.
4. GitHub repository → **Settings → Secrets and variables → Actions → New repository secret**.
   Name it `FIREBASE_SERVICE_ACCOUNT` and paste the whole JSON file. Then delete the downloaded file.

Without the secret the deploy job is skipped with a warning.

## Household onboarding

There is no server code, so joining is controlled entirely by security rules:

1. **Vishwas** opens the app, signs in, chooses "Vishwas" and taps **Create household**. This
   creates the household, records him as owner and admin, and loads plan version 1 from
   `config/family-plan.md`. This happens once; redeploying never reloads or overwrites the plan.
2. On the home screen, Vishwas enters **Garima's email** under *Invite your partner*.
3. **Garima** signs in with that exact email, using Google (verified automatically) or email and
   password (she must click the verification email first). She sees *You're invited* and taps
   **Join household**.

An invite is stored under the invitee's email and is readable only by someone signed in with
that verified email, so knowing the household ID is not enough to join. Garima should sign in
*after* the invite exists; otherwise she is offered to create a separate household.

## Data model

All data lives under `households/{householdId}`:

| Path | Contents |
| --- | --- |
| `households/{id}` | name, timezone, owner, `memberUids`, `adminUids`, `activePlanVersion`, `firstUseDate` |
| `…/members/{uid}` | display name, plan identity (`vishwas`/`garima`) |
| `…/planVersions/{versionId}` | Markdown plan, `effectiveFrom`, author. Immutable. |
| `…/taskStates/{occurrenceKey}` | completion, completed by/at, subtask states |
| `…/taskOverrides/{occurrenceKey}` | "this occurrence only" changes: owner, time, snooze, activation |
| `…/adHocTasks/{taskId}` | one-off tasks created in the app |
| `…/events/{eventId}` | shared calendar record; a private busy block is titled only "Busy" |
| `…/privateEventDetails/{eventId}` | real title and notes of a private block; owner-only |
| `…/activity/{id}` | append-only change history |
| `…/pilotReviews/{weekId}` | weekly review notes |
| `…/lists/{listId}` | shared list: title, `todo` or `shopping`, order, archived |
| `…/whiteboardPosts/{postId}` | message: author, text, pinned (by), reactions (one per person), edited/deleted time |
| `…/listItems/{itemId}` | list item: list, title, notes, assignee, due date, priority, quantity, unit, store, price, completed by/at, archived (cleared) |
| `invites/{email}` | pending invite: household, plan identity, role |

Recurring tasks are **generated on the device** for the dates being viewed. Firestore stores
only what changes: completions and per-occurrence overrides, keyed
`{taskId}_{YYYY-MM-DD}_{n}` within the household. Each plan version applies from its
`effectiveFrom` date, so editing the plan changes the future and leaves past completions intact.

Dates are handled as `YYYY-MM-DD` strings in the household timezone (America/Chicago), so the
November 1, 2026 DST change never moves a task to another day.

## Security rules summary

- Only household members can read or write household data; anonymous users and other accounts
  get nothing.
- Every write must be stamped with the writer's own uid. A task can only be marked complete in
  your own name.
- Plan versions and the activity log can't be edited or deleted. Only admins add plan versions
  or switch the active one, and the active version must exist.
- A private busy block's shared record must be titled "Busy" with no notes or location. Its real
  details are in a separate document only the owner can read. Only the owner can edit or delete it.
- Whiteboard messages are posted only in your own name and edited only by their author. Pinning
  is stamped with who pinned; you can only set your own reaction; only the author or an admin can
  delete.
- List items must belong to an existing list of the household, can only be assigned to Vishwas,
  Garima, both or anyone, and are checked off only in your own name. Field types and sizes are
  checked; a list's type and an item's creator never change.

## Shared lists

The **Lists** tab holds to-do lists (Household, Errands, Kids) and shopping lists (Groceries,
Costco, Sam’s Club), created once the first time either of you opens it. Add, rename, reorder and
archive lists under **Manage lists**; archiving keeps every item.

- Type an item and press Enter to add the next one. On a shopping list, `Milk x2` sets the
  quantity; the − / + buttons change it later.
- Tap an item to edit its assignee, due date, priority, quantity, unit, store, estimated price
  and notes, move it to another list, or delete it (asks twice).
- Checking an item off records who did it and when. **Clear purchased** / **Clear completed**
  archives finished items rather than deleting them; **Cleared items** shows them and puts one back.
- A to-do with a due date shows on that day under *From your lists* in Today and Week for whoever
  it's assigned to (overdue ones stay on today). Undated items stay in Lists.
- **Move to the calendar as a task** turns a dated to-do into an app task and archives the list
  item in the same write, so it is never in both places.

List items live in Firestore only. The Markdown family plan never reads or overwrites them.

## Family Whiteboard

The **Whiteboard** tab is a shared, chronological message feed, newest at the bottom.

- Write a note and tap the arrow (⌘/Ctrl+Enter on a computer). `**bold**`, `*italic*` and
  `` `code` `` work; web links become tappable chips. Text is never rendered as HTML.
- Tap a message to react, pin it to the strip at the top, copy it, turn it into a to-do (which
  links back to the message) or an event, edit it (your own only) or delete it (your own, or any as
  an admin; asks twice). Deleting clears the text and keeps a record.
- The tab shows how many new messages your partner has posted since this phone last opened it.
  There are no push notifications.
- The feed loads the newest 30 messages and more on request, rather than reading everything.

**Photos and PDFs.** Firebase now requires the Blaze (pay as you go) plan for any Cloud Storage
bucket, including the default one ([Firebase FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)).
To stay entirely on the free Spark plan, share photos and documents as links (Google Photos,
Google Drive) in a message. Uploads can be added later if billing is enabled.

## How changes are saved

- **Completing a task** writes `taskStates/{occurrenceKey}`. Either of you can complete or undo a
  shared task; whoever completes it is recorded. Concurrent edits are last-write-wins per field
  (Firestore merges), so ticking a subtask never un-completes the task.
- **Editing "this day only"** writes `taskOverrides/{occurrenceKey}`: owner, time, title, notes or a
  new date. The plan isn't touched. Reassigning records who assigned it.
- **Editing "this and future"** on a plan task saves a new plan version effective from that date
  (admins only). On an app-created repeating task it ends the old task the day before and starts a
  new one, so earlier days keep their history.
- **Snoozing** moves an occurrence up to 14 days ahead.
- **Plan versions** are numbered `v1`, `v2`, … and can't be overwritten. The newest version whose
  effective date is on or before a day applies to that day. If two people apply a plan at the same
  moment, the second apply fails rather than replacing the first.
- Every change is listed under **Settings → Activity**.

## Offline use

Firestore's persistent cache is enabled with multi-tab support, so the app keeps working
offline and syncs when back online. The cache stores household data on the device: use the
app only on your own phones, and sign out on any shared computer.

## Brand assets

The family portrait is in `brand/vishwarima-family-sunset-portrait.png` (original) and
`public/brand/portrait-{720,1440}.{webp,jpg}` (served). See `public/brand/README.md` to replace it.
