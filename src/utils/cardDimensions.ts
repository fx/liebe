export interface CardDimensions {
  width: number
  height: number
}

import { getCardForDomain } from '../components/cardRegistry'

export function getDefaultCardDimensions(entityId: string): CardDimensions {
  const domain = entityId.split('.')[0]

  const cardComponent = getCardForDomain(domain)
  if (cardComponent?.defaultDimensions) {
    return cardComponent.defaultDimensions
  }

  return { width: 2, height: 2 }
}
