import { expect, test, type Page } from '@playwright/test'

const PROJECT = 'demo-vishwarima'
const AUTH = 'http://127.0.0.1:9099'
const FIRESTORE = 'http://127.0.0.1:8080'

test.beforeEach(async ({ request }) => {
  await request.delete(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`)
  await request.delete(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`)
})

/** Set SCREENSHOT_DIR to save screens for design review. */
async function snap(page: Page, name: string) {
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png` })
}

async function signUp(page: Page, email: string) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'VishwarimaOS' })).toBeVisible()
  await snap(page, 'sign-in')
  await page.getByRole('button', { name: 'Use email and password' }).click()
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct-horse')
  await page.getByRole('button', { name: 'Create account' }).click()
}

/** Click the verification link the Auth emulator "sent" to `email`. */
async function verifyEmail(page: Page, email: string) {
  const res = await page.request.get(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`)
  const { oobCodes } = (await res.json()) as { oobCodes: { email: string; requestType: string; oobLink: string }[] }
  const code = oobCodes.reverse().find((c) => c.email === email && c.requestType === 'VERIFY_EMAIL')
  expect(code, `verification email for ${email}`).toBeTruthy()
  await page.request.get(code!.oobLink)
}

test('Vishwas founds the household and Garima joins by invite', async ({ browser }) => {
  const vishwas = await (await browser.newContext()).newPage()
  await signUp(vishwas, 'vishwas@example.com')
  await expect(vishwas.getByRole('heading', { name: 'Set up your household' })).toBeVisible()
  await vishwas.getByRole('button', { name: 'Vishwas', exact: true }).click()
  await snap(vishwas, 'setup')
  await vishwas.getByRole('button', { name: 'Create household' }).click()

  // Today's plan comes from config/family-plan.md: the daily resets are always there.
  await expect(vishwas.getByText('Living area cleanup', { exact: true })).toBeVisible()
  await expect(vishwas.getByText('Kitchen cleanup', { exact: true })).toBeVisible()

  await snap(vishwas, 'home')
  await vishwas.getByRole('link', { name: 'Settings' }).click()
  await vishwas.getByLabel('Partner’s email').fill('Garima@Example.com')
  await vishwas.getByRole('button', { name: 'Create invite' }).click()
  await expect(vishwas.getByText('Invite ready.')).toBeVisible()

  // A stranger who signs in is not shown the invite.
  const stranger = await (await browser.newContext()).newPage()
  await signUp(stranger, 'stranger@example.com')
  await expect(stranger.getByRole('heading', { name: 'Set up your household' })).toBeVisible()

  const garima = await (await browser.newContext()).newPage()
  await signUp(garima, 'garima@example.com')
  await expect(garima.getByRole('heading', { name: 'Set up your household' })).toBeVisible()
  await verifyEmail(garima, 'garima@example.com')
  // Reload so the ID token carries email_verified.
  await garima.evaluate(async (path) => {
    // Runs in the page: Vite serves the app's own module.
    const { firebase } = (await import(path)) as typeof import('../../src/lib/firebase')
    await firebase().auth.currentUser?.reload()
    await firebase().auth.currentUser?.getIdToken(true)
  }, '/src/lib/firebase.ts')
  await garima.reload()

  await expect(garima.getByRole('heading', { name: 'You’re invited' })).toBeVisible()
  await garima.getByRole('button', { name: 'Join household' }).click()
  await expect(garima.getByText('Kitchen cleanup', { exact: true })).toBeVisible()

  // Once both have joined, the invite card disappears for Vishwas in real time.
  await expect(vishwas.getByRole('heading', { name: 'Invite your partner' })).toBeHidden()
})
