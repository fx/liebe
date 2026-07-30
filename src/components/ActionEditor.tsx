import * as React from 'react'
import { useEffect } from 'react'
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
  id: string
  slug: string
  name: string
  depth: number
}

/** The screen tree as a flat, indented list — `navigate` targets one of these. */
function flattenScreens(screens: ScreenConfig[], depth = 0): FlatScreen[] {
  return screens.flatMap((screen) => [
    { id: screen.id, slug: screen.slug, name: screen.name, depth },
    ...(screen.children ? flattenScreens(screen.children, depth + 1) : []),
  ])
}

function normalize(value: unknown, fallback: CardAction): CardAction {
  const parsed = cardActionSchema.safeParse(value)
  return parsed.success ? parsed.data : fallback
}

/** The parameter fields an action carries, as the form holds them. */
function fieldsOf(action: CardAction) {
  if (typeof action === 'string') return { target: '', service: '', dataText: '' }
  if (action.action === 'navigate') return { target: action.target, service: '', dataText: '' }

  return {
    target: '',
    service: action.service,
    dataText: action.data ? yaml.dump(action.data).trimEnd() : '',
  }
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
   * The picked kind and the parameter fields are local state rather than values
   * derived from `value`, because the two parameterized actions are not
   * committed until they are complete: choosing "Call service" has nothing valid
   * to emit yet, and a derived kind would snap straight back to the previous
   * action, taking the service field with it before it could be filled in.
   *
   * The stored action still wins whenever it changes to something this control
   * did not write — the form being pointed at a different card, or the config
   * being reset. `synced` is what tells those apart: every commit records what
   * it emitted, so the control's own writes do not come back round and reset the
   * field the user is still typing in.
   */
  const [kind, setKind] = React.useState<ActionKind>(storedKind)
  const [target, setTarget] = React.useState(() => fieldsOf(action).target)
  const [service, setService] = React.useState(() => fieldsOf(action).service)
  const [dataText, setDataText] = React.useState(() => fieldsOf(action).dataText)
  const [dataError, setDataError] = React.useState<string | null>(null)

  /*
   * `synced` is a ref rather than state because it is not rendered: it is the
   * record of what the form last agreed with the store about, and keeping it out
   * of the render output means an emission does not cost a second render pass.
   * The comparison happens in an effect, so nothing is set during render.
   */
  const storedJson = JSON.stringify(action)
  const syncedRef = React.useRef(storedJson)

  useEffect(() => {
    // Only a value this control did not write resyncs the form. An unrelated
    // re-render leaves `storedJson` equal to what was last agreed, so a
    // half-typed service survives it; a genuinely new `value` does not match and
    // replaces the fields wholesale.
    if (syncedRef.current === storedJson) return
    syncedRef.current = storedJson

    const fields = fieldsOf(action)
    /*
     * Suppressed, not fixed — newly visible because this call was written
     * `React.useEffect(...)`, which `react-hooks/set-state-in-effect` cannot
     * see (docs/changes/0040-test-harness-reliability.md, PR 3).
     *
     * Note this one is not the same shape as `GridCard`'s two: those reset
     * unconditionally, whereas this resyncs the form only when `storedJson`
     * differs from what the control last emitted — so it does not cascade on
     * every render, and the guard above is what stops it. That makes it the
     * least alarming of the three and still a real report: the rule's objection
     * is that a render can be triggered from an effect at all, and the honest
     * answer is the render-phase pattern rather than a guard.
     *
     * REMOVE THIS SUPPRESSION IN PR 4, which audits all five member-call sites
     * and moves the state-writing ones off effects. One disable covers the
     * whole block: the rule reports the first setState in an effect body, and
     * the four `set*` calls below are that same single resync.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKind(storedKind)
    setTarget(fields.target)
    setService(fields.service)
    setDataText(fields.dataText)
    setDataError(null)
  }, [action, storedJson, storedKind])

  /** Records what this control emitted, so the echo does not resync the form. */
  const emit = (next: CardAction) => {
    syncedRef.current = JSON.stringify(next)
    onChange(next)
  }

  const commitNavigate = (nextTarget: string) => {
    setTarget(nextTarget)
    const candidate = navigateActionSchema.safeParse({ action: 'navigate', target: nextTarget })
    if (candidate.success) emit(candidate.data)
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
    if (candidate.success) emit(candidate.data)
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

    emit(nextKind)
  }

  /*
   * A stored target is either identifier — that is what the schema documents and
   * what `useCardActions` navigates by, so the editor resolves it the same way.
   * Matching on slug alone would label a working id-targeted action as broken.
   */
  const targetScreen = flatScreens.find((screen) => screen.id === target || screen.slug === target)

  // A stored target that no longer matches a screen (it was renamed or deleted)
  // is still offered, so opening the form does not quietly discard it.
  const hasUnknownTarget = Boolean(target) && !targetScreen

  /*
   * The options are keyed by slug, so an id-targeted action selects its screen
   * through the resolved slug. The stored id is left alone: displaying it
   * correctly is not a reason to rewrite a config the user did not touch.
   */
  const selectedTarget = targetScreen ? targetScreen.slug : target

  return (
    <Flex direction="column" gap="1">
      <Text size="2" weight="medium">
        {label}
      </Text>

      <Select.Root
        size="3"
        value={kind}
        onValueChange={(next) => handleKindChange(next as ActionKind)}
      >
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
            <Select.Root size="3" value={selectedTarget} onValueChange={commitNavigate}>
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
            size="3"
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
            size="3"
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
