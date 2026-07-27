import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, type CardArrangement } from '../CardBody'
import { StillImageFallback } from './StillImageFallback'
import type { HomeAssistantState } from '../../contexts/HomeAssistantContext'
import './CameraCard.css'

/**
 * The degraded tile: a still thumbnail instead of a live feed.
 *
 * Below 2×2 a camera card mounts no stream at all — a feed squeezed into a 1×1
 * tile is illegible, and the design system's rule for content that does not fit
 * is to omit it rather than clip it. What stands in is the same
 * `entity_picture` snapshot (and the same refresh cadence) the still-image
 * fallback already owns, so there is exactly one snapshot mechanism in the card.
 *
 * The name and state go through the shell's own `GridCard.Title`/`Status`
 * slots rather than into a gradient, which is what makes `hideName`/`hideState`
 * apply here for free — including the image-only tile both of them hidden
 * leaves, which the tier table requires to stay a valid layout.
 */

export interface CameraThumbnailTileProps {
  entity: HomeAssistantState
  name: string
  /** The entity's state, already sentence-cased (`cameraStateText`). */
  state: string
  arrangement: CardArrangement
  /** Whether this tier has room for the state line beside the name. */
  showState: boolean
}

export function CameraThumbnailTile({
  entity,
  name,
  state,
  arrangement,
  showState,
}: CameraThumbnailTileProps) {
  return (
    <CardBody
      arrangement={arrangement}
      lead={
        <div className="camera-thumb" data-arrangement={arrangement}>
          <StillImageFallback entity={entity} objectFit="cover" />
        </div>
      }
      meta={
        <GridCard.Meta>
          <GridCard.Title>{name}</GridCard.Title>
          {/* Omitted, not hidden: the tier that has no room for the line does
              not render it at all (docs/specs/design-system — "Size-adaptive
              layouts"). `hideState` is applied by the slot itself. */}
          {showState && <GridCard.Status>{state}</GridCard.Status>}
        </GridCard.Meta>
      }
    />
  )
}
