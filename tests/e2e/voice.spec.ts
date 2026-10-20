import { expect, test, type Page } from '@playwright/test'
import { household, resetEmulators, snap } from './helpers'

test.beforeEach(async ({ request }) => resetEmulators(request))

/** Replace the browser's speech recognition with one that "hears" `text`. */
async function fakeSpeech(page: Page, text: string) {
  await page.addInitScript((heard) => {
    class FakeRecognition {
      onresult: ((e: unknown) => void) | null = null
      onend: (() => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      start() {
        setTimeout(() => {
          this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: heard, confidence: 0.93 }], { isFinal: true })] })
          this.onend?.()
        }, 300)
      }
      stop() {}
      abort() {}
    }
    ;(window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition
  }, text)
}

async function noSpeech(page: Page) {
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  })
}

test('"Add bananas to groceries" previews correctly; Confirm adds exactly one, Cancel adds none', async ({ browser }) => {
  const { v, g } = await household(browser)
  await fakeSpeech(v, 'Add bananas to groceries')
  await v.goto('/')
  await g.goto('/lists/groceries')

  await v.getByRole('button', { name: 'Add by voice' }).click()
  const sheet = v.getByRole('dialog', { name: 'Speak or type' })
  await expect(sheet.getByText('“Add bananas to groceries”')).toBeVisible()
  await expect(sheet.getByRole('radio', { name: 'Shopping' })).toHaveAttribute('aria-checked', 'true')
  await expect(sheet.getByLabel('Title')).toHaveValue('Bananas')
  await expect(sheet.getByLabel('List')).toHaveValue('groceries')
  await snap(v, 'voice-preview')

  // Cancel writes nothing.
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await v.waitForTimeout(800)
  await expect(g.getByRole('checkbox', { name: /: Bananas$/ })).toHaveCount(0)

  await v.getByRole('button', { name: 'Add by voice' }).click()
  await sheet.getByRole('button', { name: 'Confirm' }).click()
  await expect(v.getByText('Added “Bananas” to Groceries')).toBeVisible()
  await expect(g.getByRole('checkbox', { name: /: Bananas$/ })).toHaveCount(1)
})

test('typed quick add works without speech recognition and puts the gym on both calendars', async ({ browser }) => {
  const { v, g } = await household(browser)
  await noSpeech(v)
  await v.goto('/calendar')
  await v.getByRole('button', { name: 'Add by voice' }).click()
  const sheet = v.getByRole('dialog', { name: 'Speak or type' })
  await expect(sheet.getByText('Voice input isn’t available in this browser.')).toBeVisible()
  await sheet.getByLabel('What should I add?').fill('Gym tomorrow 6 to 7 PM')
  await sheet.getByRole('button', { name: 'Preview' }).click()

  await expect(sheet.getByRole('radio', { name: 'Event' })).toHaveAttribute('aria-checked', 'true')
  await expect(sheet.getByLabel('Title')).toHaveValue('Gym')
  await expect(sheet.getByLabel(/^Start/)).toHaveValue('18:00')
  await expect(sheet.getByLabel(/^End/)).toHaveValue('19:00')
  await expect(sheet.getByRole('radiogroup', { name: 'Who it’s for' }).getByRole('radio', { name: 'Vishwas' })).toHaveAttribute('aria-checked', 'true')
  const date = await sheet.getByLabel(/^Date/).inputValue()
  await sheet.getByRole('button', { name: 'Confirm' }).click()

  await g.goto(`/?d=${date}`)
  await expect(g.getByRole('button', { name: /^Gym 6:00 PM – 7:00 PM/ })).toBeVisible()
})

test('an ambiguous command asks for what’s missing before it can be saved', async ({ browser }) => {
  const { v } = await household(browser)
  await noSpeech(v)
  await v.goto('/')
  await v.getByRole('button', { name: 'Quick add' }).click()
  await v.getByRole('button', { name: 'Speak it' }).click()
  const sheet = v.getByRole('dialog', { name: 'Speak or type' })
  await sheet.getByLabel('What should I add?').fill('Add the appointment next Friday')
  await sheet.getByRole('button', { name: 'Preview' }).click()
  await expect(sheet.getByText('Still needed: a start time, an end time.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  await sheet.getByLabel(/^Start/).fill('14:00')
  await sheet.getByLabel(/^End/).fill('15:00')
  await expect(sheet.getByRole('button', { name: 'Confirm' })).toBeEnabled()
})

test('direct links (for iPhone Shortcuts) open quick add on arrival', async ({ browser }) => {
  const { v } = await household(browser)
  await fakeSpeech(v, 'Add eggs to groceries')
  await v.goto('/lists/groceries?add=voice')
  const sheet = v.getByRole('dialog', { name: 'Speak or type' })
  await expect(sheet.getByText('“Add eggs to groceries”')).toBeVisible()
  await expect(sheet.getByLabel('Title')).toHaveValue('Eggs')
  await expect(v).toHaveURL(/\/lists\/groceries$/)
  await sheet.getByRole('button', { name: 'Cancel' }).click()

  await v.goto('/?add=task')
  await expect(v.getByRole('dialog', { name: 'New task' })).toBeVisible()
  await expect(v).toHaveURL(/\/$/)
})
