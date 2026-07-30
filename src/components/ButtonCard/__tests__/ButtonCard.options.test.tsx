import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { ButtonCard } from '..'
import { CardItemProvider } from '../../cardItemContext'
import { useEntity, useServiceCall } from '~/hooks'
import { useHomeAssistantOptional } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import type { CardTier } from '~/utils/cardTier'

vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

vi.mock('~/contexts/HomeAssistantContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/contexts/HomeAssistantContext')>()),
  useHomeAssistantOptional: vi.fn(),
}))

/**
 * The switch card's options as they render — including on the domains this same
 * card serves as the fallback, where every option must be safe
 * (docs/specs/entity-cards/options/switch.md).
 */
describe('ButtonCard options', () => {
  const CHANGED_AT = '2026-07-27T10:00:00Z'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(Date.parse('2026-07-27T12:00:00Z'))
    vi.mocked(useHomeAssistantOptional).mockReturnValue(createMockHomeAssistant())
    vi.mocked(useServiceCall).mockReturnValue({
      loading: false,
      error: null,
      callService: vi.fn(),
      dispatchGuarded: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      setValue: vi.fn(),
      clearError: vi.fn(),
    } as unknown as ReturnType<typeof useServiceCall>)
  })

  function mockEntity(
    entityId: string,
    state: string,
    attributes: Record<string, unknown> = {}
  ): void {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        entity_id: entityId,
        state,
        attributes: { friendly_name: 'Test Entity', ...attributes },
        last_changed: CHANGED_AT,
        last_updated: CHANGED_AT,
        context: { id: 'test', parent_id: null, user_id: null },
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    } as unknown as ReturnType<typeof useEntity>)
  }

  function renderCard(
    entityId: string,
    config: Record<string, unknown> = {},
    tier: CardTier = 'row'
  ) {
    // Wrapped exactly as the grid wraps a placed card: the shell reads the
    // universal options (`hideState`) off this provider, the card reads its own
    // off the prop, and both are the same stored config.
    return render(
      <Theme>
        <CardItemProvider entityId={entityId} config={config}>
          <ButtonCard entityId={entityId} tier={tier} config={config} />
        </CardItemProvider>
      </Theme>
    )
  }

  /** The glyph the icon circle rendered, by its lucide class name. */
  function iconClass(container: HTMLElement): string {
    const svg = container.querySelector('.liebe-icon svg')
    return svg?.getAttribute('class') ?? ''
  }

  describe('deviceClassIcon', () => {
    it('shows an outlet as a plug by default', () => {
      mockEntity('switch.coffee_maker', 'on', { device_class: 'outlet' })
      const { container } = renderCard('switch.coffee_maker')
      expect(iconClass(container)).toContain('lucide-plug')
    })

    it('shows the power glyph when the lookup is turned off', () => {
      mockEntity('switch.coffee_maker', 'on', { device_class: 'outlet' })
      const { container } = renderCard('switch.coffee_maker', { deviceClassIcon: false })
      expect(iconClass(container)).toContain('lucide-power')
    })

    it('leaves a fallback domain generic even with a device_class set', () => {
      mockEntity('siren.garage', 'off', { device_class: 'outlet' })
      const { container } = renderCard('siren.garage', { deviceClassIcon: true })
      expect(iconClass(container)).toContain('lucide-zap')
    })
  })

  describe('stateLabels', () => {
    it('replaces the on and off text', () => {
      mockEntity('switch.coffee_maker', 'on')
      const { rerender } = renderCard('switch.coffee_maker', {
        stateLabels: { onLabel: 'Brewing', offLabel: 'Idle' },
      })
      expect(screen.getByText('Brewing')).toBeInTheDocument()

      mockEntity('switch.coffee_maker', 'off')
      rerender(
        <Theme>
          <CardItemProvider
            entityId="switch.coffee_maker"
            config={{ stateLabels: { onLabel: 'Brewing', offLabel: 'Idle' } }}
          >
            <ButtonCard
              entityId="switch.coffee_maker"
              tier="row"
              config={{ stateLabels: { onLabel: 'Brewing', offLabel: 'Idle' } }}
            />
          </CardItemProvider>
        </Theme>
      )
      expect(screen.getByText('Idle')).toBeInTheDocument()
    })

    it('shows an unavailable entity as unavailable, not as a label', () => {
      mockEntity('switch.coffee_maker', 'unavailable')
      renderCard('switch.coffee_maker', { stateLabels: { onLabel: 'Brewing', offLabel: 'Idle' } })
      expect(screen.queryByText('Brewing')).not.toBeInTheDocument()
      expect(screen.queryByText('Idle')).not.toBeInTheDocument()
    })

    it('leaves a fallback domain’s own state raw', () => {
      mockEntity('siren.garage', 'triggered')
      renderCard('siren.garage', { stateLabels: { onLabel: 'Brewing', offLabel: 'Idle' } })
      expect(screen.getByText('TRIGGERED')).toBeInTheDocument()
    })
  })

  describe('showLastChanged', () => {
    it('adds the duration to the state line', () => {
      mockEntity('switch.well_pump', 'on')
      renderCard('switch.well_pump', { showLastChanged: true })
      expect(screen.getByText('for 2 h')).toBeInTheDocument()
    })

    it('renders nothing when the option is off', () => {
      mockEntity('switch.well_pump', 'on')
      renderCard('switch.well_pump')
      expect(screen.queryByText('for 2 h')).not.toBeInTheDocument()
    })

    it.each(['row', 'tall', 'full'] as const)('renders at %s', (tier) => {
      mockEntity('switch.well_pump', 'on')
      renderCard('switch.well_pump', { showLastChanged: true }, tier)
      expect(screen.getByText('for 2 h')).toBeInTheDocument()
    })

    it('is omitted at glance, which has no room for a second line', () => {
      mockEntity('switch.well_pump', 'on')
      renderCard('switch.well_pump', { showLastChanged: true }, 'glance')
      expect(screen.queryByText('for 2 h')).not.toBeInTheDocument()
      // The state itself still renders — the option degrades, the card does not.
      expect(screen.getByText('ON')).toBeInTheDocument()
    })

    it('goes with the state line under hideState', () => {
      mockEntity('switch.well_pump', 'on')
      renderCard('switch.well_pump', { showLastChanged: true, hideState: true })
      expect(screen.queryByText('for 2 h')).not.toBeInTheDocument()
      expect(screen.queryByText('ON')).not.toBeInTheDocument()
    })

    it('is safe on a fallback domain', () => {
      mockEntity('siren.garage', 'triggered')
      renderCard('siren.garage', { showLastChanged: true })
      expect(screen.getByText('TRIGGERED')).toBeInTheDocument()
      expect(screen.getByText('for 2 h')).toBeInTheDocument()
    })
  })

  it('renders every option at once on an unmapped domain without crashing', () => {
    mockEntity('siren.garage', 'triggered', { device_class: 'outlet' })
    const { container } = renderCard('siren.garage', {
      confirm: true,
      deviceClassIcon: true,
      stateLabels: { onLabel: 'Brewing', offLabel: 'Idle' },
      showLastChanged: true,
    })

    expect(screen.getByText('Test Entity')).toBeInTheDocument()
    expect(screen.getByText('TRIGGERED')).toBeInTheDocument()
    expect(iconClass(container)).toContain('lucide-zap')
  })
})
