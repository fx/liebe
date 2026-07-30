import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { InputDateTimeCard, formatDatetimeDisplayValue } from '../InputDateTimeCard'
import { useEntity } from '../../hooks/useEntity'
import { useServiceCall } from '../../hooks/useServiceCall'
import type { HassEntity } from '~/store/entityTypes'

vi.mock('../../hooks/useEntity', () => ({ useEntity: vi.fn() }))
vi.mock('../../hooks/useServiceCall', () => ({ useServiceCall: vi.fn() }))

/**
 * The date-only `input_datetime` defect and its fix
 * (docs/changes/0037-card-state-and-capability-correctness.md): Home Assistant
 * publishes a date-only state as `YYYY-MM-DD`, and ECMAScript parses that form
 * as **UTC midnight**, so every viewer behind UTC saw the day before the one
 * their helper is set to.
 *
 * The zone is pinned rather than inherited because the defect is **invisible at
 * UTC** — this repo's runner default — where the wrong reading and the right one
 * print the same day. A test taking the ambient zone would pass against the
 * unfixed card, which is worth less than no test at all.
 */
const ZONE_WEST_OF_UTC = 'America/Los_Angeles'

let ambientZone: string | undefined

beforeAll(() => {
  ambientZone = process.env.TZ
  process.env.TZ = ZONE_WEST_OF_UTC
})

afterAll(() => {
  // Restored because `process.env` outlives the file inside a vitest worker, and
  // a zone left behind would silently retune every suite that runs after it.
  if (ambientZone === undefined) delete process.env.TZ
  else process.env.TZ = ambientZone
})

const DATE_ONLY = { has_date: true, has_time: false }
const COMBINED = { has_date: true, has_time: true }

/** What the defect printed: the same string read as an instant in UTC. */
const asUtcInstant = (state: string) => new Date(state).toLocaleDateString()

/**
 * The locale every expectation below is formatted through — the same one the
 * card's bare `toLocaleDateString()` resolves, captured so the assertions name
 * it rather than assume it.
 *
 * It cannot be pinned the way the zone above is: Node fixes the default `Intl`
 * locale at process startup, so assigning `process.env.LANG` mid-run does
 * nothing (`TZ` is the exception, not the rule). The assertions are therefore
 * made locale-agnostic by construction instead — a literal `'24'` would hold
 * only where the ambient locale writes Western digits on a Gregorian calendar,
 * while the token this reads out of the resolved locale's own date format holds
 * in any of them, and still says what it is there to say: the **day the card
 * rendered**.
 *
 * The token comes from `formatToParts` on the *same* default format
 * `toLocaleDateString()` uses, rather than from a day-only or year-only format:
 * a year-only format in the Buddhist calendar renders `พ.ศ. 2569`, whose era
 * prefix is not a substring of the `1/1/2569` the card shows, so the narrower
 * format fails on a locale the card handles correctly.
 */
const LOCALE = Intl.DateTimeFormat().resolvedOptions().locale

const datePart = (date: Date, type: 'day' | 'year') => {
  const part = new Intl.DateTimeFormat(LOCALE).formatToParts(date).find((p) => p.type === type)
  // Throw rather than fall back: an absent part would make a `toContain` pass on
  // the empty string and assert nothing at all.
  if (!part) throw new Error(`the ${LOCALE} default date format carries no ${type}`)
  return part.value
}

const createEntity = (state: string, shape: Record<string, boolean>): HassEntity => ({
  entity_id: 'input_datetime.holiday_start',
  state,
  attributes: { friendly_name: 'Holiday Start', ...shape },
  last_changed: '2026-01-01T00:00:00Z',
  last_updated: '2026-01-01T00:00:00Z',
  context: { id: 'test-id', parent_id: null, user_id: null },
})

function mockEntity(state: string, shape: Record<string, boolean> = DATE_ONLY) {
  vi.mocked(useEntity).mockReturnValue({
    entity: createEntity(state, shape),
    isConnected: true,
    isLoading: false,
    isStale: false,
  } as unknown as ReturnType<typeof useEntity>)
}

describe('date-only input_datetime, west of UTC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useServiceCall).mockReturnValue({
      setValue: vi.fn(),
      loading: false,
      error: null,
    } as unknown as ReturnType<typeof useServiceCall>)
  })

  it('runs behind UTC, so a UTC-parsed date really would show the day before', () => {
    // The pin's own guard. Without it a zone assignment that failed to take
    // would leave every assertion below vacuously true — the shape of a passing
    // probe that proves nothing (AGENTS.md — "Probing a test").
    expect(new Date(2026, 11, 24).getTimezoneOffset()).toBeGreaterThan(0)
    expect(asUtcInstant('2026-12-24')).toBe(new Date(2026, 11, 23).toLocaleDateString())
  })

  it('formats the calendar date the helper published', () => {
    const shown = formatDatetimeDisplayValue('2026-12-24', DATE_ONLY)

    expect(shown).toBe(new Date(2026, 11, 24).toLocaleDateString())
    expect(shown).not.toBe(asUtcInstant('2026-12-24'))
    // The day itself, not just a string that differs from the wrong one: a
    // formatter that dropped the day entirely would satisfy both lines above.
    expect(shown).toContain(datePart(new Date(2026, 11, 24), 'day'))
    expect(shown).not.toContain(datePart(new Date(2026, 11, 23), 'day'))
  })

  it('does not roll a New Year date back into the previous year', () => {
    const shown = formatDatetimeDisplayValue('2026-01-01', DATE_ONLY)

    expect(shown).toBe(new Date(2026, 0, 1).toLocaleDateString())
    expect(shown).toContain(datePart(new Date(2026, 0, 1), 'year'))
    expect(shown).not.toContain(datePart(new Date(2025, 11, 31), 'year'))
  })

  it('reads the date half when a date-only helper publishes a time as well', () => {
    // Not a shape Home Assistant produces, but the input translation already
    // takes the matching half of such a state, and the readout agrees with it.
    expect(formatDatetimeDisplayValue('2026-12-24 06:30:00', DATE_ONLY)).toBe(
      new Date(2026, 11, 24).toLocaleDateString()
    )
  })

  it('shows a state that is no calendar date verbatim, as it always has', () => {
    expect(formatDatetimeDisplayValue('invalid-date', DATE_ONLY)).toBe('invalid-date')
    // `2026-02-31` parses digit-wise and is still not a day; a rolled-forward
    // March date would be a value the helper never held.
    expect(formatDatetimeDisplayValue('2026-02-31', DATE_ONLY)).toBe('2026-02-31')
  })

  it('leaves a combined helper on its local reading', () => {
    // The space-separated form HA publishes for `has_time: true` carries a time
    // component, so it parses as local already — the fix must not disturb it.
    expect(formatDatetimeDisplayValue('2026-12-24 06:30:00', COMBINED)).toBe(
      new Date(2026, 11, 24, 6, 30).toLocaleString()
    )
  })

  it('renders the published day on the glance tile', () => {
    mockEntity('2026-12-24')
    render(
      <Theme>
        <InputDateTimeCard entityId="input_datetime.holiday_start" tier="glance" />
      </Theme>
    )

    expect(screen.getByText(new Date(2026, 11, 24).toLocaleDateString())).toBeInTheDocument()
    expect(screen.queryByText(asUtcInstant('2026-12-24'))).not.toBeInTheDocument()
  })

  it('renders the published day in the readout beside the control', () => {
    mockEntity('2026-12-24')
    render(
      <Theme>
        <InputDateTimeCard entityId="input_datetime.holiday_start" tier="row" />
      </Theme>
    )

    expect(screen.getByText(new Date(2026, 11, 24).toLocaleDateString())).toBeInTheDocument()
    expect(screen.queryByText(asUtcInstant('2026-12-24'))).not.toBeInTheDocument()
  })
})
