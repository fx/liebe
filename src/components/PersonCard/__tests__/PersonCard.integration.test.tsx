import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { CardItemProvider } from '../../cardItemContext'
import { PersonCard } from '..'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The person card driven through the real shell and the real stores — no mocked
 * hooks.
 *
 * One thing can only be tested here, and it is the whole of what this card's
 * "read-only" claim means at runtime: that a tap **opens the detail dialog and
 * calls no service**. A unit test cannot show it. This card imports no service
 * hook at all, so a mocked-dispatch assertion would be checking that a function
 * the card has no way of reaching was not reached — green for a reason unrelated
 * to the behaviour, and still green if a later change wired a dispatch in.
 * Against the real shell, `hass.callService` is the thing a person card must
 * never touch however it is configured.
 */

const ENTITY_ID = 'person.jane_doe'

let hass: HomeAssistant

function makePerson(state: string): HassEntity {
  return {
    entity_id: ENTITY_ID,
    state,
    attributes: { friendly_name: 'Jane Doe' } as HassEntity['attributes'],
    last_changed: '2026-07-29T10:00:00Z',
    last_updated: '2026-07-29T10:00:00Z',
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

function renderCard(card: ReactElement, config?: Record<string, unknown>) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        <CardItemProvider entityId={ENTITY_ID} config={config}>
          {card}
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
}

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
})

afterEach(() => {
  dashboardActions.resetState()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('the person card against the real shell', () => {
  it('opens the detail dialog on a tap and calls no service', async () => {
    seed(makePerson('home'))
    renderCard(<PersonCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(screen.getByText('Jane Doe'))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('sends a configured toggle to the dialog rather than to a service', async () => {
    /*
     * The configured route, which is the one that matters: `tapAction: default`
     * resolving to `more-info` is this card's own rule, but a stored `toggle`
     * reaches the shell's generic on/off path, and `homeassistant.toggle` on a
     * person is what the fallback card used to attempt and what the registry
     * entry exists to stop.
     *
     * Both halves are asserted. That no service is called is the safety half;
     * that the dialog opens anyway is the half that makes the option behave like
     * every other route on this card rather than like a dead tap.
     */
    seed(makePerson('home'))
    renderCard(<PersonCard entityId={ENTITY_ID} tier="row" />, { tapAction: 'toggle' })

    fireEvent.click(screen.getByText('Jane Doe'))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    // Waited out rather than asserted immediately: a dispatch one tick later
    // would otherwise pass this test.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(hass.callService).not.toHaveBeenCalled()
  })
})
