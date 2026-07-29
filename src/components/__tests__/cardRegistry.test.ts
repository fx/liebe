import { describe, it, expect, afterEach } from 'vitest'
import {
  domainToCard,
  getCardForDomain,
  getCardForEntity,
  getCardVariant,
  getCardVariants,
  registerCardVariant,
} from '../cardRegistry'
import { WeatherCard } from '../WeatherCard'
import { ActionCard } from '../ActionCard'
import { ACTION_CARD_DOMAINS } from '../ActionCard/actions'
import { WeatherCardMinimal } from '../WeatherCard/WeatherCardMinimal'
import { WeatherCardModern } from '../WeatherCard/WeatherCardModern'
import { WeatherCardDetailed } from '../WeatherCard/WeatherCardDetailed'

describe('cardRegistry', () => {
  it('resolves a card by domain and by entity id', () => {
    expect(getCardForDomain('weather')).toBe(WeatherCard)
    expect(getCardForEntity('weather.home')).toBe(WeatherCard)
    // `siren` stands in for "a domain with no card of its own", which is what
    // this asserts. It used to be `media_player`, until change 0023 gave that
    // domain a card — the example has to be a domain no change has mapped.
    expect(getCardForEntity('siren.klaxon')).toBeUndefined()
  })

  /**
   * The action family is four registry entries pointing at one component
   * (docs/changes/0027). Asserted here because the registry is what actually
   * fixes the live defect: these domains fall through to `ButtonCard` without
   * these entries, and `ButtonCard` dispatches `<domain>.toggle` — a service
   * Home Assistant does not have for three of the four.
   */
  it.each(['scene', 'script', 'button', 'input_button'])(
    'routes %s to the action card rather than the fallback',
    (domain) => {
      expect(getCardForDomain(domain)).toBe(ActionCard)
      expect(getCardForEntity(`${domain}.thing`)).toBe(ActionCard)
    }
  )

  it('registers every domain the action family claims to serve', () => {
    // The map in `ActionCard/actions.ts` and the registry have to agree: a
    // domain with an action but no entry never reaches the card, and one with an
    // entry but no action renders a card that cannot dispatch.
    for (const domain of ACTION_CARD_DOMAINS) {
      expect(getCardForDomain(domain)).toBe(ActionCard)
    }
  })

  describe('weather variants', () => {
    it('are available without the card ever rendering', () => {
      // The variants are attached to the component statically, so a consumer
      // that only ever asks the registry (the entity browser, card config)
      // sees them before the first WeatherCard mounts. Registering them from
      // inside the component instead required `WeatherCard` to import
      // `cardRegistry`, which closed a circular import.
      expect(getCardVariants('weather').sort()).toEqual(['detailed', 'minimal', 'modern'])
      expect(getCardVariant('weather', 'minimal')).toBe(WeatherCardMinimal)
      expect(getCardVariant('weather', 'modern')).toBe(WeatherCardModern)
      expect(getCardVariant('weather', 'detailed')).toBe(WeatherCardDetailed)
    })

    it('does not report a variant the card never declared', () => {
      expect(getCardVariant('weather', 'nope')).toBeUndefined()
    })
  })

  describe('registerCardVariant', () => {
    const registered: Array<[string, string]> = []

    afterEach(() => {
      for (const [domain, name] of registered.splice(0)) {
        delete domainToCard[domain]?.variants?.[name]
      }
    })

    it('adds a variant to a registered card', () => {
      const Variant = () => null
      registerCardVariant('sensor', 'compact', Variant)
      registered.push(['sensor', 'compact'])

      expect(getCardVariant('sensor', 'compact')).toBe(Variant)
    })

    it('ignores a domain that has no card', () => {
      registerCardVariant('siren', 'compact', () => null)

      expect(getCardVariants('siren')).toEqual([])
    })
  })
})
