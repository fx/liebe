import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions, dashboardStore } from '~/store'
import type { GridItem } from '~/store/types'
import type { HassEntity } from '~/store/entityTypes'
import { CardItemProvider } from '../../cardItemContext'
import { createBinarySensorEntity } from '~/test/fixtures'
import { BinarySensorCard } from '..'

/**
 * The binary sensor card end to end (change 0018 PR 2).
 *
 * The resolver's own rules are unit-tested in `presentation.test.ts`; what is
 * asserted here is that they reach the DOM through the shell — in particular
 * the half of the hazard rule that is NOT this card's. The card resolves glyph,
 * label and tint past its own options; `readCardDisplay`'s danger floor takes
 * back the universal ones. Only a rendered card exercises both halves, and only
 * both halves together make the guarantee the option doc states.
 */

const ENTITY = 'binary_sensor.front_door'

function seed(entity: HassEntity) {
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: { [entity.entity_id]: entity },
  }))
}

function renderCard(ui: ReactElement, config?: Record<string, unknown>) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={createMockHomeAssistant()}>
        <CardItemProvider entityId={ENTITY} config={config}>
          {ui}
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
}

const card = () => document.querySelector('.liebe-card') as HTMLElement
const stateLine = () => document.querySelector('.liebe-state')
const icon = () => document.querySelector('.liebe-icon')

beforeEach(() => {
  dashboardActions.resetState()
})

describe('BinarySensorCard labels', () => {
  it('names the states of a device class', () => {
    seed(createBinarySensorEntity({ state: 'on' }))
    renderCard(<BinarySensorCard entityId={ENTITY} />)

    expect(stateLine()).toHaveTextContent('Open')
  })

  it('renders a configured label instead', () => {
    seed(createBinarySensorEntity({ state: 'on' }))
    renderCard(<BinarySensorCard entityId={ENTITY} />, { onLabel: 'Ajar' })

    expect(stateLine()).toHaveTextContent('Ajar')
  })

  it('drops the state line under hideState like every other card', () => {
    seed(createBinarySensorEntity({ state: 'on' }))
    renderCard(<BinarySensorCard entityId={ENTITY} />, { hideState: true })

    expect(stateLine()).toBeNull()
  })
})

describe('BinarySensorCard invert', () => {
  it('renders the off presentation for a sensor wired backwards', () => {
    // The option doc's scenario: hardware that reports `on` while the door is
    // physically closed.
    seed(createBinarySensorEntity({ state: 'on' }))
    renderCard(<BinarySensorCard entityId={ENTITY} />, { invert: true })

    expect(stateLine()).toHaveTextContent('Closed')
    expect(card()).not.toHaveAttribute('data-active')
    expect(icon()).not.toHaveAttribute('data-active')
  })

  it('renders the on presentation for an off sensor', () => {
    seed(createBinarySensorEntity({ state: 'off' }))
    renderCard(<BinarySensorCard entityId={ENTITY} />, { invert: true })

    expect(stateLine()).toHaveTextContent('Open')
    expect(icon()).toHaveAttribute('data-active', 'true')
  })

  it('leaves the raw state alone for everything else', () => {
    // Presentation-only: `more-info` and any automation-facing surface still
    // see `on`, which is why the entity in the store is untouched.
    seed(createBinarySensorEntity({ state: 'on' }))
    renderCard(<BinarySensorCard entityId={ENTITY} />, { invert: true })

    expect(entityStore.state.entities[ENTITY].state).toBe('on')
  })
})

describe('BinarySensorCard active colour', () => {
  function renderClass(deviceClass: string | undefined, state = 'on') {
    seed(
      createBinarySensorEntity({
        state,
        attributes: { friendly_name: 'Sensor', device_class: deviceClass },
      })
    )
    renderCard(<BinarySensorCard entityId={ENTITY} />)
    return card()
  }

  it('tints a leak sensor as water and a light sensor as light', () => {
    expect(renderClass('moisture')).toHaveAttribute('data-color', 'water')
  })

  it('tints a light sensor as light', () => {
    // New in 0018 PR 2 — it fell through to the generic colour before.
    expect(renderClass('light')).toHaveAttribute('data-color', 'light')
  })

  it('leaves an ordinary sensor on the generic colour', () => {
    expect(renderClass('door')).toHaveAttribute('data-color', 'default')
  })
})

/**
 * The rule that matters: a sounding hazard sensor is not configurable into
 * looking calm, by any option or combination of them
 * (docs/specs/entity-cards/options/sensor.md — "Exception").
 */
describe('BinarySensorCard hazard states', () => {
  const smoke = (state: string) =>
    createBinarySensorEntity({
      entity_id: ENTITY,
      state,
      attributes: { friendly_name: 'Kitchen Smoke', device_class: 'smoke' },
    })

  it('renders the danger presentation for an active smoke detector', () => {
    seed(smoke('on'))
    renderCard(<BinarySensorCard entityId={ENTITY} />)

    expect(card()).toHaveAttribute('data-color', 'alert')
    expect(card()).toHaveAttribute('data-active', 'true')
    expect(stateLine()).toHaveTextContent('Detected')
  })

  it('cannot be recoloured, relabelled, inverted or silenced', () => {
    // Every option that could soften it, set at once. The card's own resolver
    // handles the label and the glyph; the shell's danger floor handles
    // `color` and `hideState`. Both halves have to hold for this to pass.
    seed(smoke('on'))
    renderCard(<BinarySensorCard entityId={ENTITY} />, {
      color: 'ok',
      hideState: true,
      hideName: true,
      icon: 'Circle',
      invert: true,
      onLabel: 'All clear',
      onIcon: 'Circle',
    })

    expect(card()).toHaveAttribute('data-color', 'alert')
    expect(card()).toHaveAttribute('data-active', 'true')
    // The label is back despite `hideState`, and it is the hazard word.
    expect(stateLine()).toHaveTextContent('Detected')
    // The name is back too, because `hideName` is part of how a card warns.
    expect(document.querySelector('.liebe-name')).toHaveTextContent('Kitchen Smoke')
  })

  it('keeps the user’s renaming while it alarms', () => {
    // `name` is the one display option the floor does not take back: it says
    // WHICH detector is sounding, which the reader needs most just then.
    seed(smoke('on'))
    renderCard(<BinarySensorCard entityId={ENTITY} />, { name: 'Upstairs hallway' })

    expect(document.querySelector('.liebe-name')).toHaveTextContent('Upstairs hallway')
    expect(stateLine()).toHaveTextContent('Detected')
  })

  it('is an ordinary card again once it goes quiet', () => {
    // The rule binds the raw ACTIVE state. A quiet detector honours every
    // option, including the ones the floor takes back while it sounds.
    seed(smoke('off'))
    renderCard(<BinarySensorCard entityId={ENTITY} />, { hideState: true, invert: true })

    expect(stateLine()).toBeNull()
    // Inverted, so a quiet detector presents as active — which is what the
    // user asked for and is not a safety claim.
    expect(icon()).toHaveAttribute('data-active', 'true')
  })
})

describe('BinarySensorCard full tier', () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

  it('says how long the sensor has held its state', () => {
    seed(createBinarySensorEntity({ state: 'off', last_changed: twoHoursAgo }))
    renderCard(<BinarySensorCard entityId={ENTITY} tier="full" />)

    expect(screen.getByTestId('binary-sensor-since')).toHaveTextContent('for 2 h')
  })

  it.each(['glance', 'row', 'tall'] as const)('shows no recency line at %s', (tier) => {
    seed(createBinarySensorEntity({ state: 'off', last_changed: twoHoursAgo }))
    renderCard(<BinarySensorCard entityId={ENTITY} tier={tier} />)

    // The other tiers have no room for it, and the timer behind it does not
    // run for a line that is not rendered.
    expect(screen.queryByTestId('binary-sensor-since')).toBeNull()
  })

  it.each([
    ['missing', undefined],
    ['unparseable', 'the day before yesterday'],
  ])('shows no recency line when last_changed is %s', (_name, lastChanged) => {
    seed(createBinarySensorEntity({ state: 'off', last_changed: lastChanged as unknown as string }))
    renderCard(<BinarySensorCard entityId={ENTITY} tier="full" />)

    // No line rather than "for NaN min": an entity whose timestamp cannot be
    // read has not told the card how long anything has been true.
    expect(screen.queryByTestId('binary-sensor-since')).toBeNull()
    // The rest of the card is untouched — the line is supplementary.
    expect(stateLine()).toHaveTextContent('Closed')
  })
})

describe('BinarySensorCard icons', () => {
  it.each([
    ['on', 'CircleCheck'],
    ['off', 'Circle'],
  ])('falls back to the generic glyph for an unknown icon name while %s', (state, expected) => {
    // A name from a newer Liebe, or a hand-edited YAML. The card renders the
    // generic pair rather than nothing at all — an icon circle with no glyph
    // in it reads as a card that failed to load.
    seed(createBinarySensorEntity({ state }))
    renderCard(<BinarySensorCard entityId={ENTITY} />, {
      onIcon: 'NotAnIconThisBuildHas',
      offIcon: 'NorIsThis',
    })

    const glyph = icon()?.querySelector('svg')
    expect(glyph).not.toBeNull()
    expect(glyph?.getAttribute('class')).toContain(
      expected === 'CircleCheck' ? 'circle-check' : 'circle'
    )
  })
})

describe('BinarySensorCard states without a card', () => {
  it('holds a skeleton for an entity the store has not got', () => {
    seed(createBinarySensorEntity())
    renderCard(<BinarySensorCard entityId="binary_sensor.absent" />)

    expect(document.querySelector('.rt-Skeleton')).not.toBeNull()
  })

  it('offers a reload when the connection is down', async () => {
    const user = userEvent.setup()
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })

    seed(createBinarySensorEntity())
    entityStore.setState((state) => ({ ...state, isConnected: false }))
    renderCard(<BinarySensorCard entityId={ENTITY} />)

    expect(screen.getByText('Disconnected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('marks an unavailable sensor rather than presenting a state', () => {
    seed(createBinarySensorEntity({ state: 'unavailable' }))
    renderCard(<BinarySensorCard entityId={ENTITY} />)

    expect(card()).toHaveAttribute('data-unavailable', 'true')
    expect(stateLine()).toHaveTextContent('UNAVAILABLE')
  })

  it('ignores attributes that are not text, whatever the type says', () => {
    // An attribute map is `Record<string, unknown>` on the wire. A numeric
    // `friendly_name` would otherwise render as the card's name, and a
    // non-string `device_class` would be looked up as one.
    seed({
      ...createBinarySensorEntity({ state: 'on' }),
      attributes: { friendly_name: 42, device_class: ['door'] },
    } as unknown as HassEntity)
    renderCard(<BinarySensorCard entityId={ENTITY} />)

    expect(screen.getByText(ENTITY)).toBeInTheDocument()
    // No device class this build can read, so the generic naming applies.
    expect(stateLine()).toHaveTextContent('On')
  })

  it('renders an entity carrying no attributes at all', () => {
    seed({
      ...createBinarySensorEntity({ state: 'off' }),
      attributes: undefined,
    } as unknown as HassEntity)
    renderCard(<BinarySensorCard entityId={ENTITY} />)

    expect(screen.getByText(ENTITY)).toBeInTheDocument()
    expect(stateLine()).toHaveTextContent('Off')
  })

  it('names an entity that has no friendly name after its id', () => {
    seed(
      createBinarySensorEntity({ attributes: { friendly_name: undefined, device_class: 'door' } })
    )
    renderCard(<BinarySensorCard entityId={ENTITY} />)

    expect(screen.getByText(ENTITY)).toBeInTheDocument()
  })
})

describe('BinarySensorCard configuration modal', () => {
  const item: GridItem = {
    id: 'bs-1',
    type: 'entity',
    entityId: ENTITY,
    x: 0,
    y: 0,
    width: 2,
    height: 2,
  }

  it('saves its options back to the placed item', async () => {
    const user = userEvent.setup()
    const updateGridItem = vi.spyOn(dashboardActions, 'updateGridItem').mockImplementation(() => {})
    dashboardActions.setMode('edit')
    dashboardStore.setState((state) => ({ ...state, currentScreenId: 'screen-1' }))

    seed(createBinarySensorEntity({ state: 'on' }))
    renderCard(<BinarySensorCard entityId={ENTITY} item={item} />)

    await user.click(screen.getByRole('button', { name: /configure/i }))
    // Both label fields share a placeholder; the on-label is the first.
    await user.type(screen.getAllByPlaceholderText('From the device class')[0], 'Ajar')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(updateGridItem).toHaveBeenCalledWith(
      'screen-1',
      'bs-1',
      expect.objectContaining({ config: expect.objectContaining({ onLabel: 'Ajar' }) })
    )
    updateGridItem.mockRestore()
  })

  it('saves nothing when there is no screen to save it to', async () => {
    // The dashboard has no current screen — mid-navigation, or a preview
    // rendered outside one. The save is dropped rather than writing the item
    // into whichever screen happens to be first.
    const user = userEvent.setup()
    const updateGridItem = vi.spyOn(dashboardActions, 'updateGridItem').mockImplementation(() => {})
    dashboardActions.setMode('edit')
    dashboardStore.setState((state) => ({ ...state, currentScreenId: undefined }))

    seed(createBinarySensorEntity({ state: 'on' }))
    renderCard(<BinarySensorCard entityId={ENTITY} item={item} />)

    await user.click(screen.getByRole('button', { name: /configure/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(updateGridItem).not.toHaveBeenCalled()
    updateGridItem.mockRestore()
  })

  it('offers no configuration affordance outside edit mode', () => {
    seed(createBinarySensorEntity({ state: 'on' }))
    renderCard(<BinarySensorCard entityId={ENTITY} item={item} />)

    expect(screen.queryByRole('button', { name: /configure/i })).toBeNull()
  })
})

describe('BinarySensorCard re-render guard', () => {
  it('re-renders for a changed selection and not for an identical render', () => {
    dashboardActions.setMode('edit')
    seed(createBinarySensorEntity({ state: 'on' }))
    const onSelect = vi.fn()

    const view = renderCard(
      <BinarySensorCard entityId={ENTITY} isSelected={false} onSelect={onSelect} />
    )
    const rerender = (isSelected: boolean) =>
      view.rerender(
        <Theme>
          <HomeAssistantProvider hass={createMockHomeAssistant()}>
            <CardItemProvider entityId={ENTITY}>
              <BinarySensorCard entityId={ENTITY} isSelected={isSelected} onSelect={onSelect} />
            </CardItemProvider>
          </HomeAssistantProvider>
        </Theme>
      )

    rerender(false)
    expect(card()).not.toHaveAttribute('data-selected', 'true')

    rerender(true)
    expect(card()).toHaveAttribute('data-selected', 'true')
  })
})
