import { expect, test, type Page } from '@playwright/test'
import { household, resetEmulators, snap } from './helpers'

test.beforeEach(async ({ request }) => resetEmulators(request))

const itemBox = (page: Page, title: string) => page.getByRole('checkbox', { name: new RegExp(`: ${title}$`) }).first()

async function addItem(page: Page, list: string, text: string) {
  const input = page.getByLabel(`Add to ${list}`)
  await input.fill(text)
  await input.press('Enter')
  // The field stays focused for the next item.
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('')
}

test('a shopping item added on one phone is checked off on the other', async ({ browser }) => {
  const { v, g } = await household(browser)
  await v.getByRole('link', { name: 'Lists' }).click()
  await expect(v).toHaveURL(/\/lists\/groceries$/)
  await g.goto('/lists/groceries')

  await addItem(v, 'Groceries', 'Buy milk x2')
  await addItem(v, 'Groceries', 'Bananas')
  await expect(itemBox(v, 'Buy milk')).toBeVisible()
  // No reload: Garima's open list updates live.
  await expect(itemBox(g, 'Buy milk')).toHaveAttribute('aria-checked', 'false')
  await expect(g.getByLabel('Quantity of Buy milk')).toContainText('2')

  await g.getByRole('button', { name: 'More Bananas' }).click()
  await expect(v.getByLabel('Quantity of Bananas')).toContainText('2')

  await itemBox(g, 'Buy milk').click()
  await expect(itemBox(v, 'Buy milk')).toHaveAttribute('aria-checked', 'true')
  await expect(v.getByText(/Bought by Garima/)).toBeVisible()
  await snap(v, 'lists-groceries')

  // Hide purchased, then clear them (with confirmation) and put one back.
  await v.getByRole('button', { name: 'Hide purchased' }).click()
  await expect(itemBox(v, 'Buy milk')).toHaveCount(0)
  await v.getByRole('button', { name: 'Hide purchased' }).click()
  await v.getByRole('button', { name: 'Clear purchased (1)' }).click()
  await v.getByRole('button', { name: 'Clear 1? Tap again' }).click()
  await expect(itemBox(g, 'Buy milk')).toHaveCount(0)
  await g.getByRole('button', { name: 'Cleared items' }).click()
  await g.getByRole('dialog').getByRole('button', { name: 'Put back' }).click()
  await expect(itemBox(v, 'Buy milk')).toHaveAttribute('aria-checked', 'false')
})

test('a to-do assigned for Thursday shows on that day for the assignee and can be reassigned', async ({ browser }) => {
  const { v, g } = await household(browser)
  await g.goto('/lists/household')
  await addItem(g, 'Household', 'Order diapers')
  await g.getByRole('button', { name: 'Edit Order diapers' }).click()
  const sheet = g.getByRole('dialog')
  await sheet.getByRole('radio', { name: 'Vishwas' }).click()
  await sheet.getByLabel('Due date (optional)').fill('2026-10-22')
  await sheet.getByRole('button', { name: 'Save' }).click()

  await v.goto('/?d=2026-10-22')
  await expect(v.getByText('From your lists')).toBeVisible()
  await expect(itemBox(v, 'Order diapers')).toBeVisible()
  await v.getByRole('radio', { name: 'Garima' }).click()
  await expect(itemBox(v, 'Order diapers')).toHaveCount(0)
  await v.getByRole('radio', { name: 'Vishwas' }).click()
  await snap(v, 'today-with-list-items')

  // Reassign from the day view; Garima's list shows it as hers.
  await v.getByRole('button', { name: 'Edit Order diapers' }).click()
  await v.getByRole('dialog').getByRole('radio', { name: 'Garima' }).click()
  await v.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await g.getByRole('radio', { name: 'Garima' }).click()
  await expect(itemBox(g, 'Order diapers')).toBeVisible()
  await g.getByRole('radio', { name: 'Vishwas' }).click()
  await expect(itemBox(g, 'Order diapers')).toHaveCount(0)
})

test('lists can be created, renamed and archived without losing items', async ({ browser }) => {
  const { v, g } = await household(browser)
  await v.goto('/lists')
  await v.getByRole('button', { name: 'Manage lists' }).click()
  const sheet = v.getByRole('dialog')
  await sheet.getByLabel('New list name').fill('Birthday party')
  await sheet.getByRole('button', { name: 'Create list' }).click()
  await addItem(v, 'Birthday party', 'Order cake')

  await g.goto('/lists')
  await g.getByRole('link', { name: /^Birthday party/ }).click()
  await expect(itemBox(g, 'Order cake')).toBeVisible()

  await v.getByRole('button', { name: 'Manage lists' }).click()
  const name = sheet.getByLabel('Rename Birthday party')
  await name.fill('Vihan’s party')
  await name.press('Enter')
  await sheet.getByRole('button', { name: 'Archive Vihan’s party' }).click()
  await expect(sheet.getByRole('button', { name: 'Restore' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Restore' }).click()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await v.getByRole('link', { name: /^Vihan’s party/ }).click()
  await expect(itemBox(v, 'Order cake')).toBeVisible()
})

test('an item added offline shows pending and syncs once, without duplicates', async ({ browser }) => {
  const { v, g, gContext } = await household(browser)
  await v.goto('/lists/groceries')
  await g.goto('/lists/groceries')
  await expect(g.getByLabel('Add to Groceries')).toBeVisible()

  await gContext.setOffline(true)
  await addItem(g, 'Groceries', 'Yogurt')
  await expect(g.getByText('Saving…')).toBeVisible()
  await expect(g.getByRole('status').filter({ hasText: 'Offline — changes pending' })).toBeVisible()
  await gContext.setOffline(false)

  await expect(itemBox(v, 'Yogurt')).toBeVisible({ timeout: 20_000 })
  await expect(g.getByText('Saving…')).toHaveCount(0, { timeout: 20_000 })
  await expect(v.getByRole('checkbox', { name: /: Yogurt$/ })).toHaveCount(1)
})
