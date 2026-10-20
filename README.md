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
| Sign-in (Google, email and password) | Done |
| Household setup and partner invite | Done |
| Family plan (`config/family-plan.md`), validation and schedule engine | Done |
| Firestore security rules with emulator tests | Done |
| Today (read-only list of today's plan) | Done |
| Task completion and live sync, Week, Tasks, Family Calendar | Next |
| Plan upload, preview and apply; pilot review | Next |
| Full visual design, PWA install, app icon | Next |

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
brand/                       Original family portrait (not served)
public/brand/                Optimized portrait sizes served by the app
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

## Firebase setup (one time)

1. In the [Firebase console](https://console.firebase.google.com), **Create a project**
   (for example `vishwarima-os`). Google Analytics is not needed. Stay on the free Spark plan.
2. **Build → Authentication → Get started.** Enable **Google** and **Email/Password**.
3. **Build → Firestore Database → Create database.** Choose a location (for example
   `us-central1`; it cannot be changed later) and **production mode**.
4. **Project overview → Add app → Web.** Register the app and copy its `firebaseConfig`.
5. Copy `.env.example` to `.env` and fill in the values from `firebaseConfig`. These identify
   the project; they are not secrets. Access is enforced by `firestore.rules`.
6. Copy `.firebaserc.example` to `.firebaserc` and set your project ID.

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

## Offline use

Firestore's persistent cache is enabled with multi-tab support, so the app keeps working
offline and syncs when back online. The cache stores household data on the device: use the
app only on your own phones, and sign out on any shared computer.

## Brand assets

The family portrait is in `brand/vishwarima-family-sunset-portrait.png` (original) and
`public/brand/portrait-{720,1440}.{webp,jpg}` (served). See `public/brand/README.md` to replace it.
