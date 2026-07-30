import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { InputTextCard } from '../InputTextCard'
import { InputDateTimeCard } from '../InputDateTimeCard'
import { CardItemProvider } from '../cardItemContext'
import { dashboardActions } from '~/store'
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

  function renderCard(ui: ReactElement) {
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
    // View mode explicitly: the detail dialog is suppressed in edit mode, so a
    // dialog assertion below would pass or fail on the store's leftover state
    // rather than on the card.
    dashboardActions.resetState()
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

  it('carries no fixed inline minimum on the tiers that do render an input', () => {
    /*
     * The other half of PR 4's `input_text` change, and the half that is NOT
     * about `tall`: the field's 150px minimum and the readout's 100px one
     * overflowed a two-column `row` region too — 113px on the same grid — so
     * they were cropped at a tier nobody had measured. Both are now flexible,
     * which is the treatment the contract asks of a part that CAN be sized
     * down: "it takes the content region's width, and its geometry token names
     * the size it prefers rather than the size it always has".
     *
     * Inline styles are in the DOM, so this is one of the few geometry claims
     * jsdom can actually hold — it is reading the declaration, not a layout.
     */
    renderCard(<InputTextCard entityId="input_text.note" tier="row" />)

    // The styled box is the readout's parent: `getByText` finds the `Text`
    // inside it, and the sizing lives on the `Box` that wraps it.
    const readout = screen.getByText('hello').parentElement!
    expect(
      readout.style.minWidth,
      `the readout must not pin a POSITIVE inline minimum, got "${readout.style.minWidth}"`
    ).not.toMatch(/[1-9]\d*px/)
    // …and it truncates instead of pushing past the tile, which is what makes
    // dropping the minimum safe rather than merely smaller.
    expect(readout.style.textOverflow).toBe('ellipsis')

    // The edit field takes the room it is given and shrinks with it.
    fireEvent.click(screen.getByLabelText('Edit value'))
    // Radix puts the accessible name on the `<input>` and the sizing on the
    // root it wraps it in, so the style lives one level up — the same shape as
    // the readout above.
    const field = screen.getByLabelText('Value').parentElement!
    expect(
      field.style.minWidth,
      `the field must not pin a POSITIVE inline minimum, got "${field.style.minWidth}"`
    ).not.toMatch(/[1-9]\d*px/)
    expect(field.style.flex, 'the field must take the room the shape gives it').not.toBe('')
  })

  /*
   * THE TAP IS NOT ASSERTED HERE, and the omission is deliberate rather than a
   * gap — established twice, by two mutation probes.
   *
   * The negative form ("no edit state after a tap") passes on the broken card:
   * with the control slot gone there is nothing to enter edit state either way,
   * so it survives a handler that has stopped returning `'more-info'`. The
   * positive form ("the dialog opens") cannot be written here either — the
   * shell's gesture layer does not resolve a click into an action in jsdom, so
   * the assertion fails on correct code.
   *
   * `tests/e2e/tall-fixed-parts-fit.spec.ts` asserts it where it can fail: a
   * real click, on a tile carrying an explicit `tapAction: toggle`, opening a
   * real dialog. Writing a jsdom stand-in here would have recorded a green that
   * establishes nothing, which is the outcome the seventh probe rule exists to
   * refuse.
   */
})
