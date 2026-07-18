#!/usr/bin/env node
// Onboard (or log into) the dockerized Home Assistant e2e instance and emit
// the credentials the Playwright suite needs:
//   - accessToken: a bearer token for REST state mutation in tests
//   - code + state: an unused auth code for the panel's `?auth_callback=1` URL,
//     which the HA frontend exchanges itself on load
//
// Zero dependencies (Node 18+ global fetch). Idempotent: on a fresh instance it
// runs the full onboarding flow; on a partially-onboarded instance it finishes
// the remaining steps; on a fully-onboarded (persisted) instance it falls back
// to a password login — so it works in every state.
//
// Usable two ways:
//   1. CLI:    `node scripts/onboard.mjs`  -> prints the JSON result to stdout.
//   2. Import: the Playwright globalSetup and helpers import the functions below
//              to reuse the exact same auth flow.
//
// Diagnostics go to stderr; the CLI's JSON result is the only thing on stdout.

// The URL used for server-to-server requests (from the host or CI runner).
export const HASS_URL = process.env.HASS_URL || 'http://127.0.0.1:8123'
// The origin the *browser* uses. Auth codes are bound to this client_id, so it
// must match the origin Playwright loads the panel from.
export const BROWSER_URL = process.env.HASS_BROWSER_URL || 'http://localhost:8123'
export const CLIENT_ID = `${BROWSER_URL}/`
const REDIRECT_URI = `${BROWSER_URL}/liebe?auth_callback=1`

const NAME = process.env.HASS_NAME || 'Dev'
const USERNAME = process.env.HASS_USER || 'dev'
const PASSWORD = process.env.HASS_PASSWORD || 'dev'
const LANGUAGE = process.env.HASS_LANGUAGE || 'en'

const log = (...args) => console.error('[onboard]', ...args)

async function readBody(res) {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function postJson(path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${HASS_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  return { res, data: await readBody(res) }
}

async function getSteps() {
  const res = await fetch(`${HASS_URL}/api/onboarding`)
  return readBody(res)
}

// Exchange an authorization code for an access token.
async function tokenFromCode(code) {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: CLIENT_ID,
  })
  const res = await fetch(`${HASS_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  const data = await readBody(res)
  if (!res.ok || !data.access_token) {
    throw new Error(`token exchange failed (${res.status}): ${JSON.stringify(data)}`)
  }
  return data.access_token
}

// Drive the username/password login flow and return a fresh authorization code.
export async function loginForCode() {
  const start = await postJson('/auth/login_flow', {
    client_id: CLIENT_ID,
    handler: ['homeassistant', null],
    redirect_uri: REDIRECT_URI,
  })
  const flowId = start.data.flow_id
  if (!flowId) throw new Error(`login_flow start failed: ${JSON.stringify(start.data)}`)

  const step = await postJson(`/auth/login_flow/${flowId}`, {
    client_id: CLIENT_ID,
    username: USERNAME,
    password: PASSWORD,
  })
  if (step.data.type !== 'create_entry' || !step.data.result) {
    throw new Error(`login failed: ${JSON.stringify(step.data)}`)
  }
  return step.data.result
}

// A complete, valid core configuration. HA's onboarding requires this step to
// finish before the frontend leaves /onboarding; posting an empty body relies on
// undocumented defaults, so send explicit deterministic values instead.
const CORE_CONFIG = {
  currency: 'USD',
  country: 'US',
  language: LANGUAGE,
  time_zone: 'UTC',
  unit_system: 'metric',
  latitude: 0,
  longitude: 0,
  elevation: 0,
}

// Create the admin user and exchange the returned code for an access token.
async function createUserAndToken() {
  log('creating user', USERNAME)
  const user = await postJson('/api/onboarding/users', {
    client_id: CLIENT_ID,
    name: NAME,
    username: USERNAME,
    password: PASSWORD,
    language: LANGUAGE,
  })
  if (!user.res.ok || !user.data.auth_code) {
    throw new Error(`user creation failed (${user.res.status}): ${JSON.stringify(user.data)}`)
  }
  return tokenFromCode(user.data.auth_code)
}

// POST an onboarding step and fail loudly on any non-2xx response, so an
// incomplete onboarding surfaces immediately instead of silently letting the
// panel time out later.
async function completeStep(path, body, token) {
  const { res, data } = await postJson(path, body, token)
  log(`${path}:`, res.status)
  if (!res.ok) {
    throw new Error(`onboarding step ${path} failed (${res.status}): ${JSON.stringify(data)}`)
  }
}

// Ensure the instance is fully onboarded and return a valid access token. Safe
// to call repeatedly and against a partially-onboarded instance: it creates the
// user only when needed, logs in otherwise, and completes any step still marked
// not-done (skipping already-completed steps, which would otherwise 4xx).
export async function ensureOnboarded() {
  let steps = await getSteps()
  const isDone = (name) => Array.isArray(steps) && steps.find((s) => s.step === name)?.done === true

  const token = isDone('user')
    ? await tokenFromCode(await loginForCode())
    : await createUserAndToken()

  // Re-read: creating the user flips its step (and may auto-complete others).
  steps = await getSteps()
  if (!isDone('core_config')) {
    await completeStep('/api/onboarding/core_config', CORE_CONFIG, token)
  }
  if (!isDone('analytics')) {
    await completeStep('/api/onboarding/analytics', {}, token)
  }
  if (!isDone('integration')) {
    await completeStep(
      '/api/onboarding/integration',
      { client_id: CLIENT_ID, redirect_uri: REDIRECT_URI },
      token
    )
  }

  return token
}

// Base64-encoded state the HA frontend reads to learn its own URL + client_id.
export function buildState() {
  return Buffer.from(JSON.stringify({ hassUrl: BROWSER_URL, clientId: CLIENT_ID })).toString(
    'base64'
  )
}

// Build the panel URL the browser navigates to. `code` must be a fresh, unused
// authorization code (auth codes are single-use).
export function buildPanelUrl(code) {
  const state = buildState()
  return `${BROWSER_URL}/liebe?auth_callback=1&code=${encodeURIComponent(
    code
  )}&state=${encodeURIComponent(state)}`
}

// Ensure onboarding, then mint the full credential bundle. Each call returns a
// SEPARATE, unused panel code distinct from the one spent on the access token.
export async function getCredentials() {
  const accessToken = await ensureOnboarded()
  const code = await loginForCode()
  return {
    accessToken,
    code,
    state: buildState(),
    hassUrl: BROWSER_URL,
    clientId: CLIENT_ID,
    panelUrl: buildPanelUrl(code),
  }
}

async function main() {
  const result = await getCredentials()
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

// Run main only when executed directly (not when imported).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    log('FAILED:', err.message)
    process.exit(1)
  })
}
