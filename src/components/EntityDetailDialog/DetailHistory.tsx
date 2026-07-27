import { Box, Heading, Skeleton } from '@radix-ui/themes'
import { Sparkline } from '../anatomy'
import { useEntityHistory } from '~/hooks/useEntityHistory'
import { DEFAULT_HISTORY_HOURS } from '~/services/historyData'

/**
 * The window the dialog graphs — the pipeline's own default, taken from the
 * pipeline rather than restated. The label has to name the window, and a local
 * copy would keep naming `24` after the canonical default moved: the request
 * and the accessible label would then describe different windows, silently, and
 * the label is all a screen-reader user has to go on.
 */
const HISTORY_HOURS = DEFAULT_HISTORY_HOURS

/**
 * Height of the graph area. The skeleton below fills the same box, so the
 * section occupies its final height from the first render and the attribute
 * list underneath does not jump when history arrives.
 */
const GRAPH_HEIGHT = '96px'

export interface DetailHistoryProps {
  entityId: string
}

/**
 * The detail dialog's history graph — the recent window of an entity's readings,
 * drawn through the sparkline anatomy so a theme restyles it exactly as it
 * restyles the same graph on a card
 * (docs/specs/design-system/index.md — "Card anatomy").
 *
 * Numeric entities only, and the judgement of what counts as numeric is NOT
 * made here: `useEntityHistory` resolves a non-numeric entity to `unsupported`
 * from its live state, before it costs a request
 * (docs/specs/entity-state/index.md — "Entity History"). A second opinion in the
 * dialog would eventually disagree with the service's.
 *
 * The whole section is absent — heading included — when there is nothing to
 * graph: `unsupported`, because the entity will never have a series, and on
 * error, because history failures are non-fatal by contract and the consumer
 * "renders without a graph". Neither renders an empty frame or an apology. A
 * failed refetch therefore takes an already-drawn graph off screen rather than
 * leaving a stale window standing with no sign that it stopped moving; the
 * samples survive in the cache, so the next successful fetch brings the graph
 * back without a gap.
 */
export function DetailHistory({ entityId }: DetailHistoryProps) {
  const { values, isLoading, error, unsupported } = useEntityHistory(entityId, {
    hours: HISTORY_HOURS,
  })

  if (unsupported || error !== null) return null

  return (
    <Box data-testid="detail-history">
      <Heading size="2" mb="1">
        History
      </Heading>
      <Box height={GRAPH_HEIGHT} data-testid="detail-history-graph">
        {isLoading && values.length === 0 ? (
          // Radix's skeleton, the same loading convention the cards use, sized
          // to the graph it stands in for. A refetch that already has samples
          // keeps drawing them instead: the spec's refetch "never blanks what is
          // already on screen".
          <Skeleton height="100%" data-testid="detail-history-skeleton" />
        ) : (
          <Sparkline
            // The dialog is domain-agnostic chrome and has none of the state a
            // card resolves its triplet from, so the graph takes the generic
            // active colour. The part neutralises itself when there is no
            // series, so an empty window does not draw a saturated baseline.
            domain={entityId.split('.')[0]}
            active
            values={values}
            label={`${HISTORY_HOURS}-hour history`}
          />
        )}
      </Box>
    </Box>
  )
}
