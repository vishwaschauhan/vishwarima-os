---
schemaVersion: 1
household:
  name: Singh Family
  timezone: America/Chicago
  weekStartsOn: monday
  pilot:
    start: 2026-10-19
    end: 2026-11-01
members:
  - id: vishwas
    displayName: Vishwas
  - id: garima
    displayName: Garima
children:
  - Vihan
  - Vyomika
cleaningService:
  # Every third Friday. The first confirmed visit date is not known yet.
  # Set anchorDate (YYYY-MM-DD, a Friday) to switch on the cleaner visit and its Thursday prep.
  anchorDate: null
  intervalWeeks: 3
tasks:
  # Every day
  - id: living-area-cleanup
    title: Living area cleanup
    owner: vishwas
    category: cleaning
    recurrence: { type: daily }
    time: { slot: evening }
    durationMinutes: 15
  - id: kitchen-cleanup
    title: Kitchen cleanup
    owner: garima
    category: cleaning
    recurrence: { type: daily }
    time: { slot: evening }
    durationMinutes: 15

  # Kids' baths: Monday, Wednesday, Friday
  - id: kids-bath
    title: Kids' bath
    owner: vishwas
    category: kids
    recurrence: { type: weekly, days: [mon, wed, fri] }
    time: { start: "19:30" }
    durationMinutes: 30

  # Tuesday
  - id: cook-fresh-food
    title: Cook fresh food
    owner: garima
    category: meals
    recurrence: { type: weekly, days: [tue] }
    time: { start: "18:00", end: "19:00" }
    notes: Vishwas may help with chopping and prep.

  # Wednesday
  - id: laundry-wash-dry
    title: Wash and dry laundry
    owner: garima
    category: laundry
    recurrence: { type: weekly, days: [wed] }
    time: { start: "18:30" }

  # Thursday
  - id: fridge-reset
    title: Fridge reset
    owner: garima
    category: groceries
    recurrence: { type: weekly, days: [thu] }
    notes: Inspect leftovers, move older food forward, discard spoiled food, check stock.
  - id: sams-club-order
    title: Finalize Sam's Club order
    owner: garima
    category: groceries
    recurrence: { type: weekly, days: [thu] }
  - id: laundry-fold
    title: Fold laundry and arrange in baskets
    owner: vishwas
    category: laundry
    recurrence: { type: weekly, days: [thu] }
    time: { start: "19:30", end: "20:15" }
    notes: Part of the Thursday evening routine. Complete whenever it suits you.
  - id: laundry-put-away
    title: Put folded clothes into closets
    owner: garima
    category: laundry
    recurrence: { type: weekly, days: [thu] }
    time: { start: "19:30", end: "20:15" }
    notes: Part of the Thursday evening routine. Complete whenever it suits you.

  # Friday
  - id: sams-club-pickup
    title: Sam's Club pickup
    owner: garima
    category: groceries
    recurrence: { type: weekly, days: [fri] }
    time: { slot: morning }
  - id: car-wash
    title: Car wash
    owner: vishwas
    category: errands
    recurrence: { type: weekly, days: [fri] }
    time: { start: "17:30" }
  - id: family-evening
    title: Family evening
    kind: info
    owner: both
    category: family
    recurrence: { type: weekly, days: [fri] }
    time: { slot: evening }

  # Saturday
  - id: meal-prep
    title: Bulk vegetable chopping and meal prep
    owner: vishwas
    category: meals
    recurrence: { type: weekly, days: [sat] }
    time: { start: "10:00", end: "11:00" }
    notes: Vishwas leads; both can help.
  - id: costco-run
    title: Costco shopping
    owner: vishwas
    category: groceries
    optional: true
    recurrence: { type: weekly, days: [sat] }
    notes: As needed. Never overdue unless activated for that day.

  # Sunday
  - id: weekly-family-reset
    title: Weekly family reset
    owner: both
    category: family
    recurrence: { type: weekly, days: [sun] }
    time: { start: "19:30", end: "20:15" }
    subtasks:
      - id: vihan-school-outfits
        title: "Prepare Vihan's five school outfits (his 'beautiful pants' and school shirts)"
      - id: socks-underwear-backup
        title: Prepare socks, underwear, and backup clothes
      - id: school-announcements
        title: Check school announcements and Show & Tell
      - id: vyomika-supplies
        title: Replenish Vyomika's diapers, wipes, spare clothes, feeding and daycare supplies
      - id: garima-office-prep
        title: Prepare Garima's office outfits, ID badge, keys, and work bag
      - id: review-calendar
        title: Review appointments, childcare coverage, and family calendar
      - id: plan-meals-groceries
        title: Plan upcoming meals and grocery needs

  # Cleaning team (inactive until cleaningService.anchorDate is set)
  - id: cleaning-prep
    title: Prep for cleaning team
    owner: unassigned
    category: cleaning
    recurrence: { type: cleaningCycle, offsetDays: -1 }
    time: { slot: evening }
    notes: Clear toys, floors and counters; secure fragile items; make sure the cleaners can get in.
  - id: cleaning-visit
    title: Cleaning team visit
    kind: info
    owner: unassigned
    category: cleaning
    recurrence: { type: cleaningCycle, offsetDays: 0 }
---

# Singh Family household plan

This file is the starting point for VishwarimaOS's recurring routines. The app copies it
into the household's first plan version. After that, changes are made in
**Settings → Plan**, where you can download the active plan, edit it, preview the
differences and apply them. Redeploying the app never overwrites the active plan.

## How the plan works

- **Owners** are `vishwas`, `garima`, `both` or `unassigned`. A task owned by `both`
  is done when either of you completes it. Use subtasks when both of you need to contribute.
- **Times** are suggestions. `slot: evening` means "sometime in the evening"; a
  `start`/`end` time is a suggested window, not an appointment.
- **Optional** tasks (like Costco) are never shown as overdue unless you activate them
  for a particular day.
- **Info** items (like Family evening) are shown on the calendar but have no checkbox.
- **Task IDs** never change. Renaming a task keeps its history. Removing a task retires it
  from the effective date onward; past completions stay.

## Evenings

The kids get home around 5 PM and usually sleep around 10 PM. Evening tasks fit in
between and none of the times are fixed.

## Thursday laundry routine

Garima washes and dries on Wednesday. On Thursday Vishwas folds and arranges the
laundry into baskets, and Garima puts the folded clothes into closets. Each part is its
own task, so each of you can tick yours off when you finish.

## Cleaning team

The cleaners come every third Friday. The first visit date hasn't been confirmed, so the
visit and the Thursday prep stay switched off until `cleaningService.anchorDate` is set.
