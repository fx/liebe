import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Theme } from '@radix-ui/themes'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EntityPicker } from '../EntityPicker'
import { entityStore, entityStoreActions } from '~/store/entityStore'
import type { HassEntity } from '~/store/entityTypes'
import { createBinarySensorEntity, createSensorEntity } from '~/test/fixtures'

/**
 * The picker behind every option that links a second entity to a card
 * (`motionEntity`, `doorEntity`, `batteryEntity`).
 *
 * Two things carry the weight: what it emits is always an entity that exists
 * (it is picked from the list, never typed), and what it is *given* is never
 * rewritten — a dashboard shared as YAML routinely lands on an instance that
 * does not have the linked entity, and opening the config form must not be the
 * thing that deletes the link.
 */
describe('EntityPicker', () => {
  const onChange = vi.fn()

  const motion = createBinarySensorEntity({
    entity_id: 'binary_sensor.driveway_motion',
    attributes: { friendly_name: 'Driveway Motion', device_class: 'motion' },
  })
  const door = createBinarySensorEntity()
  const battery = createSensorEntity({
    entity_id: 'sensor.phone_battery',
    attributes: { friendly_name: 'Phone Battery', device_class: 'battery' },
  })

  function seed(entities: HassEntity[]) {
    entityStore.setState((state) => ({
      ...state,
      entities: Object.fromEntries(entities.map((entity) => [entity.entity_id, entity])),
      isConnected: true,
      isInitialLoading: false,
    }))
  }

  function renderPicker(props: Partial<React.ComponentProps<typeof EntityPicker>> = {}) {
    return render(
      <Theme>
        <EntityPicker label="Motion sensor" value="" onChange={onChange} {...props} />
      </Theme>
    )
  }

  async function openPicker(label = 'Motion sensor') {
    fireEvent.click(screen.getByRole('button', { name: label }))
    await waitFor(() => expect(screen.getByLabelText(`${label} search`)).toBeInTheDocument())
  }

  beforeEach(() => {
    onChange.mockClear()
    seed([motion, door, battery])
  })

  afterEach(() => {
    entityStore.setState((state) => ({ ...state, entities: {} }))
  })

  it('says nothing is linked, and offers every entity when unfiltered', async () => {
    renderPicker()
    expect(screen.getByRole('button', { name: 'Motion sensor' })).toHaveTextContent(
      'No entity linked'
    )

    await openPicker()
    expect(screen.getByText('Driveway Motion')).toBeInTheDocument()
    expect(screen.getByText('Phone Battery')).toBeInTheDocument()
    expect(screen.getByText('3 available')).toBeInTheDocument()
  })

  it('uses the caller’s placeholder when it has one', () => {
    renderPicker({ placeholder: 'Link a motion sensor' })
    expect(screen.getByRole('button', { name: 'Motion sensor' })).toHaveTextContent(
      'Link a motion sensor'
    )
  })

  it('offers only the requested domains and device classes', async () => {
    renderPicker({ domains: ['binary_sensor'], deviceClasses: ['motion'] })
    await openPicker()

    expect(screen.getByText('Driveway Motion')).toBeInTheDocument()
    // A door sensor is the right domain and the wrong class; the battery sensor
    // is neither.
    expect(screen.queryByText('Front Door')).not.toBeInTheDocument()
    expect(screen.queryByText('Phone Battery')).not.toBeInTheDocument()
  })

  it('emits the picked entity id and closes', async () => {
    renderPicker()
    await openPicker()

    fireEvent.click(screen.getByText('Driveway Motion'))

    expect(onChange).toHaveBeenCalledWith('binary_sensor.driveway_motion')
    await waitFor(() =>
      expect(screen.queryByLabelText('Motion sensor search')).not.toBeInTheDocument()
    )
  })

  it('searches by friendly name and by entity id', async () => {
    renderPicker()
    await openPicker()
    const search = screen.getByLabelText('Motion sensor search')

    fireEvent.change(search, { target: { value: 'driveway' } })
    expect(screen.getByText('Driveway Motion')).toBeInTheDocument()
    expect(screen.queryByText('Phone Battery')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'sensor.phone' } })
    expect(screen.getByText('Phone Battery')).toBeInTheDocument()
    expect(screen.queryByText('Driveway Motion')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'nothing like this' } })
    expect(screen.getByText('No entity matches that search.')).toBeInTheDocument()
  })

  it('forgets the search when the popover is dismissed without a selection', async () => {
    renderPicker()
    await openPicker()
    fireEvent.change(screen.getByLabelText('Motion sensor search'), {
      target: { value: 'driveway' },
    })
    expect(screen.queryByText('Phone Battery')).not.toBeInTheDocument()

    // Escape and a click outside are how a user abandons a search, and neither
    // goes through the commit path. A search that survived would filter the
    // next open without the field showing it — the entity looks missing.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() =>
      expect(screen.queryByLabelText('Motion sensor search')).not.toBeInTheDocument()
    )

    await openPicker()
    expect(screen.getByLabelText('Motion sensor search')).toHaveValue('')
    expect(screen.getByText('Phone Battery')).toBeInTheDocument()
    expect(screen.getByText('3 available')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each([
    [
      'still loading',
      { isConnected: false, isInitialLoading: true },
      'Still loading entities from Home Assistant…',
    ],
    [
      'disconnected',
      { isConnected: false, isInitialLoading: false },
      'Not connected to Home Assistant — no entities to choose from.',
    ],
  ])(
    'says the list is empty because it is %s, not because nothing matched',
    async (_case, connection, message) => {
      entityStore.setState((state) => ({ ...state, entities: {}, ...connection }))
      renderPicker()
      await openPicker()

      expect(screen.getByText(message)).toBeInTheDocument()
    }
  )

  it('says the instance is empty when there is nothing to choose from at all', async () => {
    // Connected, done loading, and no entities: the user has not searched, and
    // no filter is in the way. Nothing about their config is wrong.
    seed([])
    renderPicker()
    await openPicker()

    expect(
      screen.getByText('This Home Assistant has no entities to choose from.')
    ).toBeInTheDocument()
    expect(screen.queryByText('No entity matches that search.')).not.toBeInTheDocument()
  })

  it('names the kind of entity it wanted when the filters leave nothing', async () => {
    // The instance has entities, just none of the kind this option links. The
    // next action is to add such an entity in Home Assistant, not to search.
    seed([battery])
    renderPicker({ domains: ['binary_sensor'], deviceClasses: ['motion'] })
    await openPicker()

    expect(
      screen.getByText('This Home Assistant has no motion binary_sensor entities to link.')
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Motion sensor search')).toHaveValue('')
  })

  it('names only the filter it was given', async () => {
    seed([battery])
    renderPicker({ domains: ['light'] })
    await openPicker()

    expect(
      screen.getByText('This Home Assistant has no light entities to link.')
    ).toBeInTheDocument()
  })

  it('blames the filters, not the search, when both would come up empty', async () => {
    // A search typed into a list that was already empty must not change the
    // diagnosis: the filters emptied it, and clearing the search fixes nothing.
    seed([battery])
    renderPicker({ domains: ['light'] })
    await openPicker()
    fireEvent.change(screen.getByLabelText('Motion sensor search'), {
      target: { value: 'kitchen' },
    })

    expect(
      screen.getByText('This Home Assistant has no light entities to link.')
    ).toBeInTheDocument()
  })

  it('blames the search only when there was something to search', async () => {
    renderPicker()
    await openPicker()
    fireEvent.change(screen.getByLabelText('Motion sensor search'), {
      target: { value: 'nothing like this' },
    })

    expect(screen.getByText('No entity matches that search.')).toBeInTheDocument()
  })

  it('falls back to the entity id for an entity with no friendly name', async () => {
    seed([createSensorEntity({ entity_id: 'sensor.unnamed', attributes: { friendly_name: '' } })])
    renderPicker()
    await openPicker()

    expect(screen.getAllByText('sensor.unnamed').length).toBeGreaterThan(0)
  })

  it('caps the list and says how many matched', async () => {
    seed(
      Array.from({ length: 60 }, (_, index) =>
        createSensorEntity({
          entity_id: `sensor.probe_${index}`,
          attributes: { friendly_name: `Probe ${String(index).padStart(2, '0')}` },
        })
      )
    )
    renderPicker()
    await openPicker()

    expect(screen.getByText('Showing 50 of 60 — keep typing to narrow it down')).toBeInTheDocument()
    expect(screen.getByText('Probe 49')).toBeInTheDocument()
    expect(screen.queryByText('Probe 59')).not.toBeInTheDocument()
  })

  it('shows the linked entity by name, and clears back to nothing linked', async () => {
    renderPicker({ value: 'binary_sensor.driveway_motion' })
    expect(screen.getByRole('button', { name: 'Motion sensor' })).toHaveTextContent(
      'Driveway Motion'
    )

    await openPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('keeps a stored id this instance cannot resolve, and says what will happen', () => {
    renderPicker({ value: 'binary_sensor.moved_house' })

    expect(screen.getByRole('button', { name: 'Motion sensor' })).toHaveTextContent(
      'binary_sensor.moved_house'
    )
    expect(screen.getByText(/is not in this Home Assistant/)).toBeInTheDocument()
    // Reporting it is the whole response: the form has not written anything.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps a stored entity the filters would not have offered', () => {
    // The filters describe what the list offers, not what the option may hold —
    // a config built against a different filter, or by hand, is still valid.
    renderPicker({ value: 'sensor.phone_battery', domains: ['binary_sensor'] })

    expect(screen.getByRole('button', { name: 'Motion sensor' })).toHaveTextContent('Phone Battery')
    expect(screen.queryByText(/is not in this Home Assistant/)).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows a malformed stored value as nothing linked without rewriting it', () => {
    renderPicker({ value: { entity: 'binary_sensor.driveway_motion' } })

    expect(screen.getByRole('button', { name: 'Motion sensor' })).toHaveTextContent(
      'No entity linked'
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  /**
   * The picker reads every entity there is, because its filters are predicates
   * over domain and `device_class` rather than a list of ids — so it re-renders
   * on every entity-store batch, and a real Home Assistant produces those
   * continuously for thousands of entities. The list must therefore cost
   * nothing while nobody is looking at it: this control sits in every card's
   * config form, and sorting a few thousand names behind a closed popover is
   * what makes typing in an unrelated field stutter.
   *
   * The probe counts reads of `friendly_name`, which is what building the list
   * does — the sort comparator reads two per comparison. Zero reads is the
   * assertion, and it holds only if nothing is built, filtered, sorted or
   * sliced.
   */
  describe('while the popover is closed', () => {
    let nameReads = 0

    function probe(index: number): HassEntity {
      const id = `sensor.probe_${String(index).padStart(3, '0')}`
      const entity = createSensorEntity({ entity_id: id, attributes: { friendly_name: '' } })
      Object.defineProperty(entity.attributes, 'friendly_name', {
        get: () => {
          nameReads++
          return `Probe ${String(index).padStart(3, '0')}`
        },
        configurable: true,
      })
      return entity
    }

    beforeEach(() => {
      nameReads = 0
      seed(Array.from({ length: 400 }, (_, index) => probe(index)))
    })

    /** Tens of batches, each touching a handful of entities, as HA delivers them. */
    function driveUpdates(batches = 30) {
      for (let batch = 0; batch < batches; batch++) {
        act(() => {
          entityStoreActions.updateEntities(
            Array.from({ length: 5 }, (_, offset) => probe((batch * 5 + offset) % 400))
          )
        })
      }
    }

    it('never builds the list, however many entity updates arrive', () => {
      renderPicker()
      nameReads = 0

      driveUpdates()

      expect(nameReads).toBe(0)
    })

    it('still has a current list in the first frame it opens', async () => {
      renderPicker()
      driveUpdates()
      // A name that changed while the popover was closed. Deferred work must not
      // show the list as it was before these updates, nor show it empty first.
      act(() => {
        entityStoreActions.updateEntities([
          createSensorEntity({
            entity_id: 'sensor.probe_000',
            attributes: { friendly_name: 'Aaa Renamed While Closed' },
          }),
        ])
      })

      await openPicker()

      expect(screen.getByText('Aaa Renamed While Closed')).toBeInTheDocument()
      expect(
        screen.getByText('Showing 50 of 400 — keep typing to narrow it down')
      ).toBeInTheDocument()
    })

    it('keeps showing the linked entity by name', () => {
      // The trigger reads one name on every render and must go on doing so: the
      // gate is about the list, not about the selection.
      renderPicker({ value: 'sensor.probe_007' })
      driveUpdates()

      expect(screen.getByRole('button', { name: 'Motion sensor' })).toHaveTextContent('Probe 007')
    })
  })

  it('renders its description when given one', () => {
    renderPicker({ description: 'Adds a motion line to the camera overlay.' })
    expect(screen.getByText('Adds a motion line to the camera overlay.')).toBeInTheDocument()
  })
})
