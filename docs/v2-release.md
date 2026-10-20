# VishwarimaOS v2 release notes

## What's new

- **Lists** tab: shared shopping lists (Groceries, Costco, Sam's Club) and to-do lists (Household,
  Errands, Kids), plus any you create. Live check-off with who and when, assignment, due dates,
  priority, quantity, unit, store, estimated price, filters, search, manual order, clear purchased
  (archived and recoverable), and "move to the calendar as a task". Dated items appear on Today and
  Week for the person they're assigned to.
- **Whiteboard** tab: a shared message feed with pinned notes, reactions, author-only editing,
  delete (author or admin), link chips, search, paging and an unread badge. A message can become a
  to-do (linked back) or prefill an event.
- **Voice Quick Add**: speak or type a to-do, shopping item or event; an editable preview saves
  only on Confirm. Microphone buttons on Today, Calendar and each list; a "+" button on every main
  screen.
- Phone navigation: Today, Week, Lists, Whiteboard, Calendar. Settings is the gear at the top;
  Tasks (chores and scheduled tasks) opens from Lists.

## Not included

- **Photo and PDF uploads.** Cloud Storage for Firebase requires the Blaze billing plan for every
  bucket, including the default one
  ([Firebase FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)).
  The app stays on Spark; share photos and files as links in a Whiteboard message.
- Push notifications (the Whiteboard shows an unread count in the app only).
- Hindi/Hinglish voice commands.

## Data and security changes

Additive only. New collections under `households/{id}`: `lists`, `listItems`, `whiteboardPosts`.
No existing collection, document or field is renamed, migrated or deleted, and the rules for
existing collections are unchanged. Starter lists are created once, in a transaction, the first
time the app loads after the update. No new indexes are needed.

New rules: only household members read or write the new collections; list items must belong to an
existing list, are assigned only to Vishwas, Garima, both or anyone, and are checked off only in
your own name; whiteboard posts are written in your own name, edited only by their author, deleted
(text cleared, record kept) only by the author or an admin, and you can only set your own reaction.
Covered by `npm run test:rules`.

## Costs

No change: still the free Spark plan. Reads grow modestly (lists and the newest 30 whiteboard
messages are live-loaded). Voice uses the browser's own speech recognition, not a paid API.

## Deploy

1. **Back up first.** On a phone, open Settings → **Export household data (JSON)** and keep the
   file. It includes lists and whiteboard posts once v2 is live. (Firestore's managed export needs
   Blaze; this export covers everything the app stores except your partner's private event
   details, which they can export from their phone.)
2. From the Mac, in the repository on `main`:
   ```sh
   git pull
   npm ci
   npm run typecheck && npm test
   npm run deploy          # builds, then deploys Hosting and Firestore rules
   ```
3. Open https://vishwarima-os.web.app on both phones. The installed app picks up the new version
   the next time it's opened (close and reopen it once).
4. Check: today's chores and calendar look as before; Lists shows the six starter lists; a test
   item checked off on one phone crosses off on the other; a Whiteboard note arrives on the other
   phone; the mic opens (or offers typing).

## Rollback

- **App:** Firebase console → Hosting → Release history → previous release → **Roll back**. Or
  check out the last v1 commit (`7c74b12`) and run `npm run build && firebase deploy --only hosting`.
- **Rules:** `git checkout 7c74b12 -- firestore.rules && firebase deploy --only firestore:rules`,
  then `git checkout main -- firestore.rules`. v1 rules deny the new collections, so v2 data simply
  becomes unreachable until v2 is redeployed; nothing in v1 data is affected.
- v2 data stays in Firestore either way and reappears when v2 is deployed again.
