import { existsSync, readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { load } from 'js-yaml'
import { openPanel, panelInfo } from './helpers'
import { getPanelConfig } from '../../src/config/panel'

test('configuration.yaml panel entry matches src/config/panel.ts', () => {
  const raw = readFileSync(new URL('../../ha/config/configuration.yaml', import.meta.url), 'utf8')
  const parsed = load(raw) as {
    panel_custom?: Array<{ name?: string; url_path?: string; module_url?: string }>
  }
  const entry = parsed.panel_custom?.[0]
  expect(entry, 'configuration.yaml has a panel_custom entry').toBeTruthy()

  // getPanelConfig picks dev vs prod from NODE_ENV; force prod for the comparison
  // since the e2e stack runs the production bundle.
  const originalEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  let prod
  try {
    prod = getPanelConfig()
  } finally {
    if (originalEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalEnv
  }

  expect(entry?.name, 'panel_custom name matches production element name').toBe(prod.elementName)
  expect(`/${entry?.url_path}`, 'panel_custom url_path matches production urlPath').toBe(
    prod.urlPath
  )

  // module_url must point under /local/dist and the referenced bundle must exist
  // in dist/ — the same artifact the compose file mounts. Without this, renaming
  // the bundle would leave HA serving a stale/missing file while tests still pass.
  const moduleUrl = entry?.module_url ?? ''
  const bundle = /^\/local\/dist\/(.+)$/.exec(moduleUrl)?.[1]
  expect(bundle, `module_url "${moduleUrl}" must be under /local/dist/`).toBeTruthy()
  expect(
    existsSync(new URL(`../../dist/${bundle}`, import.meta.url)),
    `built bundle dist/${bundle} referenced by module_url must exist`
  ).toBe(true)

  // The compose file must still mount ../dist at the container path module_url
  // resolves to (HA serves /local/* from /config/www/*), or HA would serve a
  // stale/missing bundle even though the file exists in dist/.
  const servedDir = moduleUrl.replace(/\/[^/]+$/, '') // /local/dist
  const containerDir = servedDir.replace(/^\/local\//, '/config/www/') // /config/www/dist
  const compose = load(
    readFileSync(new URL('../../ha/docker-compose.yml', import.meta.url), 'utf8')
  ) as { services?: { homeassistant?: { volumes?: string[] } } }
  const volumes = compose.services?.homeassistant?.volumes ?? []
  const distMount = volumes.find((v) => v.startsWith('../dist:'))
  expect(distMount, 'compose mounts ../dist into the container').toBeTruthy()
  expect(
    distMount?.startsWith(`../dist:${containerDir}`),
    `compose must mount ../dist at ${containerDir} so ${servedDir} resolves to it (found "${distMount}")`
  ).toBe(true)
})

test('panel mounts inline and connects to Home Assistant', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await openPanel(page)

  const { defined, mounted, inline, connected, stateCount } = await panelInfo(page)
  expect(defined, 'liebe-panel custom element is registered').toBe(true)
  expect(mounted, 'panel element is mounted').toBe(true)
  expect(inline, 'panel renders inline (not in an iframe)').toBe(true)
  expect(connected, 'websocket connection is established').toBe(true)
  expect(stateCount, 'demo entities are available').toBeGreaterThan(50)

  expect(errors, 'no fatal console errors').toEqual([])
})
