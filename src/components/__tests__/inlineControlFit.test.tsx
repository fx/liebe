import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { InputTextCard } from '../InputTextCard'
import { InputDateTimeCard } from '../InputDateTimeCard'
import { CardItemProvider } from '../cardItemContext'
import { entityStore } from '~/store/entityStore'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The inline inputs a one-cell-wide tier cannot hold
 * (docs/specs/design-system/index.md — "Cross-axis fit"; change 0042 PR 4).
 *
 * `input_text`'s field and `input_datetime`'s inputs are the two parts PR 4
 * measured as already clipped rather than latently so: 100–200px of inline
 * minimum width, in a `tall` tile whose content region is 35px on a 12-column
 * desktop grid. The tile's own `overflow: hidden` cropped them, which is the
 * clip the omit-never-clip rule forbids. Both are bounded by their content on
 * that axis — a field has a preferred width of its own — so they are in the
 * class the contract omits rather than makes flexible.
 *
 * Two things are asserted together because they are one decision: the input
 * goes, AND the tile's tap falls back to `more-info`. Omitting alone would take
 * away the last way to operate the helper, which the floors are explicitly not
 * allowed to do — "these floors outrank the no-last-control rule, and do not
 * suspend it".
 *
 * What jsdom cannot see is the geometry that motivates it: no stylesheet is
 * applied and nothing is laid out, so a 100px readout in a 35px region measures
 * the same either way. `tests/e2e/tall-fixed-parts-fit.spec.ts` is the half that
 * measures.
 */
describe('the text and datetime helpers at a tier that cannot hold their input', () => {
  let hass: HomeAssistant

  const seed = (entity: HassEntity) => {
    entityStore.setState((state) => ({
      ...state,
      entities: { ...state.entities, [entity.entity_id]: entity },
      isConnected: true,
      isInitialLoading: false,
    }))
  }

  const entity = (
    entityId: string,
    state: string,
    attributes: Record<string, unknown>
  ): HassEntity => ({
    entity_id: entityId,
    state,
    attributes,
    last_changed: '2026-07-30T10:00:00Z',
    last_updated: '2026-07-30T10:00:00Z',
    context: { id: 'seed', parent_id: null, user_id: null },
  })

  function renderCard(ui: React.ReactElement) {
    return render(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <CardItemProvider config={{}}>{ui}</CardItemProvider>
        </HomeAssistantProvider>
      </Theme>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    hass = createMockHomeAssistant()
    seed(entity('input_text.note', 'hello', { friendly_name: 'Note', mode: 'text' }))
    seed(
      entity('input_datetime.alarm', '2026-07-30 07:00:00', {
        friendly_name: 'Alarm',
        has_date: true,
        has_time: true,
      })
    )
  })

  it('renders no text field at `tall`, and no readout for the tile to crop', () => {
    renderCard(<InputTextCard entityId="input_text.note" tier="tall" />)

    expect(screen.queryByLabelText('Edit value')).not.toBeInTheDocument()
    /*
     * The readout goes with the button, and that is the point rather than a
     * side effect: it is a 100px `Box`, so leaving it behind would keep exactly
     * the part the tile was cropping while removing the one that fits.
     */
    expect(screen.queryByText('hello')).not.toBeInTheDocument()
    // The tile is still a tile, and still says which entity it is.
    expect(screen.getByText('Note')).toBeInTheDocument()
  })

  it('renders no datetime input at `tall` either, on a worse measurement', () => {
    // 120px readout, 200px edit field — the widest fixed inline sizes on any
    // card, in the tier with the least room.
    renderCard(<InputDateTimeCard entityId="input_datetime.alarm" tier="tall" />)

    expect(screen.queryByLabelText('Edit value')).not.toBeInTheDocument()
    expect(screen.getByText('Alarm')).toBeInTheDocument()
  })

  it('keeps both at `row` and `full`, which are never one cell wide', () => {
    /*
     * The tier is the whole condition, so this is what says so: the same card,
     * the same helper, the same field — kept wherever the tile is at least two
     * columns. A change that omitted the input outright would pass every
     * assertion above and fail here.
     */
    for (const tier of ['row', 'full'] as const) {
      const text = renderCard(<InputTextCard entityId="input_text.note" tier={tier} />)
      expect(screen.getByLabelText('Edit value')).toBeInTheDocument()
      expect(screen.getByText('hello')).toBeInTheDocument()
      text.unmount()

      const datetime = renderCard(<InputDateTimeCard entityId="input_datetime.alarm" tier={tier} />)
      expect(screen.getByLabelText('Edit value')).toBeInTheDocument()
      datetime.unmount()
    }
  })

  it('declines the edit tap at `tall`, and passes the tile to the dialog instead', () => {
    /*
     * The half that keeps the entity operable, asserted on the card's own side
     * of it. `input_text`'s tap focuses the field, entering edit state — with no
     * field there is nothing to focus, so the card stops claiming the tap and
     * declares `more-info` instead, exactly as it does at `glance` where the
     * same reasoning has always applied
     * (docs/specs/entity-cards/options/input-helpers.md — "Primary action").
     *
     * What is checked here is that the tap no longer enters edit state, which is
     * this card's behaviour. That `defaultAction="more-info"` then opens the
     * detail dialog is the shell's, and is pinned in
     * `GridCard.actions.test.tsx` — asserting it again through a card would be
     * testing the shell twice and this card not at all.
     */
    renderCard(<InputTextCard entityId="input_text.note" tier="tall" />)
    const tile = document.querySelector('.liebe-card')
    expect(tile, 'the card should have rendered a tile').not.toBeNull()
    fireEvent.click(tile!)

    expect(
      screen.queryByLabelText('Value'),
      'a tall tile has no field to enter edit state on'
    ).not.toBeInTheDocument()
  })

  it('keeps the edit tap at the tiers that render a field', () => {
    // The negative half, and what makes the assertion above about the tier
    // rather than about the tap being broken everywhere.
    renderCard(<InputTextCard entityId="input_text.note" tier="row" />)
    const tile = document.querySelector('.liebe-card')
    fireEvent.click(tile!)

    expect(screen.getByLabelText('Value')).toBeInTheDocument()
  })
})
