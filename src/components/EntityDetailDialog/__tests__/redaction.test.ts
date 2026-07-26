import { describe, it, expect } from 'vitest'
import {
  REDACTED_PLACEHOLDER,
  holdsSecretState,
  redactState,
  redactedAttributes,
  secretValueOf,
} from '../redaction'
import { createInputTextEntity, createSensorEntity } from '~/test/fixtures'
import type { HassEntity } from '~/store/entityTypes'

/**
 * Redaction at the unit level. The dialog's own tests prove the two surfaces
 * are wired to this; these prove the rules themselves, including the shapes an
 * attribute value can arrive in.
 */
describe('detail-dialog redaction', () => {
  const secret = 'hunter2-correct-horse'
  const passwordHelper = (overrides: Partial<HassEntity> = {}): HassEntity => ({
    ...createInputTextEntity({
      entity_id: 'input_text.wifi_password',
      state: secret,
      attributes: { friendly_name: 'Wifi Password', mode: 'password' },
    }),
    ...overrides,
  })

  it('recognises a password helper by its mode, whatever domain publishes it', () => {
    expect(holdsSecretState(passwordHelper())).toBe(true)
    // HA's `text` domain publishes the same `mode: password`.
    expect(holdsSecretState({ ...passwordHelper(), entity_id: 'text.vault_code' })).toBe(true)
    expect(holdsSecretState(createInputTextEntity())).toBe(false)
    expect(holdsSecretState(createSensorEntity())).toBe(false)
  })

  it.each(['unavailable', 'unknown', ''])(
    'treats %o as a lifecycle state, not a secret',
    (state) => {
      const entity = passwordHelper({ state })
      expect(secretValueOf(entity)).toBeUndefined()
      expect(redactState(entity)).toEqual({ value: state, redacted: false })
    }
  )

  it('masks the state of a password helper that is publishing a value', () => {
    expect(redactState(passwordHelper())).toEqual({
      value: REDACTED_PLACEHOLDER,
      redacted: true,
    })
  })

  it('leaves an ordinary entity’s state alone', () => {
    expect(redactState(createSensorEntity())).toEqual({ value: '21.4', redacted: false })
  })

  it('masks any attribute carrying the secret, under whatever key', () => {
    const attributes = redactedAttributes(
      passwordHelper({
        attributes: {
          friendly_name: 'Wifi Password',
          mode: 'password',
          last_value: secret,
          share_url: `https://example.invalid/join?key=${secret}`,
          max: 255,
        },
      })
    )

    expect(attributes).toContainEqual({
      key: 'last_value',
      value: REDACTED_PLACEHOLDER,
      redacted: true,
    })
    expect(attributes).toContainEqual({
      key: 'share_url',
      value: REDACTED_PLACEHOLDER,
      redacted: true,
    })
    // Unrelated attributes stay readable — redaction is per value, not a blanket
    // blackout of the entity.
    expect(attributes).toContainEqual({ key: 'max', value: '255', redacted: false })
  })

  it.each([
    'password',
    'passwd',
    'passphrase',
    'api_key',
    'apiKey',
    'access_token',
    'client_secret',
    'private_key',
    'credentials',
  ])('masks the credential-named attribute %o on any entity', (key) => {
    const attributes = redactedAttributes(
      createSensorEntity({ attributes: { friendly_name: 'T', [key]: 'abc123' } })
    )

    expect(attributes).toContainEqual({ key, value: REDACTED_PLACEHOLDER, redacted: true })
  })

  it('masks a credential that reappears under an innocent key', () => {
    // A camera publishes its bearer token twice: as `access_token`, and inside
    // `entity_picture` as a query parameter. Masking only the credential-named
    // row would hand the same token out on the line below it.
    const token = 'f4c9e2b7a1'
    const attributes = redactedAttributes(
      createSensorEntity({
        entity_id: 'camera.driveway',
        attributes: {
          friendly_name: 'Driveway',
          access_token: token,
          entity_picture: `/api/camera_proxy/camera.driveway?token=${token}`,
        },
      })
    )

    expect(attributes).toContainEqual({
      key: 'entity_picture',
      value: REDACTED_PLACEHOLDER,
      redacted: true,
    })
    expect(attributes.map(({ value }) => value).join(' ')).not.toContain(token)
  })

  it('masks a credential nested inside an attribute, and its echo elsewhere', () => {
    // A row rendered as JSON can carry a credential under a key of its own,
    // while the row's key names nothing secret. That row must be masked, and so
    // must anything else repeating the nested value.
    const token = 'a91ffe0c22'
    const attributes = redactedAttributes(
      createSensorEntity({
        attributes: {
          friendly_name: 'T',
          metadata: { provider: 'demo', access_token: token },
          stream_url: `https://example.invalid/live?token=${token}`,
        },
      })
    )

    expect(attributes).toContainEqual({
      key: 'metadata',
      value: REDACTED_PLACEHOLDER,
      redacted: true,
    })
    expect(attributes).toContainEqual({
      key: 'stream_url',
      value: REDACTED_PLACEHOLDER,
      redacted: true,
    })
    expect(attributes.map(({ value }) => value).join(' ')).not.toContain(token)
  })

  it('masks a credential nested inside a list, whatever type it is', () => {
    // Collected as a string when it is one; caught structurally when it is not,
    // because a numeric secret cannot be searched for without masking every
    // numeric row on the entity.
    const attributes = redactedAttributes(
      createSensorEntity({
        attributes: {
          friendly_name: 'T',
          sessions: [{ api_key: 'k-1' }, { api_key: 90210 }],
          note: 'uses k-1 for auth',
          count: 90210,
        },
      })
    )

    expect(attributes).toContainEqual({
      key: 'sessions',
      value: REDACTED_PLACEHOLDER,
      redacted: true,
    })
    expect(attributes).toContainEqual({ key: 'note', value: REDACTED_PLACEHOLDER, redacted: true })
    // The numeric secret is not searched for, so an unrelated number survives.
    expect(attributes).toContainEqual({ key: 'count', value: '90210', redacted: false })
  })

  it('recognises a secret carried by an attribute the dialog does not list', () => {
    // `_`-prefixed keys are Liebe's own bookkeeping and never rendered, but a
    // value hiding there is still the same value when another row repeats it.
    const attributes = redactedAttributes(
      createSensorEntity({
        attributes: {
          friendly_name: 'T',
          _internal: { access_token: 'z-99' },
          hint: 'token is z-99',
        },
      })
    )

    expect(attributes.map(({ key }) => key)).not.toContain('_internal')
    expect(attributes).toContainEqual({ key: 'hint', value: REDACTED_PLACEHOLDER, redacted: true })
  })

  it('does not treat an empty credential value as a secret matching everything', () => {
    const attributes = redactedAttributes(
      createSensorEntity({
        attributes: { friendly_name: 'T', access_token: '', device_class: 'temperature' },
      })
    )

    expect(attributes).toContainEqual({
      key: 'device_class',
      value: 'temperature',
      redacted: false,
    })
  })

  it('omits the friendly name and Liebe’s own bookkeeping', () => {
    const keys = redactedAttributes(
      createSensorEntity({ attributes: { friendly_name: 'T', _stale: true, device_class: 'x' } })
    ).map(({ key }) => key)

    expect(keys).not.toContain('friendly_name')
    expect(keys).not.toContain('_stale')
    expect(keys).toContain('device_class')
  })

  it.each([
    ['a string', 'plain', 'plain'],
    ['a number', 12.5, '12.5'],
    ['a boolean', false, 'false'],
    ['null', null, ''],
    ['undefined', undefined, ''],
    ['a list', [1, 'two'], '[1,"two"]'],
    ['an object', { a: 1 }, '{"a":1}'],
  ])('renders %s attribute value', (_what, raw, expected) => {
    const attributes = redactedAttributes(
      createSensorEntity({ attributes: { friendly_name: 'T', sample: raw } })
    )

    expect(attributes).toContainEqual({ key: 'sample', value: expected, redacted: false })
  })
})
