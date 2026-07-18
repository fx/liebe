import { test, expect } from '@playwright/test'
import { openPanel, panelInfo } from './helpers'

test('panel mounts inline and connects to Home Assistant', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await openPanel(page)

  const info = await panelInfo(page)
  expect(info.defined, 'liebe-panel custom element is registered').toBe(true)
  expect(info.mounted, 'panel element is mounted').toBe(true)
  expect(info.inline, 'panel renders inline (not in an iframe)').toBe(true)
  expect(info.connected, 'websocket connection is established').toBe(true)
  expect(info.stateCount, 'demo entities are available').toBeGreaterThan(50)

  expect(errors, 'no fatal console errors').toEqual([])
})
