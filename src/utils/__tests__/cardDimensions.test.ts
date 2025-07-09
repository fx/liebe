import { describe, it, expect } from 'vitest'
import { getDefaultCardDimensions } from '../cardDimensions'
import { CameraCard } from '../../components/CameraCard'
import { LightCard } from '../../components/LightCard'
import { WeatherCard } from '../../components/WeatherCard'
import { ClimateCard } from '../../components/ClimateCard'
import { ButtonCard } from '../../components/ButtonCard'
import { Separator } from '../../components/Separator'
import { TextCard } from '../../components/TextCard'

describe('cardDimensions', () => {
  describe('getDefaultCardDimensions', () => {
    it('should return 4x2 dimensions for camera entities from CameraCard component', () => {
      const dimensions = getDefaultCardDimensions('camera.front_door')
      expect(dimensions).toEqual({ width: 4, height: 2 })
      expect(dimensions).toEqual(CameraCard.defaultDimensions)
    })

    it('should return 3x3 dimensions for climate entities from ClimateCard component', () => {
      const dimensions = getDefaultCardDimensions('climate.living_room')
      expect(dimensions).toEqual({ width: 3, height: 3 })
      expect(dimensions).toEqual(ClimateCard.defaultDimensions)
    })

    it('should return 4x3 dimensions for weather entities from WeatherCard component', () => {
      const dimensions = getDefaultCardDimensions('weather.home')
      expect(dimensions).toEqual({ width: 4, height: 3 })
      expect(dimensions).toEqual(WeatherCard.defaultDimensions)
    })

    it('should return 2x1 dimensions for switch entities from ButtonCard component', () => {
      const dimensions = getDefaultCardDimensions('switch.kitchen_light')
      expect(dimensions).toEqual({ width: 2, height: 1 })
      expect(dimensions).toEqual(ButtonCard.defaultDimensions)
    })

    it('should return 2x1 dimensions for input_boolean entities', () => {
      const dimensions = getDefaultCardDimensions('input_boolean.guest_mode')
      expect(dimensions).toEqual({ width: 2, height: 1 })
    })

    it('should return 2x2 dimensions for light entities from LightCard component', () => {
      const dimensions = getDefaultCardDimensions('light.bedroom')
      expect(dimensions).toEqual({ width: 2, height: 2 })
      expect(dimensions).toEqual(LightCard.defaultDimensions)
    })

    it('should return 2x2 dimensions for unknown entity types', () => {
      const dimensions = getDefaultCardDimensions('unknown.something')
      expect(dimensions).toEqual({ width: 2, height: 2 })
    })
  })

  describe('special card dimensions', () => {
    it('should have 4x1 dimensions for separator cards', () => {
      expect(Separator.defaultDimensions).toEqual({ width: 4, height: 1 })
    })

    it('should have 3x2 dimensions for text cards', () => {
      expect(TextCard.defaultDimensions).toEqual({ width: 3, height: 2 })
    })
  })
})
