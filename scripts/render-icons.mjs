// Renders brand/icon.svg to the PNG icons the PWA manifest and iOS need.
// Usage: node scripts/render-icons.mjs   (set PW_CHROMIUM_PATH to use a preinstalled Chromium)
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const svg = readFileSync('brand/icon.svg', 'utf8')
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined })
const page = await browser.newPage()

async function render(file, size, { padding = 0, radius = 0 } = {}) {
  await page.setViewportSize({ width: size, height: size })
  const inner = size * (1 - 2 * padding)
  await page.setContent(`<html><body style="margin:0;background:#FCF7EF">
    <div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:${radius}px;background:#F8D9C4">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
    </div></body></html>`)
  await page.screenshot({ path: file, omitBackground: radius > 0 })
}

await render('public/icons/icon-192.png', 192)
await render('public/icons/icon-512.png', 512)
// Maskable icons keep the artwork inside the central safe zone.
await render('public/icons/icon-maskable-512.png', 512, { padding: 0.1 })
await render('public/icons/apple-touch-icon.png', 180)
await render('public/icons/favicon-32.png', 32)
await browser.close()
