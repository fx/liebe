import { Text } from '@radix-ui/themes'
import { memo, useCallback, useMemo, useState } from 'react'
import { useEntity } from '~/hooks'
import { readCardDisplay } from '~/store/cardDisplay'
import { getIcon } from '~/utils/iconList'
import { readPersonOptions } from '~/store/personOptions'
import type { GridItem } from '~/store/types'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { useRelativeSince } from '../ButtonCard/lastChanged'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { ErrorBoundary, SkeletonCard, ErrorDisplay } from '../ui'
import { useCardItem } from '../cardItemContext'
import { PersonAvatar } from './PersonAvatar'
import {
  resolveAvatarHue,
  resolvePersonInitials,
  resolvePersonPicture,
  resolvePersonPresence,
  resolveZoneLabel,
  zoneEntityIdForState,
} from './presentation'

interface PersonCardProps {
  entityId: string
  tier?: CardTier
  /**
   * The effective grid span behind `tier`. Accepted so any renderer can hand a
   * card the pair `CardProps` defines. This card reads only the tier — it has no
   * width-dependent detail — but the memo comparator still watches it, so one
   * that later grows a distance readout is not pinned to a stale span.
   */
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  /**
   * The placed item, read for its stored options. Configuration belongs to the
   * grid, which publishes an `onConfigure` on the card item context and owns the
   * modal — so this card grows no modal of its own, like the action and media
   * families.
   */
  item?: GridItem
  config?: Record<string, unknown>
}

/**
 * The tiers that carry the `showLastChanged` duration.
 *
 * `glance` has no room for a third line and `tall` is specified as avatar-over-
 * name with no secondary metadata, so the option is a `row`/`full` one — which
 * is also the gate on the timer: `useRelativeSince` is asked for the text only
 * where it will be rendered, so three quarters of the tiers pay for no interval
 * (option doc — `showLastChanged`).
 */
const SINCE_TIERS: readonly CardTier[] = ['row', 'full']

function PersonCardComponent({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
}: PersonCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)

  const { config } = useCardItem()
  const options = useMemo(() => readPersonOptions(config), [config])
  const display = readCardDisplay(config)

  const state = entity?.state ?? 'unknown'
  const presence = resolvePersonPresence(state)

  /*
   * The zone entity behind a zone state. Subscribed unconditionally —
   * `useEntity('')` reads an absent key and never subscribes, so a person at
   * home costs nothing and the hook order stays fixed wherever they are.
   */
  const zoneEntityId = zoneEntityIdForState(state)
  const { entity: zoneEntity } = useEntity(zoneEntityId)

  /*
   * Whether the photo this card is currently holding failed to load.
   *
   * `entity_picture` is a relative Home Assistant path, and it 404s for a person
   * whose photo was deleted or whose instance is only partly reachable. The
   * failure is remembered per URL and dropped the moment the URL changes — a
   * previous-value guard during render rather than an effect, which is this
   * repo's pattern (`MediaPlayerCard`, `CoverCard`) and what
   * `react-hooks/set-state-in-effect` requires. Remembering it without the reset
   * would leave the initials showing for the rest of the session after the user
   * uploaded a new photo; not remembering it at all would loop a broken image
   * request per render.
   */
  const picture = resolvePersonPicture(entity)
  const [failedPicture, setFailedPicture] = useState<string | undefined>(undefined)
  const [prevPicture, setPrevPicture] = useState(picture)
  if (picture !== prevPicture) {
    setPrevPicture(picture)
    setFailedPicture(undefined)
  }

  const since = useRelativeSince(
    entity?.last_changed,
    options.showLastChanged && SINCE_TIERS.includes(tier)
  )

  /**
   * This card's toggle semantics: open the details, because there is nothing to
   * toggle.
   *
   * Omitting the handler is NOT the same as passing this one. The shell's rule
   * for a family with no toggle of its own is to fall back to
   * `homeassistant.toggle` on the entity — which forwards to `person.toggle`, a
   * service the person platform does not register, so it leaves the panel and
   * accomplishes nothing. That erroring tap is precisely what the change
   * document cites as the reason registering this domain is a bugfix rather than
   * a new control surface; inheriting it through the configured route would fix
   * the default and leave the defect one option away.
   *
   * Returning `'more-info'` rather than doing nothing is what makes a configured
   * `tapAction: toggle` land where every other route on this card lands. The
   * card *requests* the resolution; the shell owns the dialog and performs it.
   * That is the whole of this card's toggle contract, so it is stated once here
   * rather than guarded per gesture.
   *
   * Passed unconditionally rather than withheld, per the shell's contract.
   */
  const handleToggle = useCallback((): 'more-info' => 'more-info', [])

  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard tier={tier} showIcon={true} lines={2} />
  }

  /*
   * The one error state this read-only card can reach: a missing entity on a
   * live connection returns at the skeleton above, so everything here is a
   * disconnection.
   */
  if (!entity || !isConnected) {
    return (
      <ErrorDisplay
        error="Disconnected from Home Assistant"
        variant="card"
        tier={tier}
        title="Disconnected"
        onRetry={() => window.location.reload()}
      />
    )
  }

  const friendlyName = entity.attributes.friendly_name || entity.entity_id
  const isUnavailable = state === 'unavailable'

  /*
   * The state line. `unavailable` says so instead of "Unknown", because a person
   * whose entity is disconnected and a person whose location is indeterminate
   * are different facts and the option doc requires them to stay
   * distinguishable — the hollow dot is what the two have in common, not the
   * text.
   */
  const stateLine = isUnavailable ? 'UNAVAILABLE' : resolveZoneLabel(state, zoneEntity)

  const avatar = (
    <PersonAvatar
      picture={picture && picture !== failedPicture ? picture : undefined}
      initials={resolvePersonInitials(entityId, entity.attributes.friendly_name)}
      hue={resolveAvatarHue(entityId)}
      presence={presence}
      hasIconOverride={!!display.icon && !!getIcon(display.icon)}
      onPictureError={() => setFailedPicture(picture)}
    />
  )

  /*
   * `showZone: false` omits the state line entirely — the badge dot carries
   * presence alone. `hideState` reaches the same result by a different route:
   * `GridCard.Status` drops itself when the universal option is set, which is
   * what makes "hideState wins" true without this card re-deciding it.
   */
  const meta = (
    <GridCard.Meta>
      <GridCard.Title>{friendlyName}</GridCard.Title>
      {options.showZone && <GridCard.Status>{stateLine}</GridCard.Status>}
    </GridCard.Meta>
  )

  /*
   * How long they have been there, as trailing secondary text. The `control`
   * slot is a position rather than a promise that something interactive lives
   * in it (`CardBody`), and on a card with nothing to operate it is where the
   * tier table puts this line.
   */
  const sinceLine = since ? (
    <Text size="1" color="gray" data-testid="person-since">
      {since}
    </Text>
  ) : undefined

  /*
   * What each tier carries (option doc — "Tier layouts"). Omission, never
   * clipping:
   *
   *   glance  avatar + name + zone, stacked. No duration — no room for a third
   *           line, and the whole tile is the primary action.
   *   row     avatar + meta, with the duration trailing.
   *   tall    avatar on top, meta at the bottom, nothing between them. The
   *           default `tall` arrangement puts the control slot in the middle,
   *           and passing none is how this card leaves it empty.
   *   full    the row layout, vertically centred, and deliberately nothing more:
   *           zone history and distance-to-home are open questions with no data
   *           source, so `full` stays calm rather than inventing content.
   */
  return (
    <GridCard
      domain="person"
      color="default"
      tier={tier}
      isLoading={false}
      isError={false}
      isStale={isStale}
      isSelected={isSelected}
      isOn={presence === 'home'}
      isUnavailable={isUnavailable}
      entityId={entityId}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      /*
       * Read-only card: a person cannot be controlled, so `tapAction: default`
       * resolves to `more-info` rather than to a control action, and no
       * interaction here dispatches a service (option doc — "Primary action").
       */
      defaultAction="more-info"
      onClick={handleToggle}
      className="person-card"
    >
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        lead={avatar}
        meta={meta}
        control={sinceLine}
      />
    </GridCard>
  )
}

const MemoizedPersonCard = memo(PersonCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.tier === nextProps.tier &&
    prevProps.span?.width === nextProps.span?.width &&
    prevProps.span?.height === nextProps.span?.height &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})

/*
 * The card's own error boundary, following the media player and the weather
 * variants and AGENTS.md ("Entity Card Registration").
 *
 * Not redundant with `GridView`'s `EntityErrorBoundary`, which covers only the
 * dashboard path. This card is also rendered directly: a story, the
 * configuration preview, a card handed a literal `entityId`. Nothing sits above
 * it there, so a throw during render takes the whole tree rather than one tile.
 *
 * Outside the memo rather than inside it. The boundary is a plain wrapper whose
 * own render costs nothing, and keeping `memo` closest to the content leaves the
 * comparator doing exactly what it did before — including the by-value span
 * check the grid depends on, which an extra memo layer would have made
 * ambiguous.
 */
function PersonCardWithBoundary(props: PersonCardProps) {
  return (
    <ErrorBoundary>
      <MemoizedPersonCard {...props} />
    </ErrorBoundary>
  )
}

export const PersonCard = Object.assign(PersonCardWithBoundary, {
  /*
   * 2×1 — the `row` tier, which is the smallest one carrying everything this
   * card has: avatar, name, zone and the duration. `full` is specified to render
   * the same content vertically centred until zone history and distance exist,
   * so defaulting to 2×2 would hand every placed person half a tile of
   * deliberate emptiness.
   */
  defaultDimensions: { width: 2, height: 1 },
})
