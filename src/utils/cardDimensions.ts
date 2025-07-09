export interface CardDimensions {
  width: number
  height: number
}

import { CameraCard } from '../components/CameraCard'
import { LightCard } from '../components/LightCard'
import { WeatherCard } from '../components/WeatherCard'
import { ClimateCard } from '../components/ClimateCard'
import { ButtonCard } from '../components/ButtonCard'
import { CoverCard } from '../components/CoverCard'
import { FanCard } from '../components/FanCard'
import { SensorCard } from '../components/SensorCard'
import { BinarySensorCard } from '../components/BinarySensorCard'
import { InputBooleanCard } from '../components/InputBooleanCard'

type CardWithDimensions = {
  defaultDimensions?: CardDimensions
}

const domainToCard: Record<string, CardWithDimensions> = {
  camera: CameraCard,
  light: LightCard,
  weather: WeatherCard,
  climate: ClimateCard,
  switch: ButtonCard,
  cover: CoverCard,
  fan: FanCard,
  sensor: SensorCard,
  binary_sensor: BinarySensorCard,
  input_boolean: InputBooleanCard,
}

export function getDefaultCardDimensions(entityId: string): CardDimensions {
  const domain = entityId.split('.')[0]

  const cardComponent = domainToCard[domain]
  if (cardComponent?.defaultDimensions) {
    return cardComponent.defaultDimensions
  }

  return { width: 2, height: 2 }
}
