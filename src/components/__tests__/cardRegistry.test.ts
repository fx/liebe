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
import { WeatherCardMinimal } from '../WeatherCard/WeatherCardMinimal'
import { WeatherCardModern } from '../WeatherCard/WeatherCardModern'
import { WeatherCardDetailed } from '../WeatherCard/WeatherCardDetailed'

describe('cardRegistry', () => {
  it('resolves a card by domain and by entity id', () => {
    expect(getCardForDomain('weather')).toBe(WeatherCard)
    expect(getCardForEntity('weather.home')).toBe(WeatherCard)
    expect(getCardForEntity('media_player.tv')).toBeUndefined()
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
      registerCardVariant('media_player', 'compact', () => null)

      expect(getCardVariants('media_player')).toEqual([])
    })
  })
})
