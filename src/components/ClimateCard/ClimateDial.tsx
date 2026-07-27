import { Box, Flex, IconButton, Text } from '@radix-ui/themes'
import { MinusIcon, PlusIcon } from '@radix-ui/react-icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDashboardStore } from '~/store'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardState } from '../anatomy'
import type { CardProps } from '../cardRegistry'
import { ClimateCompactContent } from './ClimateCompact'
import { ClimateModePills } from './ClimateModePills'
import { climateCardFallback } from './ClimateCardStates'
import { FALLBACK_SETPOINT, useClimateModel } from './climateModel'
import { useClimateControl } from './useClimateControl'
import './ClimateCard.css'

/**
 * The `dial` variant: the arc thermostat, with the setpoint dragged around the
 * arc.
 *
 * Registered through the card registry's variant mechanism rather than a switch
 * private to the card (docs/specs/entity-cards/options/climate.md — "variant"),
 * which is what makes `getCardVariant('climate', 'dial')` the whole of the
 * dispatch. Every climate card placed before change 0017 is pinned onto it by
 * the loader migration in `store/climateOptions.ts`, so this is what an existing
 * dashboard keeps rendering.
 *
 * `full` only. The arc needs the room to be draggable at all, so at every
 * smaller tier a `dial` card renders the compact layout for that tier — the
 * same fallback the option doc specifies, and the reason this file delegates
 * rather than shrinking the geometry.
 */

/** The angular sweep of the arc, in degrees; 410° is 50° in the next rotation. */
const ARC_START_ANGLE = 130
const ARC_END_ANGLE = 410
const ARC_RANGE = ARC_END_ANGLE - ARC_START_ANGLE

// One dial radius at every tier; the thermostat's per-tier layout is 0011 PR 3's.
const ARC_RADIUS = 70
const STROKE_WIDTH = 8
const CENTER = ARC_RADIUS + STROKE_WIDTH
const SVG_SIZE = CENTER * 2

/** An SVG arc path between two angles on the dial's circle. */
function createArcPath(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const startRad = (startAngle * Math.PI) / 180
  const endRad = (endAngle * Math.PI) / 180

  const x1 = centerX + radius * Math.cos(startRad)
  const y1 = centerY + radius * Math.sin(startRad)
  const x2 = centerX + radius * Math.cos(endRad)
  const y2 = centerY + radius * Math.sin(endRad)

  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0

  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`
}

/** Which handle is moving, and where both ends of the band are while it does. */
export interface DialDrag {
  handle: 'heat' | 'cool'
  low: number
  high: number
}

/**
 * Where a handle lands when it is asked to move to `temp`.
 *
 * The band-preserving rule, as a pure function, because it governs both ways of
 * moving a handle — the pointer drag and the arrow keys — and a second copy
 * would be a second chance for the two to disagree about where the handles may
 * go. A move that would cross the other handle (or come within one step of it)
 * is refused by returning the band unchanged, which is the same reading as the
 * service layer's inverted-range rejection: two setpoints that have crossed
 * describe nothing a thermostat can act on.
 */
export function nextDialDrag(drag: DialDrag, temp: number, step: number): DialDrag {
  const snapped = Math.round(temp / step) * step

  if (drag.handle === 'heat') {
    return snapped < drag.high - step ? { ...drag, low: snapped } : drag
  }
  return snapped > drag.low + step ? { ...drag, high: snapped } : drag
}

/**
 * The step one arrow key moves a handle, or `0` for a key the dial ignores.
 *
 * Up and right increase, down and left decrease — the slider convention, and
 * the one a user pressing keys at a circular control expects either way round.
 */
export function arrowKeyDelta(key: string, step: number): number {
  if (key === 'ArrowUp' || key === 'ArrowRight') return step
  if (key === 'ArrowDown' || key === 'ArrowLeft') return -step
  return 0
}

export function ClimateDialContent(props: CardProps) {
  // The tier decides which component renders at all, so it is settled before any
  // hook runs — the dial and the compact layout do not share a hook order, and
  // this wrapper is what keeps them from having to.
  if ((props.tier ?? 'row') !== 'full') return <ClimateCompactContent {...props} />

  return <ClimateDialFull {...props} />
}

function ClimateDialFull({ entityId, onDelete, isSelected = false, onSelect }: CardProps) {
  const model = useClimateModel(entityId)
  const control = useClimateControl(entityId)
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'

  const [drag, setDrag] = useState<DialDrag | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const reading = model.reading
  const minTemp = reading?.minTemp ?? 0
  const maxTemp = reading?.maxTemp ?? 0
  const tempStep = reading?.tempStep ?? 0
  const { setRange } = control

  const commitRange = useCallback(
    (low: number, high: number) => setRange({ low, high, minTemp, maxTemp }),
    [setRange, minTemp, maxTemp]
  )

  /** The temperature an angle on the arc points at. */
  const angleToTemp = useCallback(
    (angle: number): number => {
      const percentage = (angle - ARC_START_ANGLE) / ARC_RANGE
      return minTemp + percentage * (maxTemp - minTemp)
    },
    [minTemp, maxTemp]
  )

  /** Where a pointer is, as an angle on the arc. */
  const getAngleFromPosition = useCallback((clientX: number, clientY: number): number => {
    const rect = svgRef.current!.getBoundingClientRect()
    const x = clientX - rect.left - CENTER
    const y = clientY - rect.top - CENTER

    let angle = Math.atan2(y, x) * (180 / Math.PI)
    if (angle < 0) angle += 360
    // The arc runs past 360°, so an angle like 50° is really 410°.
    if (angle < 90) angle += 360

    return Math.max(ARC_START_ANGLE, Math.min(ARC_END_ANGLE, angle))
  }, [])

  /*
   * The pointer listeners live on the document rather than on the handle: a
   * drag that leaves the circle must keep tracking, and must end wherever the
   * pointer is released. They exist only while a handle is held, which is also
   * what makes the updater below safe to write without a null check — nothing
   * can call it once the drag it belongs to is over.
   */
  useEffect(() => {
    if (!drag) return

    const move = (event: MouseEvent | TouchEvent) => {
      const point = 'touches' in event ? event.touches[0] : event
      const temp = angleToTemp(getAngleFromPosition(point.clientX, point.clientY))
      setDrag((current) => nextDialDrag(current!, temp, tempStep))
    }

    const end = () => {
      setDrag(null)
      commitRange(drag.low, drag.high)
    }

    document.addEventListener('mousemove', move)
    document.addEventListener('touchmove', move)
    document.addEventListener('mouseup', end)
    document.addEventListener('touchend', end)

    return () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('mouseup', end)
      document.removeEventListener('touchend', end)
    }
  }, [drag, angleToTemp, getAngleFromPosition, commitRange, tempStep])

  const fallback = climateCardFallback({
    model,
    tier: 'full',
    isSelected,
    onSelect,
    onDelete,
  })
  if (fallback) return fallback

  // Established by the fallback above, exactly as in the compact layout.
  const {
    friendlyName,
    hvacMode,
    hvacAction,
    hvacModes,
    currentTemp,
    targetTemp,
    targetTempLow,
    targetTempHigh,
    tempUnit,
    supportsTargetTemp,
    statusColor,
  } = reading!

  const isRangeDial =
    hvacMode === 'heat_cool' && targetTempLow !== undefined && targetTempHigh !== undefined
  const lowSetpoint = drag ? drag.low : targetTempLow!
  const highSetpoint = drag ? drag.high : targetTempHigh!

  /**
   * A setpoint's position on the arc, as an angle.
   *
   * A thermostat whose bounds have collapsed (`min_temp` at or above
   * `max_temp` — nonsense, but a shape a hand-edited entity can publish) has no
   * span to place a setpoint along, and the division would put `NaN` into the
   * `cx`/`cy` of every handle. Everything stacks at the arc's start instead,
   * which draws a dial with nothing on it rather than an invalid one.
   */
  const angleFor = (temp: number) =>
    maxTemp > minTemp
      ? ARC_START_ANGLE + ((temp - minTemp) / (maxTemp - minTemp)) * ARC_RANGE
      : ARC_START_ANGLE
  const pointOn = (angle: number, radius: number) => ({
    x: CENTER + radius * Math.cos((angle * Math.PI) / 180),
    y: CENTER + radius * Math.sin((angle * Math.PI) / 180),
  })

  const scalarAngle =
    hvacMode === 'heat' || hvacMode === 'cool' ? angleFor(targetTemp ?? minTemp) : ARC_START_ANGLE
  const scalarPoint = pointOn(scalarAngle, ARC_RADIUS)

  /**
   * One draggable setpoint handle.
   *
   * `role="slider"` with the value on the same element, because the handle is
   * the control: before this it was a bare `<circle>` with pointer handlers, so
   * the band could only be set by dragging — a keyboard or switch-access user
   * had no way to change a `heat_cool` setpoint at all, on the variant every
   * pre-0017 dashboard is pinned to (issue #225).
   */
  const handleFor = (handle: 'heat' | 'cool') => {
    const value = handle === 'heat' ? lowSetpoint : highSetpoint
    const { x, y } = pointOn(angleFor(value), ARC_RADIUS)

    const adjust = (delta: number) => {
      const moved = nextDialDrag(
        { handle, low: lowSetpoint, high: highSetpoint },
        value + delta,
        tempStep
      )
      // A refused move is not a command: re-sending the band unchanged would
      // spend a dispatch saying nothing.
      if (moved.low !== lowSetpoint || moved.high !== highSetpoint) {
        commitRange(moved.low, moved.high)
      }
    }

    return (
      <circle
        cx={x}
        cy={y}
        r={STROKE_WIDTH / 2 + 4}
        fill="white"
        stroke={`var(--liebe-c-${handle})`}
        strokeWidth="3"
        role="slider"
        tabIndex={0}
        aria-label={handle === 'heat' ? 'Heat setpoint' : 'Cool setpoint'}
        aria-valuemin={minTemp}
        aria-valuemax={maxTemp}
        aria-valuenow={value}
        aria-valuetext={`${value.toFixed(1)}${tempUnit}`}
        style={{
          cursor: 'grab',
          filter:
            drag?.handle === handle ? `drop-shadow(0 0 8px var(--liebe-c-${handle}))` : undefined,
        }}
        onMouseDown={(event) => {
          event.preventDefault()
          setDrag({ handle, low: lowSetpoint, high: highSetpoint })
        }}
        onTouchStart={(event) => {
          event.preventDefault()
          setDrag({ handle, low: lowSetpoint, high: highSetpoint })
        }}
        onKeyDown={(event) => {
          const delta = arrowKeyDelta(event.key, tempStep)
          if (delta === 0) return
          event.preventDefault()
          adjust(delta)
        }}
      />
    )
  }

  /** The label that rides along the arc beside a handle. */
  const handleLabel = (handle: 'heat' | 'cool') => {
    const value = handle === 'heat' ? lowSetpoint : highSetpoint
    const { x, y } = pointOn(angleFor(value), ARC_RADIUS - 20)

    return (
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={`var(--liebe-c-${handle})`}
        fontSize="12"
        fontWeight="600"
      >
        {value.toFixed(1)}°
      </text>
    )
  }

  return (
    <GridCard
      domain="climate"
      color={statusColor}
      tier="full"
      isLoading={control.isLoading}
      isError={!!control.error}
      isStale={model.isStale}
      isSelected={isSelected}
      isOn={hvacMode !== 'off'}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      // A thermostat's tap default is the detail dialog, never a power toggle
      // (docs/specs/entity-cards/options/climate.md — "Primary action").
      defaultAction="more-info"
      title={control.error || undefined}
      className="climate-card"
    >
      {/*
       * No `CardBody`, unlike the compact layout. The dial is not the four-slot
       * shape wearing a different arrangement: it replaces lead, meta and
       * control with one composite surface that draws the name, the reading,
       * the setpoint and the touch target as a single dial. There is nothing
       * here for the slots to hold, so putting it behind `CardBody` would name a
       * shape it does not have.
       */}
      <Flex direction="column" align="center" gap="2">
        <GridCard.Title className="climate-card-name">{friendlyName}</GridCard.Title>

        <Box style={{ position: 'relative', width: `${SVG_SIZE}px`, height: `${SVG_SIZE}px` }}>
          <svg
            ref={svgRef}
            width={SVG_SIZE}
            height={SVG_SIZE}
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            {/* Background arc */}
            <path
              d={createArcPath(CENTER, CENTER, ARC_RADIUS, ARC_START_ANGLE, ARC_END_ANGLE)}
              fill="none"
              stroke="var(--gray-6)"
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
            />

            {isRangeDial ? (
              <>
                {/* Heat arc (from the left) and cool arc (from the right) */}
                <path
                  d={createArcPath(
                    CENTER,
                    CENTER,
                    ARC_RADIUS,
                    ARC_START_ANGLE,
                    angleFor(lowSetpoint)
                  )}
                  fill="none"
                  stroke="var(--liebe-c-heat)"
                  strokeWidth={STROKE_WIDTH}
                  strokeLinecap="round"
                />
                <path
                  d={createArcPath(
                    CENTER,
                    CENTER,
                    ARC_RADIUS,
                    angleFor(highSetpoint),
                    ARC_END_ANGLE
                  )}
                  fill="none"
                  stroke="var(--liebe-c-cool)"
                  strokeWidth={STROKE_WIDTH}
                  strokeLinecap="round"
                />

                {handleFor('heat')}
                {handleFor('cool')}
                {handleLabel('heat')}
                {handleLabel('cool')}
              </>
            ) : hvacMode !== 'off' && targetTemp !== undefined ? (
              <>
                <path
                  d={createArcPath(CENTER, CENTER, ARC_RADIUS, ARC_START_ANGLE, scalarAngle)}
                  fill="none"
                  stroke={`var(--liebe-c-${statusColor})`}
                  strokeWidth={STROKE_WIDTH}
                  strokeLinecap="round"
                />
                <circle
                  cx={scalarPoint.x}
                  cy={scalarPoint.y}
                  r={STROKE_WIDTH / 2 + 2}
                  fill="white"
                  stroke={`var(--liebe-c-${statusColor})`}
                  strokeWidth="2"
                />
              </>
            ) : null}
          </svg>

          {/* Center content */}
          <Flex
            direction="column"
            align="center"
            justify="center"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
            }}
          >
            {hvacAction && (
              /*
               * The state line takes its hue from the triplet the rendered
               * state resolved to, through `data-color` — a Radix `color` prop
               * here would keep its hue when a theme remapped `--liebe-c-heat`.
               */
              <CardState
                domain="climate"
                color={statusColor}
                active
                className="climate-card-action"
              >
                {hvacAction.replace(/_/g, ' ')}
              </CardState>
            )}

            {currentTemp !== undefined && (
              <Text size="7" weight="bold" style={{ lineHeight: 1 }}>
                {Math.round(currentTemp)}
                <Text size="4" as="span" style={{ verticalAlign: 'super' }}>
                  {tempUnit}
                </Text>
              </Text>
            )}

            {/*
             * Only with something to put in it. The pre-split card gated this
             * on the feature bit alone and formatted `targetTemp` regardless,
             * so a thermostat advertising `TARGET_TEMPERATURE` before its
             * `temperature` attribute arrived printed the string
             * "undefined°C"; and a range-only thermostat (bit 2 without bit 1,
             * legitimate for a heat_cool-only unit) had its band hidden
             * altogether.
             */}
            {hvacMode !== 'off' &&
              (isRangeDial || (supportsTargetTemp && targetTemp !== undefined)) && (
                <Flex align="center" gap="1" style={{ marginTop: '4px' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--liebe-c-cool)">
                    <path
                      d="M8 3v10M4 9l4-4 4 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                  <Text size="2" className="climate-card-target">
                    {isRangeDial
                      ? `${lowSetpoint.toFixed(1)} - ${highSetpoint.toFixed(1)}${tempUnit}`
                      : `${targetTemp!.toFixed(1)}${tempUnit}`}
                  </Text>
                </Flex>
              )}
          </Flex>
        </Box>

        {/* The scalar setpoint's own controls; the band is set on the arc. */}
        {!isEditMode && supportsTargetTemp && hvacMode !== 'off' && hvacMode !== 'heat_cool' && (
          <Flex align="center" gap="4" style={{ marginTop: '16px' }}>
            <IconButton
              size="3"
              variant="outline"
              radius="full"
              onClick={() =>
                control.setTemperature((targetTemp ?? FALLBACK_SETPOINT) - tempStep, {
                  minTemp,
                  maxTemp,
                })
              }
              disabled={control.isLoading || (targetTemp ?? FALLBACK_SETPOINT) <= minTemp}
              aria-label="Decrease temperature"
              style={{
                width: '48px',
                height: '48px',
                backgroundColor: 'var(--gray-2)',
                borderColor: 'var(--gray-6)',
              }}
            >
              <MinusIcon width="20" height="20" />
            </IconButton>

            <IconButton
              size="3"
              variant="outline"
              radius="full"
              onClick={() =>
                control.setTemperature((targetTemp ?? FALLBACK_SETPOINT) + tempStep, {
                  minTemp,
                  maxTemp,
                })
              }
              disabled={control.isLoading || (targetTemp ?? FALLBACK_SETPOINT) >= maxTemp}
              aria-label="Increase temperature"
              style={{
                width: '48px',
                height: '48px',
                backgroundColor: 'var(--gray-2)',
                borderColor: 'var(--gray-6)',
              }}
            >
              <PlusIcon width="20" height="20" />
            </IconButton>
          </Flex>
        )}

        {!isEditMode && hvacMode === 'heat_cool' && (
          <Text size="1" color="gray" align="center" style={{ marginTop: '8px' }}>
            Drag the orange and blue dots, or focus one and use the arrow keys
          </Text>
        )}

        {!isEditMode && (
          <ClimateModePills
            modes={hvacModes}
            activeMode={hvacMode}
            disabled={control.isLoading}
            onSelect={control.setHvacMode}
          />
        )}
      </Flex>
    </GridCard>
  )
}
