import { expect, test } from '@playwright/test'
import { checkbox, household, resetEmulators, snap } from './helpers'

test.beforeEach(async ({ request }) => resetEmulators(request))

test('a task crossed off on one phone is crossed off on the other', async ({ browser }) => {
  const { v, g } = await household(browser)
  await v.goto('/?d=2026-10-23')
  await g.goto('/?d=2026-10-23')

  await expect(checkbox(g, 'Car wash')).toHaveAttribute('aria-checked', 'false')
  await checkbox(v, 'Car wash').click()
  await expect(checkbox(v, 'Car wash')).toHaveAttribute('aria-checked', 'true')
  // No reload: the partner's open screen updates live.
  await expect(checkbox(g, 'Car wash')).toHaveAttribute('aria-checked', 'true')
  await expect(g.getByText('Done by Vishwas')).toBeVisible()

  // The laundry hand-off across days.
  await g.goto('/?d=2026-10-21')
  await checkbox(g, 'Wash and dry laundry').click()
  await v.goto('/?d=2026-10-22')
  await checkbox(v, 'Fold laundry and arrange in baskets').click()
  await g.goto('/?d=2026-10-22')
  await expect(checkbox(g, 'Fold laundry and arrange in baskets')).toHaveAttribute('aria-checked', 'true')
  await checkbox(g, 'Put folded clothes into closets').click()
  await expect(checkbox(v, 'Put folded clothes into closets')).toHaveAttribute('aria-checked', 'true')
  await snap(v, 'today-thursday')
})

test('a private gym block shows as busy, and overlapping plans warn about the kids', async ({ browser }) => {
  const { v, g } = await household(browser)
  await g.goto('/?d=2026-10-20')
  await g.getByRole('button', { name: 'Busy time' }).click()
  const sheet = g.getByRole('dialog')
  await sheet.getByRole('radio', { name: 'Just “Busy”' }).click()
  await sheet.getByLabel('Title (only you see this)').fill('Gym')
  await sheet.getByRole('button', { name: 'Add to calendar' }).click()
  await expect(g.getByText('Gym', { exact: true })).toBeVisible()

  await v.goto('/?d=2026-10-20')
  await expect(v.getByText('Garima busy', { exact: true })).toBeVisible()
  await expect(v.getByText('Gym', { exact: true })).toHaveCount(0)

  await v.getByRole('button', { name: 'Event', exact: true }).click()
  const vs = v.getByRole('dialog')
  await vs.getByLabel('Title').fill('Late meeting')
  await vs.getByRole('radio', { name: 'Vishwas' }).first().click()
  await vs.getByLabel('Start').fill('18:00')
  await vs.getByLabel('End').fill('20:00')
  await expect(vs.getByText(/You’re both busy 6:00 PM – 7:00 PM/)).toBeVisible()
  await vs.getByRole('button', { name: 'Add to calendar' }).click()

  await expect(v.getByText(/You’re both busy 6:00 PM – 7:00 PM/)).toBeVisible()
  await expect(g.getByText(/You’re both busy 6:00 PM – 7:00 PM/)).toBeVisible()
  await snap(v, 'today-coverage')
  await v.getByRole('link', { name: 'Week' }).click()
  await snap(v, 'week')
  await v.getByRole('link', { name: 'Calendar' }).click()
  await snap(v, 'calendar')
})

test('completing a task offline shows it pending, then syncs', async ({ browser }) => {
  const { v, g, gContext } = await household(browser)
  await v.goto('/?d=2026-10-21')
  await g.goto('/?d=2026-10-21')
  await expect(checkbox(g, 'Kitchen cleanup')).toBeVisible()

  await gContext.setOffline(true)
  await checkbox(g, 'Kitchen cleanup').click()
  await expect(checkbox(g, 'Kitchen cleanup')).toHaveAttribute('aria-checked', 'true')
  await expect(g.getByRole('status').filter({ hasText: 'Offline — changes pending' })).toBeVisible()
  await expect(checkbox(v, 'Kitchen cleanup')).toHaveAttribute('aria-checked', 'false')

  await gContext.setOffline(false)
  await expect(checkbox(v, 'Kitchen cleanup')).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 })
  await expect(g.getByText('Offline — changes pending')).toHaveCount(0)
})

test('a task one of you assigns shows up for the other with who assigned it', async ({ browser }) => {
  const { v, g } = await household(browser)
  await g.goto('/tasks')
  await g.getByRole('button', { name: 'New task' }).click()
  const sheet = g.getByRole('dialog')
  await sheet.getByLabel('Title').fill('Call the pediatrician')
  await sheet.getByRole('radio', { name: 'Vishwas' }).click()
  await sheet.getByRole('button', { name: 'Add task' }).click()

  await v.goto('/tasks')
  await v.getByText('Call the pediatrician', { exact: true }).click()
  await expect(v.getByText('Assigned by Garima')).toBeVisible()
  await v.getByRole('button', { name: 'Accept' }).click()
  await snap(v, 'tasks')

  // Reassign one plan occurrence only; next week's stays with Vishwas.
  await v.goto('/?d=2026-10-23')
  await v.getByRole('button', { name: /^Car wash/ }).click()
  await v.getByRole('button', { name: 'Edit' }).click()
  const edit = v.getByRole('dialog')
  await edit.getByRole('radio', { name: 'Garima' }).click()
  await edit.getByRole('button', { name: 'Save' }).click()
  await g.goto('/?d=2026-10-23')
  await g.getByRole('button', { name: /^Car wash/ }).click()
  await expect(g.getByText('Assigned by Vishwas')).toBeVisible()
  await g.goto('/?d=2026-10-30')
  await expect(g.getByRole('button', { name: /^Car wash/ })).toBeVisible()
  await expect(g.locator('li', { hasText: 'Car wash' }).getByText('Vishwas', { exact: true })).toBeVisible()
})
