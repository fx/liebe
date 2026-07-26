import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { Text } from '@radix-ui/themes'
import { EntityDetailDialog } from '../EntityDetailDialog'
import {
  registerDetailControls,
  type EntityDetailControlsProps,
} from '../EntityDetailDialog/detailControls'
import { REDACTED_PLACEHOLDER } from '../EntityDetailDialog/redaction'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { useEntity } from '~/hooks/useEntity'
import { dashboardActions } from '~/store'
import { HOLD_DURATION_MS } from '~/store/cardActions'
import { createInputTextEntity, createSensorEntity } from '~/test/fixtures'
import type { HassEntity } from '~/store/entityTypes'

/**
 * The entity detail dialog — what a hold opens on every card.
 *
 * The redaction cases are the ones that must never regress: the dialog renders
 * state and attributes generically, so a password helper would otherwise be one
 * gesture away from displaying in clear text the secret its card masks
 * (docs/specs/entity-cards/options/input-helpers.md — the per-value masking
 * guarantee).
 */
describe('EntityDetailDialog', () => {
  /** Stands in for a card's own `useEntity` subscription. */
  function SubscribingContent({ entityId }: { entityId: string }) {
    const { entity } = useEntity(entityId)
    return <span data-testid="card-content">{entity?.state}</span>
  }

  function seed(...entities: HassEntity[]) {
    entityStore.setState((state) => ({
      ...state,
      entities: Object.fromEntries(entities.map((entity) => [entity.entity_id, entity])),
      isConnected: true,
      isInitialLoading: false,
    }))
  }

  function renderDialog(entityId: string, onOpenChange = vi.fn()) {
    return render(
      <HomeAssistantProvider hass={createMockHomeAssistant()}>
        <EntityDetailDialog entityId={entityId} open onOpenChange={onOpenChange} />
      </HomeAssistantProvider>
    )
  }

  /** The `<dd>` rendered for one attribute key. */
  function attributeValue(key: string): HTMLElement {
    const list = screen.getByTestId('detail-attributes')
    const term = within(list).getByText(key)
    const value = term.nextElementSibling
    expect(value).not.toBeNull()
    return value as HTMLElement
  }

  beforeEach(() => {
    entityStore.setState((state) => ({ ...state, entities: {}, isInitialLoading: false }))
    dashboardActions.resetState()
  })

  afterEach(() => {
    dashboardActions.resetState()
  })

  it('shows the entity’s name, id, state and attributes', () => {
    seed(createSensorEntity())
    renderDialog('sensor.living_room_temperature')

    expect(screen.getByText('Living Room Temperature')).toBeInTheDocument()
    expect(screen.getByText('sensor.living_room_temperature')).toBeInTheDocument()
    expect(screen.getByTestId('detail-state')).toHaveTextContent('21.4')
    // The unit sits beside the state readout, not inside it.
    expect(screen.getByTestId('detail-state').parentElement).toHaveTextContent(/21\.4\s*°C/)
    expect(attributeValue('device_class')).toHaveTextContent('temperature')
  })

  it('carries no configuration affordance', () => {
    // Configuration stays reachable only through the card's edit-mode settings
    // button (docs/changes/0014 — "The dialog carries no card-config link").
    seed(createSensorEntity())
    renderDialog('sensor.living_room_temperature')

    expect(screen.queryByRole('button', { name: /configure|settings|copy/i })).toBeNull()
  })

  it('renders a history placeholder until history data lands', () => {
    seed(createSensorEntity())
    renderDialog('sensor.living_room_temperature')

    expect(screen.getByTestId('detail-history-placeholder')).toBeInTheDocument()
  })

  it('falls back to the entity id when the entity has no friendly name', () => {
    seed(createSensorEntity({ attributes: { friendly_name: undefined } }))
    renderDialog('sensor.living_room_temperature')

    // Title and description both, which is what a nameless entity looks like.
    expect(screen.getAllByText('sensor.living_room_temperature')).toHaveLength(2)
  })

  it('says so when Home Assistant is not publishing the entity', () => {
    renderDialog('sensor.deleted')

    expect(screen.getByTestId('detail-missing')).toBeInTheDocument()
  })

  it('waits rather than claiming the entity is missing while the first load runs', () => {
    entityStore.setState((state) => ({ ...state, entities: {}, isInitialLoading: true }))
    renderDialog('sensor.living_room_temperature')

    expect(screen.getByTestId('detail-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('detail-missing')).toBeNull()
  })

  it('renders an em dash for an entity with an empty state and no attributes', () => {
    seed({
      entity_id: 'sensor.blank',
      state: '',
      attributes: {},
      last_changed: '2026-07-25T12:00:00.000Z',
      last_updated: '2026-07-25T12:00:00.000Z',
      context: { id: 'test', parent_id: null, user_id: null },
    })
    renderDialog('sensor.blank')

    expect(screen.getByTestId('detail-state')).toHaveTextContent('—')
    expect(screen.getByText('This entity publishes no attributes.')).toBeInTheDocument()
  })

  it('closes when the dialog asks to close', () => {
    seed(createSensorEntity())
    const onOpenChange = vi.fn()
    renderDialog('sensor.living_room_temperature', onOpenChange)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalled()
  })

  it('mounts the controls a domain registers, and stops when they are removed', () => {
    // The pluggable slot later card changes register into; empty in this one.
    const DomainControls = ({ entity }: EntityDetailControlsProps) => (
      <Text data-testid="domain-controls">{entity.entity_id}</Text>
    )
    const dispose = registerDetailControls('sensor', DomainControls)

    seed(createSensorEntity())
    const { unmount } = renderDialog('sensor.living_room_temperature')
    expect(screen.getByTestId('domain-controls')).toHaveTextContent(
      'sensor.living_room_temperature'
    )
    unmount()

    dispose()
    renderDialog('sensor.living_room_temperature')
    expect(screen.queryByTestId('domain-controls')).toBeNull()
  })

  describe('password helpers', () => {
    const password = createInputTextEntity({
      entity_id: 'input_text.wifi_password',
      state: 'hunter2-correct-horse',
      attributes: { friendly_name: 'Wifi Password', mode: 'password' },
    })

    it('never displays the secret the card masks — not in the state, not in an attribute', () => {
      // The regression test for the disclosure this dialog would otherwise be:
      // the value is masked in BOTH surfaces that render it, and the secret
      // appears nowhere in the rendered DOM at all.
      seed({
        ...password,
        attributes: {
          ...password.attributes,
          // An integration echoing the value back under a name of its own.
          last_value: 'hunter2-correct-horse',
          // ...and one that only embeds it.
          share_url: 'https://example.invalid/join?key=hunter2-correct-horse',
        },
      })
      renderDialog('input_text.wifi_password')

      expect(screen.getByTestId('detail-state')).toHaveTextContent(REDACTED_PLACEHOLDER)
      expect(attributeValue('last_value')).toHaveAttribute('data-redacted', 'true')
      expect(attributeValue('share_url')).toHaveAttribute('data-redacted', 'true')
      expect(document.body.textContent).not.toContain('hunter2')
    })

    it('masks a credential-named attribute on any entity', () => {
      // A camera publishes `access_token`; nothing about that entity is a
      // password helper, and the token is still a secret.
      seed(
        createSensorEntity({
          attributes: { friendly_name: 'Living Room Temperature', access_token: 'abc123' },
        })
      )
      renderDialog('sensor.living_room_temperature')

      expect(attributeValue('access_token')).toHaveAttribute('data-redacted', 'true')
      expect(document.body.textContent).not.toContain('abc123')
    })

    it('still reports an unavailable password helper as unavailable', () => {
      // `unavailable` is a lifecycle state, not the secret, and hiding it would
      // blank the one thing the dialog was opened to find out.
      seed({ ...password, state: 'unavailable' })
      renderDialog('input_text.wifi_password')

      expect(screen.getByTestId('detail-state')).toHaveTextContent('unavailable')
    })

    it('leaves an ordinary text helper’s value visible', () => {
      seed(createInputTextEntity())
      renderDialog('input_text.doorbell_message')

      expect(screen.getByTestId('detail-state')).toHaveTextContent(
        'Please leave parcels at the side door'
      )
    })
  })

  describe('through the card shell', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    function card() {
      return document.querySelector('.liebe-card') as HTMLElement
    }

    function renderCard(entityId = 'sensor.living_room_temperature') {
      return render(
        <HomeAssistantProvider hass={createMockHomeAssistant()}>
          <GridCard domain="sensor" entityId={entityId}>
            <span data-testid="card-content">content</span>
          </GridCard>
        </HomeAssistantProvider>
      )
    }

    function hold(target: HTMLElement) {
      fireEvent.pointerDown(target, { isPrimary: true, button: 0 })
      act(() => {
        vi.advanceTimersByTime(HOLD_DURATION_MS + 50)
      })
      fireEvent.pointerUp(target)
    }

    it('opens on hold with no card-side wiring at all', () => {
      // The `holdAction` default is `more-info`, and the shell owns the dialog,
      // so every card reaches it without passing a handler.
      seed(createSensorEntity())
      renderCard()

      expect(screen.queryByRole('dialog')).toBeNull()
      hold(card())
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('does not open for a card with no entity', () => {
      seed(createSensorEntity())
      render(
        <HomeAssistantProvider hass={createMockHomeAssistant()}>
          <GridCard domain="text">
            <span>a text tile</span>
          </GridCard>
        </HomeAssistantProvider>
      )

      hold(card())
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('drops an open dialog when the card is recycled onto another entity', () => {
      // Same shell instance, different entity: the previous entity's details
      // must not stay standing over a card that now shows something else.
      seed(createSensorEntity(), createSensorEntity({ entity_id: 'sensor.other' }))
      const { rerender } = renderCard()
      hold(card())
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      rerender(
        <HomeAssistantProvider hass={createMockHomeAssistant()}>
          <GridCard domain="sensor" entityId="sensor.other">
            <span data-testid="card-content">content</span>
          </GridCard>
        </HomeAssistantProvider>
      )
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('does not arm the card’s hold timer from a press inside the open dialog', () => {
      // The dialog is portalled but lives in the card's React tree, so its
      // events bubble to the shell's handlers. Pinned in the shell by "ignores
      // gestures from a portalled descendant"; asserted here against the real
      // dialog, which is the surface that made the guard necessary.
      seed(createSensorEntity())
      renderCard()
      hold(card())

      const dialog = screen.getByRole('dialog')
      fireEvent.pointerDown(dialog, { isPrimary: true, button: 0 })
      act(() => {
        vi.advanceTimersByTime(HOLD_DURATION_MS * 2)
      })

      // Still exactly one dialog: the press did not re-fire the hold behind it.
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
    })

    it('closes again from the dialog itself', () => {
      seed(createSensorEntity())
      renderCard()
      hold(card())

      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      act(() => {
        vi.runOnlyPendingTimers()
      })
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('leaves the card’s entity subscription intact after closing', () => {
      // The dialog shows the same entity as the card behind it, so closing it
      // must not unsubscribe an entity that is still on screen.
      seed(createSensorEntity())
      render(
        <HomeAssistantProvider hass={createMockHomeAssistant()}>
          <GridCard domain="sensor" entityId="sensor.living_room_temperature">
            <SubscribingContent entityId="sensor.living_room_temperature" />
          </GridCard>
        </HomeAssistantProvider>
      )
      hold(card())

      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      act(() => {
        vi.runOnlyPendingTimers()
      })

      expect(entityStore.state.subscribedEntities.has('sensor.living_room_temperature')).toBe(true)
    })

    it('closes when the dashboard switches to edit mode', () => {
      seed(createSensorEntity())
      renderCard()
      hold(card())
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      act(() => {
        dashboardActions.setMode('edit')
      })
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
