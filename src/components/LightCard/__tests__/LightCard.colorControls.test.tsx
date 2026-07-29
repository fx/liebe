import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HomeAssistantProvider, type HomeAssistant } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import type { HassEntity } from '~/store/entityTypes'
import type { GridItem } from '~/store/types'
import { CardItemProvider } from '../../cardItemContext'
import { LightCard } from '..'

/**
 * The colour and colour-temperature controls (docs/specs/entity-cards/options/
 * light.md — "Color temperature" and "Color").
 *
 * These run against the real `useServiceCall`, not a mock of it. Both controls
 * were written onto the guarded path rather than migrated onto it, which is the
 * reason 2a landed first — and a mocked dispatcher is exactly the thing that
 * could not show the difference.
 */

let hass: HomeAssistant

const LIGHT = 'light.living_room'
const FULL_SPAN = { width: 3, height: 2 }

function light(
  attributes: Record<string, unknown> = {},
  state = 'on',
  // The guard reopens on `last_updated` moving, so a case that needs a second
  // command admitted has to move it — changing an attribute is not enough.
  lastUpdated = '2024-01-01T00:00:00Z'
): HassEntity {
  return {
    entity_id: LIGHT,
    state,
    attributes: {
      friendly_name: 'Living Room',
      brightness: 128,
      supported_color_modes: ['color_temp', 'hs', 'rgb'],
      min_color_temp_kelvin: 2000,
      max_color_temp_kelvin: 6500,
      color_temp_kelvin: 3000,
      supported_features: 0,
      ...attributes,
    } as HassEntity['attributes'],
    last_changed: lastUpdated,
    last_updated: lastUpdated,
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

function seed(entity: HassEntity) {
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: { [entity.entity_id]: entity },
    staleEntities: new Set<string>(),
  }))
}

const placed = (config: Record<string, unknown>): GridItem => ({
  id: 'item-light',
  type: 'entity',
  entityId: LIGHT,
  x: 0,
  y: 0,
  width: 3,
  height: 2,
  config,
})

/** Rendered as `GridView` renders one — both halves of the stored config. */
function renderCard(card: ReactElement, config?: Record<string, unknown>) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        <CardItemProvider entityId={LIGHT} config={config}>
          {card}
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
}

const fullCard = (config?: Record<string, unknown>) =>
  renderCard(
    <LightCard
      entityId={LIGHT}
      tier="full"
      span={FULL_SPAN}
      item={config ? placed(config) : undefined}
    />,
    config
  )

const tempSlider = () => screen.queryByLabelText('Colour temperature')
const swatchRow = () => screen.queryByRole('group', { name: 'Light colour' })
const swatch = (name: string) => screen.getByRole('button', { name })

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
  // Process-wide pending set. Without this a later case issuing the same command
  // sees it refused, which presents as zero calls and no error.
  resetDispatchGuard()
  seed(light())
})

afterEach(() => {
  dashboardActions.resetState()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('the colour-temperature control', () => {
  it('spans the range the entity reports, not a fixed one', () => {
    seed(light({ min_color_temp_kelvin: 2200, max_color_temp_kelvin: 4000 }))

    fullCard()

    const thumb = tempSlider()!
    expect(thumb).toHaveAttribute('aria-valuemin', '2200')
    expect(thumb).toHaveAttribute('aria-valuemax', '4000')
  })

  it('sends color_temp_kelvin through the guarded path', async () => {
    fullCard()

    fireEvent.keyDown(tempSlider()!, { key: 'ArrowRight' })

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: LIGHT,
        color_temp_kelvin: 3050,
      })
    )
  })

  it('refuses the identical temperature while the first is unlanded', async () => {
    fullCard()

    fireEvent.keyDown(tempSlider()!, { key: 'ArrowRight' })
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    // Acknowledged but not landed: `last_updated` has not moved.
    fireEvent.keyDown(tempSlider()!, { key: 'ArrowRight' })

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
  })

  it('is withheld when the entity reports no usable range', () => {
    // The control cannot be given an invented span, so there is nothing to show.
    seed(light({ min_color_temp_kelvin: undefined, max_color_temp_kelvin: undefined }))

    fullCard()

    expect(tempSlider()).toBeNull()
  })

  it('is withheld from a light with no colour-temperature mode', () => {
    seed(light({ supported_color_modes: ['hs', 'rgb'] }))

    fullCard()

    expect(tempSlider()).toBeNull()
    // The colour control is unaffected — the two gate independently.
    expect(swatchRow()).not.toBeNull()
  })

  it('is withheld when the option is off', () => {
    fullCard({ showColorTempControl: false })

    expect(tempSlider()).toBeNull()
    expect(swatchRow()).not.toBeNull()
  })

  it('clamps a reported temperature that falls outside the reported range', () => {
    // The two attributes can disagree; Radix would otherwise place a thumb
    // outside its own track.
    seed(light({ color_temp_kelvin: 9000 }))

    fullCard()

    expect(tempSlider()).toHaveAttribute('aria-valuenow', '6500')
  })

  it('sits at the warm end when the bulb reports no temperature at all', () => {
    seed(light({ color_temp_kelvin: undefined }))

    fullCard()

    expect(tempSlider()).toHaveAttribute('aria-valuenow', '2000')
  })
})

describe('the colour control', () => {
  it('sends the swatch rgb_color through the guarded path', async () => {
    fullCard()

    fireEvent.click(swatch('Blue'))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: LIGHT,
        rgb_color: [0, 122, 255],
      })
    )
  })

  it('refuses the identical swatch while the first is unlanded', async () => {
    fullCard()

    fireEvent.click(swatch('Blue'))
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    fireEvent.click(swatch('Blue'))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
  })

  it('lets a different swatch through inside the same window', async () => {
    // Keyed per command, so choosing again is a user changing their mind.
    fullCard()

    fireEvent.click(swatch('Blue'))
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    fireEvent.click(swatch('Red'))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenLastCalledWith('light', 'turn_on', {
        entity_id: LIGHT,
        rgb_color: [255, 0, 0],
      })
    )
  })

  it('marks the swatch the bulb actually reports as selected', () => {
    seed(light({ rgb_color: [0, 122, 255] }))

    fullCard()

    expect(swatch('Blue')).toHaveAttribute('aria-pressed', 'true')
    expect(swatch('Red')).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks nothing selected when the bulb reports only a derived colour', () => {
    /*
     * `hs_color` is enough to TINT the card but not to claim a swatch is what
     * the light is set to: the payload behind that swatch would not reproduce
     * the current state exactly, so lighting it up would be a false claim about
     * a control the user never touched.
     */
    seed(light({ rgb_color: undefined, hs_color: [210, 100] }))

    fullCard()

    for (const name of ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Violet']) {
      expect(swatch(name)).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('adds the recent slot only once a colour has been picked here', async () => {
    fullCard()

    const before = swatchRow()!.querySelectorAll('button')
    expect(before).toHaveLength(6)

    fireEvent.click(swatch('Violet'))

    await waitFor(() => expect(swatchRow()!.querySelectorAll('button')).toHaveLength(7))
    expect(screen.getByRole('button', { name: 'Last used, rgb(148, 0, 211)' })).toBeTruthy()
  })

  it('re-sends the recent colour when its slot is tapped', async () => {
    /*
     * The slot is a real control, not a swatch-shaped label. Picking Violet then
     * Blue leaves Blue in the slot; tapping it is a fresh request for Blue,
     * which the guard refuses only because Blue is the command still in flight.
     * So the assertion is on the *last payload*, which is what shows the tap was
     * routed at all.
     */
    fullCard()

    fireEvent.click(swatch('Violet'))
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    // The entity moves, so the next command is admitted.
    seed(light({ rgb_color: [148, 0, 211] }, 'on', '2024-01-01T00:01:00Z'))
    fireEvent.click(swatch('Blue'))
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(2))

    seed(light({ rgb_color: [0, 122, 255] }, 'on', '2024-01-01T00:02:00Z'))
    fireEvent.click(screen.getByRole('button', { name: 'Last used, rgb(0, 122, 255)' }))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(3))
    expect(hass.callService).toHaveBeenLastCalledWith('light', 'turn_on', {
      entity_id: LIGHT,
      rgb_color: [0, 122, 255],
    })
  })

  it('is withheld from a light with no colour mode', () => {
    seed(light({ supported_color_modes: ['color_temp'] }))

    fullCard()

    expect(swatchRow()).toBeNull()
    expect(tempSlider()).not.toBeNull()
  })

  it('is withheld when the option is off', () => {
    fullCard({ showColorControl: false })

    expect(swatchRow()).toBeNull()
    expect(tempSlider()).not.toBeNull()
  })
})

describe('where the two controls appear at all', () => {
  it.each([
    ['glance', { width: 1, height: 1 }],
    ['row', { width: 2, height: 1 }],
    ['tall', { width: 1, height: 3 }],
  ] as const)('keeps both off the %s tier', (tier, span) => {
    // `full` only, per the tier table. Content that does not fit is omitted
    // rather than clipped.
    renderCard(<LightCard entityId={LIGHT} tier={tier} span={span} />)

    expect(tempSlider()).toBeNull()
    expect(swatchRow()).toBeNull()
  })

  it('keeps both off a light that is off', () => {
    // Setting a colour would turn the light on as a side effect of a control
    // that does not look like a switch; the tile's own tap is what does that.
    seed(light({}, 'off'))

    fullCard()

    expect(tempSlider()).toBeNull()
    expect(swatchRow()).toBeNull()
  })

  it('keeps both out of edit mode, where the tile is being arranged', () => {
    dashboardActions.setMode('edit')

    fullCard()

    expect(tempSlider()).toBeNull()
    expect(swatchRow()).toBeNull()
  })

  it('shows both by default on a supported light, with no stored config', () => {
    fullCard()

    expect(tempSlider()).not.toBeNull()
    expect(swatchRow()).not.toBeNull()
  })
})
