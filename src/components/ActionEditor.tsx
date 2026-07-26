import * as React from 'react'
import { Flex, Select, Text, TextArea, TextField } from '@radix-ui/themes'
import yaml from 'js-yaml'
import { useDashboardStore } from '~/store'
import {
  callServiceActionSchema,
  navigateActionSchema,
  cardActionSchema,
  type CardAction,
} from '~/store/cardActions'
import type { ScreenConfig } from '~/store/types'

/** The six action identifiers, in the order the picker offers them. */
const ACTION_CHOICES = [
  { value: 'default', label: 'Default (card’s own action)' },
  { value: 'toggle', label: 'Toggle' },
  { value: 'more-info', label: 'More info' },
  { value: 'navigate', label: 'Navigate to screen' },
  { value: 'call-service', label: 'Call service' },
  { value: 'none', label: 'Nothing' },
] as const

type ActionKind = (typeof ACTION_CHOICES)[number]['value']

export interface ActionEditorProps {
  label: string
  description?: string
  /** The stored value, which may be anything a hand-edited config contains. */
  value: unknown
  /** Used when `value` is absent or does not validate. */
  defaultValue: CardAction
  onChange: (action: CardAction) => void
}

interface FlatScreen {
  slug: string
  name: string
  depth: number
}

/** The screen tree as a flat, indented list — `navigate` targets one of these. */
function flattenScreens(screens: ScreenConfig[], depth = 0): FlatScreen[] {
  return screens.flatMap((screen) => [
    { slug: screen.slug, name: screen.name, depth },
    ...(screen.children ? flattenScreens(screen.children, depth + 1) : []),
  ])
}

function normalize(value: unknown, fallback: CardAction): CardAction {
  const parsed = cardActionSchema.safeParse(value)
  return parsed.success ? parsed.data : fallback
}

/**
 * The action editor — the config control behind `tapAction`, `holdAction` and
 * `doubleTapAction`.
 *
 * It is the first `ConfigDefinition` control for a non-scalar option, and the
 * reason the option surface needed one: the two parameterized actions carry
 * fields (`navigate`'s screen, `call-service`'s service and data) that a select
 * or a text field cannot express.
 *
 * **It only ever emits a value that validates.** A half-typed service name lives
 * in local state and shows an inline error rather than being written to the
 * card, because an invalid action persisted into a shared YAML export would be
 * rejected by the import gate on the other side
 * (docs/specs/entity-cards/options/common.md — "Action type"). Switching to
 * `navigate` picks the first screen for the same reason: the target is required,
 * so the control commits a complete action or none at all.
 */
export function ActionEditor({
  label,
  description,
  value,
  defaultValue,
  onChange,
}: ActionEditorProps) {
  const screens = useDashboardStore((state) => state.screens)
  const flatScreens = React.useMemo(() => flattenScreens(screens), [screens])

  const action = normalize(value, defaultValue)
  const storedKind: ActionKind = typeof action === 'string' ? action : action.action

  /*
   * The picked kind is local state rather than a value derived from `value`,
   * because the two parameterized actions are not committed until they are
   * complete: choosing "Call service" has nothing valid to emit yet, and a
   * derived kind would snap straight back to the previous action, taking the
   * service field with it before it could be filled in. The stored kind still
   * wins whenever it changes underneath — the form being pointed at a different
   * card, or the value being reset.
   */
  const [kind, setKind] = React.useState<ActionKind>(storedKind)
  const [lastStoredKind, setLastStoredKind] = React.useState<ActionKind>(storedKind)
  if (lastStoredKind !== storedKind) {
    setLastStoredKind(storedKind)
    setKind(storedKind)
  }

  const [target, setTarget] = React.useState(() =>
    typeof action === 'object' && action.action === 'navigate' ? action.target : ''
  )
  const [service, setService] = React.useState(() =>
    typeof action === 'object' && action.action === 'call-service' ? action.service : ''
  )
  const [dataText, setDataText] = React.useState(() =>
    typeof action === 'object' && action.action === 'call-service' && action.data
      ? yaml.dump(action.data).trimEnd()
      : ''
  )
  const [dataError, setDataError] = React.useState<string | null>(null)

  const commitNavigate = (nextTarget: string) => {
    setTarget(nextTarget)
    const candidate = navigateActionSchema.safeParse({ action: 'navigate', target: nextTarget })
    if (candidate.success) onChange(candidate.data)
  }

  const commitService = (nextService: string, nextDataText: string) => {
    let data: Record<string, unknown> | undefined

    if (nextDataText.trim()) {
      try {
        const parsed = yaml.load(nextDataText)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setDataError('Service data must be a mapping of keys to values.')
          return
        }
        data = parsed as Record<string, unknown>
      } catch (error) {
        // `yaml.load` throws `YAMLException`, which extends `Error` — its
        // message names the line and column, which is the useful half of the
        // report, so it is passed straight through.
        setDataError((error as Error).message)
        return
      }
    }

    setDataError(null)
    const candidate = callServiceActionSchema.safeParse({
      action: 'call-service',
      service: nextService,
      ...(data ? { data } : {}),
    })
    if (candidate.success) onChange(candidate.data)
  }

  const handleKindChange = (nextKind: ActionKind) => {
    setKind(nextKind)

    if (nextKind === 'navigate') {
      // Pre-selecting the first screen keeps the emitted action complete; with
      // no screens to target there is nothing valid to emit yet.
      commitNavigate(target || flatScreens[0]?.slug || '')
      return
    }

    if (nextKind === 'call-service') {
      commitService(service, dataText)
      return
    }

    onChange(nextKind)
  }

  // A stored target that no longer matches a screen (it was renamed or deleted)
  // is still offered, so opening the form does not quietly discard it.
  const hasUnknownTarget = Boolean(target) && !flatScreens.some((screen) => screen.slug === target)

  return (
    <Flex direction="column" gap="1">
      <Text size="2" weight="medium">
        {label}
      </Text>

      <Select.Root value={kind} onValueChange={(next) => handleKindChange(next as ActionKind)}>
        <Select.Trigger aria-label={label} />
        <Select.Content position="popper">
          {ACTION_CHOICES.map((choice) => (
            <Select.Item key={choice.value} value={choice.value}>
              {choice.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>

      {kind === 'navigate' && (
        <Flex direction="column" gap="1" mt="1">
          <Text size="1" color="gray">
            Screen
          </Text>
          {flatScreens.length === 0 && !hasUnknownTarget ? (
            <Text size="1" color="red">
              Add a screen first — a navigate action needs somewhere to go.
            </Text>
          ) : (
            <Select.Root value={target} onValueChange={commitNavigate}>
              <Select.Trigger aria-label={`${label} screen`} />
              <Select.Content position="popper">
                {hasUnknownTarget && (
                  <Select.Item value={target}>{target} (screen not found)</Select.Item>
                )}
                {flatScreens.map((screen) => (
                  <Select.Item key={screen.slug} value={screen.slug}>
                    {`${'— '.repeat(screen.depth)}${screen.name}`}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          )}
        </Flex>
      )}

      {kind === 'call-service' && (
        <Flex direction="column" gap="1" mt="1">
          <Text size="1" color="gray">
            Service
          </Text>
          <TextField.Root
            value={service}
            placeholder="light.turn_on"
            aria-label={`${label} service`}
            onChange={(event) => {
              setService(event.target.value)
              commitService(event.target.value, dataText)
            }}
          />
          {!callServiceActionSchema.shape.service.safeParse(service).success && (
            <Text size="1" color="red">
              Enter the service as domain.service, for example light.turn_on.
            </Text>
          )}

          <Text size="1" color="gray" mt="1">
            Service data (YAML, optional)
          </Text>
          <TextArea
            value={dataText}
            rows={3}
            placeholder={'brightness: 180'}
            aria-label={`${label} service data`}
            onChange={(event) => {
              setDataText(event.target.value)
              commitService(service, event.target.value)
            }}
          />
          {dataError ? (
            <Text size="1" color="red">
              {dataError}
            </Text>
          ) : (
            <Text size="1" color="gray">
              Leave empty to target this card’s entity.
            </Text>
          )}
        </Flex>
      )}

      {description && (
        <Text size="1" color="gray">
          {description}
        </Text>
      )}
    </Flex>
  )
}
