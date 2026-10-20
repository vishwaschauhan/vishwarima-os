import { expect, test } from '@playwright/test'
import { household, resetEmulators, snap } from './helpers'

test.beforeEach(async ({ request }) => resetEmulators(request))

test('a whiteboard message appears on the other phone and can be pinned, reacted to, edited and deleted', async ({ browser }) => {
  const { v, g } = await household(browser)
  await g.goto('/')
  await v.getByRole('link', { name: 'Whiteboard' }).click()
  const composer = v.getByLabel('Write a message')
  await composer.fill('Vihan’s **photo day** is Friday.\nForm: https://example.com/form')
  await v.getByRole('button', { name: 'Send' }).click()
  await expect(composer).toHaveValue('')
  await expect(v.getByText('photo day', { exact: true })).toBeVisible()

  // Garima sees an unread badge without refreshing, then the message.
  await expect(g.getByRole('link', { name: /Whiteboard.*1 unread/ })).toBeVisible()
  await g.getByRole('link', { name: /Whiteboard/ }).click()
  await expect(g.getByText('photo day', { exact: true })).toBeVisible()
  await expect(g.getByRole('link', { name: 'example.com', exact: true })).toHaveAttribute('href', 'https://example.com/form')
  await expect(g.getByRole('link', { name: /Whiteboard.*unread/ })).toHaveCount(0)

  // Garima pins it and reacts.
  await g.getByRole('button', { name: /Message from Vishwas/ }).click()
  await g.getByRole('button', { name: 'Pin to the top' }).click()
  await g.getByRole('button', { name: /Message from Vishwas/ }).click()
  await g.getByRole('button', { name: 'React ❤️' }).click()
  await expect(v.getByRole('region', { name: 'Pinned' })).toContainText('Vihan’s photo day is Friday.')
  await expect(v.getByLabel('Garima reacted ❤️')).toBeVisible()

  // Only the author can edit.
  await g.getByRole('button', { name: /Message from Vishwas/ }).click()
  await expect(g.getByRole('dialog').getByRole('button', { name: 'Edit' })).toHaveCount(0)
  await g.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await v.getByRole('button', { name: /Message from you/ }).click()
  await v.getByRole('dialog').getByRole('button', { name: 'Edit' }).click()
  await v.getByRole('dialog').getByLabel('Message').fill('Photo day moved to Monday')
  await v.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  const gFeed = g.getByRole('list', { name: 'Messages' })
  await expect(gFeed.getByText('Photo day moved to Monday')).toBeVisible()
  await expect(gFeed.getByText('edited')).toBeVisible()
  await snap(g, 'whiteboard')

  // Turn it into a to-do that links back.
  await g.getByRole('button', { name: /Message from Vishwas/ }).click()
  await g.getByRole('button', { name: 'Turn into a to-do' }).click()
  await expect(g.getByRole('dialog').getByLabel('Name')).toHaveValue('Photo day moved to Monday')
  await g.getByRole('dialog').getByRole('button', { name: 'Add' }).click()
  await expect(g.getByRole('dialog')).toHaveCount(0)
  // Navigate inside the app: a full reload right after Add can drop a write that hasn't reached the local cache yet.
  await g.getByRole('link', { name: 'Lists', exact: true }).click()
  await g.getByRole('link', { name: /^Household/ }).click()
  await expect(g.getByRole('checkbox', { name: /: Photo day moved to Monday$/ })).toBeVisible()

  // Delete with confirmation.
  await v.getByRole('button', { name: /Message from you/ }).click()
  await v.getByRole('button', { name: 'Delete message' }).click()
  await v.getByRole('button', { name: 'Tap again to delete' }).click()
  await expect(v.getByRole('list', { name: 'Messages' })).toHaveCount(0)
  await expect(v.getByRole('region', { name: 'Pinned' })).toHaveCount(0)
})
