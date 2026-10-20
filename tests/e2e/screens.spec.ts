import { expect, test } from '@playwright/test'
import { household, resetEmulators, signUp, snap } from './helpers'

// Design review only: saves phone-sized screenshots of each screen in light and dark mode.
// Run with SCREENSHOT_DIR=/some/dir npm run test:e2e -- screens
test.skip(!process.env.SCREENSHOT_DIR, 'Set SCREENSHOT_DIR to capture screens')
test.beforeEach(async ({ request }) => resetEmulators(request))

for (const colorScheme of ['light', 'dark'] as const) {
  test(`screens in ${colorScheme} mode`, async ({ browser }) => {
    const signIn = await (await browser.newContext({ colorScheme })).newPage()
    await signIn.goto('/')
    await expect(signIn.getByRole('button', { name: 'Use email and password' })).toBeVisible()
    await signIn.waitForTimeout(500)
    await snap(signIn, `${colorScheme}-signin`)
    await signUp(signIn, 'someone@example.com')
    await expect(signIn.getByRole('heading', { name: 'Set up your household' })).toBeVisible()
    await snap(signIn, `${colorScheme}-setup`)

    const { v } = await household(browser, { colorScheme })
    await v.goto('/')
    await expect(v.getByText(/^Good /)).toBeVisible()
    await v.waitForTimeout(800)
    await snap(v, `${colorScheme}-today`)
    await v.mouse.wheel(0, 700)
    await v.waitForTimeout(300)
    await snap(v, `${colorScheme}-today-scrolled`)

    await v.getByRole('link', { name: 'Week' }).click()
    await v.waitForTimeout(500)
    await snap(v, `${colorScheme}-week`)
    await v.getByRole('link', { name: 'Lists' }).click()
    await v.getByLabel('Add to Groceries').fill('Milk x2')
    await v.getByLabel('Add to Groceries').press('Enter')
    await v.getByLabel('Add to Groceries').fill('Bananas')
    await v.getByLabel('Add to Groceries').press('Enter')
    await v.getByRole('checkbox', { name: /: Bananas$/ }).click()
    await v.waitForTimeout(500)
    await snap(v, `${colorScheme}-lists`)
    await v.getByRole('link', { name: 'Tasks' }).click()
    await v.waitForTimeout(500)
    await snap(v, `${colorScheme}-tasks`)
    await v.getByRole('link', { name: 'Calendar' }).click()
    await v.waitForTimeout(500)
    await snap(v, `${colorScheme}-calendar`)
    await v.getByRole('link', { name: 'Settings' }).click()
    await v.waitForTimeout(500)
    await snap(v, `${colorScheme}-settings`)

    await v.getByRole('link', { name: 'Today' }).click()
    await v.getByRole('button', { name: 'Task', exact: true }).click()
    await v.waitForTimeout(500)
    await snap(v, `${colorScheme}-new-task`)
  })
}
