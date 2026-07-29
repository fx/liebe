import { Flex } from '@radix-ui/themes'
import {
  IconDeviceSpeaker,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconPower,
} from '@tabler/icons-react'
import { memo, useCallback, useMemo, useState } from 'react'
import { useEntity, useServiceCall } from '~/hooks'
import { useDashboardStore } from '~/store'
import { readMediaPlayerOptions } from '~/store/mediaPlayerOptions'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import type { ResolvedCardAction } from '~/store/cardActions'
import { SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { Pill, PillGroup } from '../anatomy'
import { useCardItem } from '../cardItemContext'
import { readMediaPlayerFeatures, type MediaPlayerAttributes } from './features'
import {
  isMediaActive,
  resolveArtworkPresentation,
  resolveArtworkUrl,
  resolveMediaColor,
  resolveMediaPrimaryAction,
  resolveMediaStateLine,
  shouldCollapseIdle,
  type MediaPrimaryService,
} from './presentation'
import './MediaPlayerCard.css'

interface MediaPlayerCardProps {
  entityId: string
  tier?: CardTier
  /**
   * Consulted because the tier is lossy here in a way it is not for most cards:
   * the option doc gives `row` two forms, and the wide one at ≥4 columns carries
   * the full transport cluster while the compact one carries a single
   * play/pause. Both are `row` for every other rule.
   */
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

/** The column count at which `row` becomes the option doc's "full transport row". */
const WIDE_ROW_COLUMNS = 4

/** What each resolved primary service looks like on the play/pause button. */
const PRIMARY_GLYPH: Readonly<Record<MediaPrimaryService, typeof IconPlayerPlay>> = {
  turn_on: IconPower,
  media_pause: IconPlayerPause,
  media_play: IconPlayerPlay,
}

/** How each resolved primary service names itself to a screen reader. */
const PRIMARY_LABEL: Readonly<Record<MediaPrimaryService, string>> = {
  turn_on: 'Turn on',
  media_pause: 'Pause',
  media_play: 'Play',
}

function MediaPlayerCardComponent({
  entityId,
  tier = 'row',
  span,
  onDelete,
  isSelected = false,
  onSelect,
}: MediaPlayerCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  /*
   * Every command this card issues is non-idempotent in the way the guarded path
   * exists for: a retried `media_next_track` skips two tracks, and a repeated
   * `media_pause` that arrives after the player has resumed pauses it again. So
   * the card dispatches through `dispatchGuarded` exclusively — never
   * `callService` (docs/specs/entity-cards/options/common.md — "Dispatch
   * guarantees"; docs/changes/0023).
   */
  const { loading: isLoading, error, dispatchGuarded, clearError } = useServiceCall()
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'

  const { config } = useCardItem()
  const options = useMemo(() => readMediaPlayerOptions(config), [config])

  /*
   * Whether the artwork URL this card is currently holding failed to load.
   *
   * `entity_picture` is a live handle to a media session, not a stable asset: it
   * 404s for a track whose art has expired, and it changes on every track. So
   * the failure is remembered per URL and dropped the moment the URL changes —
   * a previous-value guard during render rather than an effect, which is this
   * repo's pattern (`CoverCard`, `InputNumberCard`) and what
   * `react-hooks/set-state-in-effect` requires. Remembering it without the
   * reset would leave the icon showing for the rest of the session; not
   * remembering it at all would loop a broken image request per render.
   */
  const artworkUrl = resolveArtworkUrl(entity?.attributes as MediaPlayerAttributes | undefined)
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | undefined>(undefined)
  const [prevArtworkUrl, setPrevArtworkUrl] = useState(artworkUrl)
  if (artworkUrl !== prevArtworkUrl) {
    setPrevArtworkUrl(artworkUrl)
    setFailedArtworkUrl(undefined)
  }

  const attributes = entity?.attributes as MediaPlayerAttributes | undefined
  const state = entity?.state ?? 'unknown'
  const features = useMemo(() => readMediaPlayerFeatures(attributes), [attributes])

  /*
   * One resolver, consulted twice: here for the body tap and below for the
   * transport's play/pause button. The option doc requires exactly this — "the
   * same precedence order as the primary action, sharing one resolver so body
   * tap and button never diverge for the same state" — which is also why the
   * button is absent precisely where the tap is inert.
   */
  const primaryService = resolveMediaPrimaryAction(state, features)

  const dispatch = useCallback(
    (service: string) => {
      if (error) clearError()
      void dispatchGuarded({ domain: 'media_player', service, entityId })
    },
    [clearError, dispatchGuarded, entityId, error]
  )

  /**
   * The card's toggle semantics, which the shell calls when a gesture resolves
   * to `toggle`. Inert when the precedence table yields nothing — a tap that
   * cannot mean anything must not error and must not guess.
   */
  const handlePrimary = useCallback(() => {
    if (!primaryService) return
    dispatch(primaryService)
  }, [dispatch, primaryService])

  const handlePrevious = useCallback(() => dispatch('media_previous_track'), [dispatch])
  const handleNext = useCallback(() => dispatch('media_next_track'), [dispatch])

  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard tier={tier} showIcon={true} lines={2} showButton={true} />
  }

  /*
   * Disconnected. The `!entity` half narrows the type rather than naming a
   * second case: an entity missing while the connection is up is the skeleton
   * above, because `useEntity` cannot tell "not loaded yet" from "does not
   * exist".
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

  if (state === 'unavailable') {
    return (
      <GridCard
        domain="media_player"
        tier={tier}
        isUnavailable={true}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
      >
        <Flex direction="column" align="center" justify="center" gap="2">
          <GridCard.Title>{entity.attributes.friendly_name || entity.entity_id}</GridCard.Title>
          <GridCard.Status>UNAVAILABLE</GridCard.Status>
        </Flex>
      </GridCard>
    )
  }

  const friendlyName = (entity.attributes.friendly_name as string) || entity.entity_id
  const stateLine = resolveMediaStateLine(state, attributes, friendlyName)
  const isActive = isMediaActive(state)
  const stateColor = resolveMediaColor(state)

  /*
   * The minimal idle presentation (option doc — `collapseWhenIdle`): icon
   * circle, name and state line, and nothing else. It suppresses *content*, not
   * the tile: the grid span and therefore the tier are untouched, so a 2×2 card
   * stays 2×2 and its neighbours never reflow when a speaker goes quiet.
   */
  const isCollapsed = shouldCollapseIdle(state, options.collapseWhenIdle)

  /*
   * Artwork, re-evaluated per render because it comes and goes with the media
   * session. `background` degrades to `thumbnail` here — the full-bleed form is
   * change 0023 PR 2 — and the icon circle stands in whenever there is no
   * artwork, `artworkMode: none` was chosen, the collapsed presentation applies,
   * or the image failed to load. That last case is why the fallback cannot be a
   * one-time decision about the attribute.
   */
  const artworkPresentation = resolveArtworkPresentation(options.artworkMode, tier)
  const showArtwork =
    !isCollapsed &&
    artworkPresentation === 'thumbnail' &&
    artworkUrl !== undefined &&
    artworkUrl !== failedArtworkUrl

  const lead = showArtwork ? (
    <img
      className="liebe-media-artwork"
      src={artworkUrl}
      /*
       * Empty rather than descriptive, with the name and state line beside it
       * carrying the meaning: the artwork is decoration for information already
       * in the DOM, and "Album art" announced before every track title is noise.
       */
      alt=""
      onError={() => setFailedArtworkUrl(artworkUrl)}
    />
  ) : (
    <GridCard.Icon>
      <IconDeviceSpeaker size={20} />
    </GridCard.Icon>
  )

  /*
   * What each tier carries (option doc — "Tier layouts"), omission never
   * clipping (docs/specs/design-system — "Size-adaptive layouts"):
   *
   *   glance  artwork/icon + name + compact state line, stacked. No embedded
   *           controls — the tile's own action carries operability here.
   *   row     artwork/icon + title/artist stack + a single play/pause button.
   *           At ≥4 wide the full prev / play-pause / next cluster appears.
   *   tall    not specified for this card: it renders the `glance` layout with
   *           the extra height absorbed by centring, which is what the `stack`
   *           arrangement already does.
   *   full    the row content plus the transport cluster beneath it.
   *
   * Volume, the source picker and the progress bar are change 0023 PR 2 and are
   * absent from every tier here rather than stubbed.
   */
  const isWideRow = (span?.width ?? 0) >= WIDE_ROW_COLUMNS
  /*
   * The collapsed presentation is "icon circle + name + state line only", which
   * is the `glance` meta at whatever tier the grid handed down — so it takes the
   * single-line form even at `row` and `full`. Without this, an idle player that
   * still carries the last track's `media_title` would keep announcing that
   * track as its name line, which is the opposite of what collapsing is for.
   */
  const isSplitMeta = !isCollapsed && (tier === 'row' || tier === 'full')
  const showTransport =
    options.showTransport && !isCollapsed && !isEditMode && (tier === 'row' || tier === 'full')
  const showFullCluster = tier === 'full' || isWideRow

  const meta = (
    <GridCard.Meta>
      {/*
       * `glance` and `tall` take the compact line; `row` and `full` give the
       * track its own line above the artist. `primary` is the track title when
       * there is one and the entity name when there is not, so a receiver with
       * no media session renders as the ordinary name-over-state card rather
       * than as a bare "on" (see `resolveMediaStateLine`).
       *
       * KNOWN DEVIATION, for change 0023 PR 3: the option doc says `hideName`
       * applies "to the entity name, not the track title". The shell has one
       * name slot and applies `hideName` to it, so with a track playing
       * `hideName` hides the title line too. Expressing the doc's rule needs a
       * second, non-name line in the anatomy — a change to the shared contract
       * rather than to this card, which is why it is recorded here rather than
       * worked around locally.
       */}
      <GridCard.Title>{isSplitMeta ? stateLine.primary : friendlyName}</GridCard.Title>
      <GridCard.Status>
        {error ? 'ERROR' : isSplitMeta ? stateLine.secondary : stateLine.line}
      </GridCard.Status>
    </GridCard.Meta>
  )

  /*
   * The transport cluster. Each button is gated on its own feature bit and is
   * *omitted* rather than disabled when unsupported — "a receiver with no track
   * concept shows only play/pause" (option doc). The play/pause button is
   * omitted exactly when the body tap is inert, because both ask the one
   * resolver.
   *
   * Anatomy pills rather than Radix buttons, for the reason the cover card
   * records: a Radix `color` prop keeps its hue when a theme remaps the domain's
   * triplet. `Pill` consumes its own click, so a tap on one never reaches the
   * tile's `tapAction` (option doc — transport buttons are embedded controls).
   */
  const transport = (
    <GridCard.Controls>
      <PillGroup label="Media controls">
        {showFullCluster && features.previousTrack && (
          <Pill
            domain="media_player"
            color={stateColor}
            label="Previous track"
            hideLabel
            icon={<IconPlayerTrackPrev size={18} />}
            onClick={handlePrevious}
            disabled={isLoading}
          />
        )}
        {primaryService && (
          <Pill
            domain="media_player"
            color={stateColor}
            active={isActive}
            label={PRIMARY_LABEL[primaryService]}
            hideLabel
            icon={(() => {
              const Glyph = PRIMARY_GLYPH[primaryService]
              return <Glyph size={18} />
            })()}
            onClick={handlePrimary}
            disabled={isLoading}
          />
        )}
        {showFullCluster && features.nextTrack && (
          <Pill
            domain="media_player"
            color={stateColor}
            label="Next track"
            hideLabel
            icon={<IconPlayerTrackNext size={18} />}
            onClick={handleNext}
            disabled={isLoading}
          />
        )}
      </PillGroup>
    </GridCard.Controls>
  )

  /*
   * `row` puts the transport in the control slot at the trailing edge; `full`
   * puts it underneath, where the option doc stacks the control block. `glance`
   * and `tall` pass neither, which is how a tier omits content rather than
   * hiding it.
   */
  const inRowControl = showTransport && tier === 'row' ? transport : undefined
  const inFullExtra = showTransport && tier === 'full' ? transport : undefined

  /*
   * A tap resolves to this card's own primary handler when the precedence table
   * yields a service, and to nothing at all when it does not — `none` rather
   * than `more-info`, because the doc resolves the off-without-`TURN_ON` case as
   * inert and keeps hold as the details gesture.
   */
  const defaultAction: ResolvedCardAction = primaryService ? 'toggle' : 'none'

  return (
    <GridCard
      domain="media_player"
      color={stateColor}
      tier={tier}
      isLoading={isLoading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      isOn={isActive}
      /*
       * Passed rather than left to the placed-item context: the shell needs an
       * entity to open the detail dialog that `holdAction: more-info` resolves
       * to, and a card rendered outside a grid — a story, the configuration
       * preview — would otherwise have a hold gesture that resolves to nothing.
       */
      entityId={entityId}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      onClick={handlePrimary}
      defaultAction={defaultAction}
      title={error || undefined}
      className="media-player-card"
    >
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        lead={lead}
        meta={meta}
        control={inRowControl}
        extra={inFullExtra}
      />
    </GridCard>
  )
}

const MemoizedMediaPlayerCard = memo(MediaPlayerCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.tier === nextProps.tier &&
    /*
     * By value, not identity: the grid builds a fresh `{width, height}` for
     * every item on every render, so an identity check would report a change on
     * each pass and defeat this memo. The span has to be compared at all
     * because this card keys on width past a tier boundary — a `row` at four
     * columns carries more than a `row` at two.
     */
    prevProps.span?.width === nextProps.span?.width &&
    prevProps.span?.height === nextProps.span?.height &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})

export const MediaPlayerCard = Object.assign(MemoizedMediaPlayerCard, {
  /*
   * 2×2 — the `full` tier, which is the layout the option doc calls the
   * showcase and the smallest one that carries artwork, meta and transport at
   * once.
   */
  defaultDimensions: { width: 2, height: 2 },
})
