import { expect, type APIRequestContext, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test'

const PROJECT = 'demo-vishwarima'
const AUTH = 'http://127.0.0.1:9099'
const FIRESTORE = 'http://127.0.0.1:8080'

export async function resetEmulators(request: APIRequestContext) {
  await request.delete(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`)
  await request.delete(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`)
}

export async function snap(page: Page, name: string) {
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png` })
}

export async function signUp(page: Page, email: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Use email and password' }).click()
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct-horse')
  await page.getByRole('button', { name: 'Create account' }).click()
}

/** Both of you signed in on separate "phones", in one household. */
export async function household(browser: Browser, options: BrowserContextOptions = {}): Promise<{ v: Page; g: Page; gContext: BrowserContext }> {
  const v = await (await browser.newContext(options)).newPage()
  await signUp(v, 'vishwas@example.com')
  await v.getByRole('button', { name: 'Vishwas', exact: true }).click()
  await v.getByRole('button', { name: 'Create household' }).click()
  await v.getByRole('link', { name: 'Settings' }).click()
  await v.getByLabel('Partner’s email').fill('garima@example.com')
  await v.getByRole('button', { name: 'Create invite' }).click()
  await expect(v.getByText('Invite ready.')).toBeVisible()

  const gContext = await browser.newContext(options)
  const g = await gContext.newPage()
  await signUp(g, 'garima@example.com')
  await expect(g.getByRole('heading', { name: 'Set up your household' })).toBeVisible()
  const res = await g.request.get(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`)
  const { oobCodes } = (await res.json()) as { oobCodes: { email: string; oobLink: string }[] }
  await g.request.get(oobCodes.find((c) => c.email === 'garima@example.com')!.oobLink)
  await g.evaluate(async (path) => {
    const { firebase } = (await import(path)) as typeof import('../../src/lib/firebase')
    await firebase().auth.currentUser?.reload()
    await firebase().auth.currentUser?.getIdToken(true)
  }, '/src/lib/firebase.ts')
  await g.reload()
  await g.getByRole('button', { name: 'Join household' }).click()
  await expect(g.getByText('Kitchen cleanup', { exact: true })).toBeVisible()
  return { v, g, gContext }
}

export const checkbox = (page: Page, title: string) => page.getByRole('checkbox', { name: new RegExp(`: ${title}$`) }).first()
