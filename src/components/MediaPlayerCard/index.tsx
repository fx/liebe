import { Box, Flex, Select, Text } from '@radix-ui/themes'
import {
  IconDeviceSpeaker,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconPower,
  IconVolume,
  IconVolume2,
  IconVolume3,
} from '@tabler/icons-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useEntity, useServiceCall } from '~/hooks'
import { useDashboardStore } from '~/store'
import { ACKNOWLEDGEMENT_TIMEOUT_MS } from '~/store/cardActions'
import { readMediaPlayerOptions } from '~/store/mediaPlayerOptions'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import type { ResolvedCardAction } from '~/store/cardActions'
import { ErrorBoundary, SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { Pill, PillGroup, Slider } from '../anatomy'
import { useCardItem } from '../cardItemContext'
import { readMediaPlayerFeatures, type MediaPlayerAttributes } from './features'
import { formatMediaTime, resolveMediaProgress } from './progress'
import {
  canSelectSource,
  isVolumeMuted,
  nextOptimisticFromDrag,
  optimisticVolumeStillStands,
  percentToVolume,
  readCurrentSource,
  readSourceList,
  readVolumeLevel,
  resolveDisplayVolume,
  resolveVolumePresentation,
  steppedVolume,
  volumeToPercent,
  type OptimisticVolume,
} from './volume'
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

/**
 * How often the extrapolated position is redrawn — "a local ~1s ticker"
 * (docs/changes/0023). A second is the resolution the readout shows, so a faster
 * tick would re-render for a value that cannot change on screen.
 */
const PROGRESS_TICK_MS = 1000

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
    (service: string, data?: Record<string, unknown>) => {
      if (error) clearError()
      return dispatchGuarded({ domain: 'media_player', service, entityId, data })
    },
    [clearError, dispatchGuarded, entityId, error]
  )

  const entityVolume = readVolumeLevel(attributes)

  /*
   * The optimistic volume: one value carrying its own phase.
   *
   * The card shows something the entity has not confirmed, which is the point of
   * an optimistic control and therefore has to be *terminable*. An uncommitted
   * value is a finger on the thumb and always stands; a committed one stands
   * until the entity moves off the baseline recorded when the command went out.
   *
   * Deliberately NOT a separate drag latch plus a pending value. Radix fires
   * `onValueCommit` **before** `onValueChange` for keyboard adjustment (measured,
   * not assumed), so a commit that cleared a drag latch would have it re-set by
   * the trailing change and the card would never reconcile again — the thumb
   * would sit at the last arrow-key value forever.
   */
  const [optimisticVolume, setOptimisticVolume] = useState<OptimisticVolume | null>(null)

  /*
   * The acknowledgement timeout, in an effect keyed on the value it guards
   * rather than in a ref. The reconciliation below runs *during render*, where a
   * ref may not be touched (`react-hooks/refs`), so a ref-held timer would have
   * to be cancelled somewhere else and the two places could disagree about
   * whether one is pending. Keying the effect on the state makes the timer a
   * function of it: clearing the state cancels the timer through the effect's
   * own cleanup, unmounting does the same, and a fresh commit restarts the
   * window because the value's identity changed.
   *
   * Only for a committed value — a drag has sent nothing, so there is nothing to
   * time out, and a timeout during a slow drag would snap the thumb away.
   */
  useEffect(() => {
    if (!optimisticVolume?.committed) return

    const id = setTimeout(() => setOptimisticVolume(null), ACKNOWLEDGEMENT_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [optimisticVolume])

  /*
   * Reconciled during render with a previous-value guard rather than in an
   * effect — this repo's pattern, and what `react-hooks/set-state-in-effect`
   * requires. Doing it here also drops the stale value a render *earlier* than
   * an effect would, so there is no commit in which the card shows a volume the
   * entity has already contradicted.
   */
  if (optimisticVolume && !optimisticVolumeStillStands(optimisticVolume, entityVolume)) {
    setOptimisticVolume(null)
  }

  /*
   * A card recycled onto another entity drops it, for the reason the cover card
   * records: a drag carried across entities would show the previous player's
   * volume and commit it to the new one.
   */
  const [prevVolumeEntityId, setPrevVolumeEntityId] = useState(entityId)
  if (entityId !== prevVolumeEntityId) {
    setPrevVolumeEntityId(entityId)
    setOptimisticVolume(null)
  }

  const displayVolume = resolveDisplayVolume(entityVolume, optimisticVolume)

  /**
   * Commit a volume, and hold it on screen until the entity answers.
   *
   * The baseline captured here is what makes the hold terminable; capturing it
   * at commit time rather than reading it later is the difference between
   * "the entity has moved since I asked" and "the entity does not match what I
   * asked", and only the first is true reconciliation.
   */
  const commitVolume = async (fraction: number) => {
    setOptimisticVolume({ value: fraction, baseline: entityVolume, committed: true })

    const result = await dispatch('volume_set', { volume_level: fraction })
    // A failed command has no truth coming, so the lie ends now rather than at
    // the timeout.
    if (result && result.success === false) setOptimisticVolume(null)
  }

  /*
   * A value the drag is passing through. The same value the commit just sent is
   * the trailing echo Radix emits after `onValueCommit`, and re-starting an
   * uncommitted drag from it would strip the committed flag off a value already
   * in flight — so an unchanged value is left exactly as it is.
   */
  const handleVolumeChange = (percent: number) => {
    const value = percentToVolume(percent)
    setOptimisticVolume((current) => nextOptimisticFromDrag(current, value, entityVolume))
  }

  const handleVolumeCommit = (percent: number) => void commitVolume(percentToVolume(percent))

  /**
   * A stepper press. `volume_up`/`volume_down` where the entity has them,
   * otherwise a `volume_set` built from the current level — the option doc
   * allows steppers to be made either way, and a player that can be set but not
   * stepped still gets working buttons.
   */
  const handleVolumeStep = (direction: 1 | -1) => {
    if (features.volumeStep) {
      void dispatch(direction === 1 ? 'volume_up' : 'volume_down')
      return
    }
    void commitVolume(steppedVolume(entityVolume ?? 0, direction))
  }

  const isMuted = isVolumeMuted(attributes)
  const handleMute = () => void dispatch('volume_mute', { is_volume_muted: !isMuted })

  const handleSelectSource = (source: string) => void dispatch('select_source', { source })

  const handleSeek = (seconds: number) =>
    void dispatch('media_seek', { seek_position: Math.round(seconds) })

  /*
   * The progress ticker, and the two conditions gating it.
   *
   * It runs only while the entity is `playing` **and** the bar actually renders
   * — `showProgress` on the `full` tier (docs/changes/0023, resolving the option
   * doc's "extrapolation cadence" question). Both halves matter: `media_position`
   * advances whether or not anyone is looking, so a ticker keyed on state alone
   * would re-render every media card on the dashboard once a second for a bar
   * none of them draws.
   *
   * `Date.now()` is state rather than read inline so the re-render is explicit:
   * a component that read the clock during render would show a position that
   * only advanced when something *else* re-rendered it.
   */
  const progressTicks = options.showProgress && tier === 'full' && state === 'playing'

  /*
   * The clock lives in state, and only this effect writes it.
   *
   * Reading `Date.now()` during render would be simpler and is not allowed — the
   * compiler rejects an impure call in a render path (`react-hooks/purity`), and
   * rightly: a component whose output depends on the wall clock cannot be
   * re-rendered reproducibly. Keeping it in state confines the impurity to the
   * two callbacks below, and `resolveMediaProgress` stays pure by taking the
   * value as an argument, which is what makes the arithmetic testable against a
   * fixed clock.
   *
   * Primed on a zero-delay timeout rather than in the effect body, because a
   * synchronous `setState` in an effect is a cascading render
   * (`react-hooks/set-state-in-effect`). The priming matters: a card that has
   * been sitting paused holds a `now` from whenever it last ticked, and without
   * this the first frame after playback resumes would draw the bar short before
   * the first interval corrected it.
   */
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!progressTicks) return

    const priming = setTimeout(() => setNow(Date.now()), 0)
    const ticking = setInterval(() => setNow(Date.now()), PROGRESS_TICK_MS)

    return () => {
      clearTimeout(priming)
      clearInterval(ticking)
    }
  }, [progressTicks])

  /*
   * The seek head under a finger, which suspends the ticker's authority the same
   * way a volume drag suspends the entity's.
   */
  const [seekSeconds, setSeekSeconds] = useState<number | null>(null)

  const handleSeekCommit = (seconds: number) => {
    setSeekSeconds(null)
    handleSeek(seconds)
  }

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
   * session. `background` applies in `full` only and degrades to the thumbnail
   * everywhere else; the icon circle stands in whenever there is no artwork,
   * `artworkMode: none` was chosen, the collapsed presentation applies, or the
   * image failed to load. That last case is why the fallback cannot be a
   * one-time decision about the attribute.
   */
  const artworkPresentation = resolveArtworkPresentation(options.artworkMode, tier)
  const hasArtwork = artworkUrl !== undefined && artworkUrl !== failedArtworkUrl
  const showArtwork = !isCollapsed && artworkPresentation === 'thumbnail' && hasArtwork

  /*
   * Full-bleed artwork behind the whole tile, under a scrim.
   *
   * The scrim is not decoration: overlaying name, track and controls directly on
   * arbitrary album art puts unknown text on an unknown background, and nothing
   * about a cover image guarantees contrast. Same legibility approach as the
   * weather condition backgrounds (option doc — `artworkMode`).
   *
   * The `<img>` is still what loads it, positioned behind the content rather
   * than set as a CSS `background-image`, so the load failure is *observable* —
   * a background-image that 404s reports nothing, and the automatic icon
   * fallback would silently stop working in exactly this mode.
   */
  const showBackgroundArtwork = !isCollapsed && artworkPresentation === 'background' && hasArtwork

  const backgroundArtwork = showBackgroundArtwork ? (
    <div className="liebe-media-backdrop" data-testid="media-backdrop">
      <img
        className="liebe-media-backdrop-image"
        src={artworkUrl}
        alt=""
        onError={() => setFailedArtworkUrl(artworkUrl)}
      />
      <div className="liebe-media-scrim" />
    </div>
  ) : undefined

  /*
   * In background mode the artwork *is* the tile, so there is no lead slot: a
   * thumbnail or an icon circle on top of the full-bleed image would be the
   * same picture twice. Every other mode leads with the thumbnail, or the icon
   * circle standing in for it.
   */
  const lead = showBackgroundArtwork ? undefined : showArtwork ? (
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
   *   full    the row content, the transport cluster, then the volume, progress
   *           and source sections in that order.
   *
   * Volume additionally needs the room: `row` renders it only at ≥4 wide, and
   * `glance`/`tall` never do. Progress and the source picker are `full` only.
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

  /*
   * The three PR 2 sections, each gated by three independent things: the option,
   * the tier that has room for it, and what the entity can actually do. The
   * capability half is never the option's business — an option hides a control,
   * it never conjures one (common contract, convention 3).
   */
  const controlsAllowed = !isCollapsed && !isEditMode
  const volumePresentation = resolveVolumePresentation(options.showVolume, features)
  const volumeFits = tier === 'full' || (tier === 'row' && isWideRow)
  const showVolume = controlsAllowed && volumeFits && volumePresentation !== 'none'

  const progress = options.showProgress ? resolveMediaProgress({ attributes, state, now }) : null
  const showProgress = controlsAllowed && tier === 'full' && progress !== null

  const sourceList = readSourceList(attributes)
  const showSourcePicker =
    controlsAllowed &&
    tier === 'full' &&
    options.showSourcePicker &&
    canSelectSource(attributes, features)

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
   * The mute toggle, which appears in every volume presentation that has it —
   * beside the steppers, beside the slider, or alone when the entity advertises
   * `VOLUME_MUTE` and neither of the other two bits.
   */
  const muteButton = features.volumeMute ? (
    <Pill
      domain="media_player"
      color={stateColor}
      active={isMuted}
      label={isMuted ? 'Unmute' : 'Mute'}
      hideLabel
      icon={isMuted ? <IconVolume3 size={18} /> : <IconVolume2 size={18} />}
      onClick={handleMute}
      disabled={isLoading}
    />
  ) : null

  /*
   * The volume control, in whichever form the entity can support.
   *
   * The slider commits on release rather than on every value the drag passes
   * through — one command per gesture instead of eighty — and shows the
   * committed value until the entity answers (see `commitVolume`). The steppers
   * are the automatic degradation for a player with only `VOLUME_STEP`; the
   * option still says `slider`, because the user asked for a slider and the
   * entity is what cannot provide one.
   */
  const volumeControl = (
    <Flex align="center" gap="2" width="100%">
      {volumePresentation === 'slider' && (
        <>
          {muteButton}
          <Box flexGrow="1">
            <Slider
              domain="media_player"
              color={stateColor}
              active={!isMuted && displayVolume > 0}
              label="Volume"
              value={volumeToPercent(displayVolume)}
              readout={`${volumeToPercent(displayVolume)}%`}
              onValueChange={handleVolumeChange}
              onValueCommit={handleVolumeCommit}
            />
          </Box>
        </>
      )}
      {volumePresentation === 'buttons' && (
        <PillGroup label="Volume">
          <Pill
            domain="media_player"
            color={stateColor}
            label="Volume down"
            hideLabel
            icon={<IconVolume2 size={18} />}
            onClick={() => handleVolumeStep(-1)}
            disabled={isLoading}
          />
          {muteButton}
          <Pill
            domain="media_player"
            color={stateColor}
            label="Volume up"
            hideLabel
            icon={<IconVolume size={18} />}
            onClick={() => handleVolumeStep(1)}
            disabled={isLoading}
          />
        </PillGroup>
      )}
      {volumePresentation === 'mute-only' && <PillGroup label="Volume">{muteButton}</PillGroup>}
    </Flex>
  )

  /*
   * The progress bar. Two different elements rather than one disabled control:
   * a seekable player gets a real slider, and a player with no `SEEK` bit gets a
   * presentational bar. Rendering a disabled slider instead would put a control
   * in the tab order that can never do anything — the same rule that makes
   * `Pill` refuse to render inert (docs/specs/design-system — card anatomy).
   */
  const progressBar =
    progress === null ? null : (
      <Flex direction="column" gap="1" width="100%" className="liebe-media-progress">
        {features.seek ? (
          <Slider
            domain="media_player"
            color={stateColor}
            active={isActive}
            label="Seek"
            value={seekSeconds ?? progress.position}
            min={0}
            max={progress.duration}
            step={1}
            readout={formatMediaTime(seekSeconds ?? progress.position)}
            onValueChange={setSeekSeconds}
            onValueCommit={handleSeekCommit}
          />
        ) : (
          <div
            className="liebe-media-progress-track"
            role="progressbar"
            aria-label="Media position"
            aria-valuemin={0}
            aria-valuemax={Math.round(progress.duration)}
            aria-valuenow={Math.round(progress.position)}
            aria-valuetext={`${formatMediaTime(progress.position)} of ${formatMediaTime(progress.duration)}`}
          >
            <div
              className="liebe-media-progress-fill"
              style={{ inlineSize: `${progress.fraction * 100}%` }}
            />
          </div>
        )}
        <Flex justify="between">
          <Text size="1" color="gray">
            {formatMediaTime(seekSeconds ?? progress.position)}
          </Text>
          <Text size="1" color="gray">
            {formatMediaTime(progress.duration)}
          </Text>
        </Flex>
      </Flex>
    )

  /*
   * The source picker. `stopPropagation` on the wrapper because a Radix select
   * opens a portal: the click that chooses an item lands outside the tile, but
   * the click that opens the trigger does not, and without this it would also
   * be a tap on the card.
   */
  const sourcePicker = (
    <Box onClick={(e) => e.stopPropagation()} width="100%">
      <Select.Root
        value={readCurrentSource(attributes)}
        onValueChange={handleSelectSource}
        disabled={isLoading}
      >
        <Select.Trigger
          variant="soft"
          style={{ width: '100%' }}
          aria-label="Source"
          placeholder="Select source"
        />
        <Select.Content>
          {sourceList.map((source) => (
            <Select.Item key={source} value={source}>
              {source}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Box>
  )

  /*
   * `row` puts the transport in the control slot at the trailing edge; `full`
   * puts it underneath, where the option doc stacks the control block. `glance`
   * and `tall` pass neither, which is how a tier omits content rather than
   * hiding it.
   *
   * At `full` the sections stack transport → volume → progress → source, the
   * order the option doc gives, each omitted rather than compressed when its
   * gate is closed.
   */
  const inRowControl = showTransport && tier === 'row' ? transport : undefined
  const rowVolume = tier === 'row' && showVolume ? volumeControl : undefined

  const inFullExtra =
    tier === 'full' ? (
      <>
        {showTransport && transport}
        {showVolume && volumeControl}
        {showProgress && progressBar}
        {showSourcePicker && sourcePicker}
      </>
    ) : (
      rowVolume
    )

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
      className={
        showBackgroundArtwork ? 'media-player-card media-player-card-backdrop' : 'media-player-card'
      }
    >
      {/*
       * Behind the body rather than around it, so the content keeps the layout
       * the tier gave it and only the ground changes.
       */}
      {backgroundArtwork}
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

const MemoizedMediaPlayerCardContent = memo(MediaPlayerCardComponent, (prevProps, nextProps) => {
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

/*
 * The card's own error boundary, following the WeatherCard variants — the one
 * other family that carries one — and AGENTS.md ("Entity Card Registration").
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
function MediaPlayerCardWithBoundary(props: MediaPlayerCardProps) {
  return (
    <ErrorBoundary>
      <MemoizedMediaPlayerCardContent {...props} />
    </ErrorBoundary>
  )
}

export const MediaPlayerCard = Object.assign(MediaPlayerCardWithBoundary, {
  /*
   * 2×2 — the `full` tier, which is the layout the option doc calls the
   * showcase and the smallest one that carries artwork, meta and transport at
   * once.
   */
  defaultDimensions: { width: 2, height: 2 },
})
