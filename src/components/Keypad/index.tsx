import { Button, Flex, Grid, Text, TextField } from '@radix-ui/themes'
import { useCallback, useState } from 'react'

/**
 * The code collector, shared by every card family whose entity can demand a code
 * (docs/specs/entity-cards/options/security.md — "Code handling" on both the
 * alarm and the lock).
 *
 * **It is deliberately dumb.** It honours `code_format`, masks what is typed,
 * and hands the string to whoever asked for it. It does not validate, does not
 * remember, and nothing it collects is ever written to `item.config` — the
 * entity is what validates a code, and a rejected one surfaces as an ordinary
 * service error. A card that checked codes itself would be a card storing them.
 *
 * It lives here rather than in `AlarmCard/`, where it shipped with change 0024,
 * because the lock needs the same collector and forking it would be two places
 * where masking, the at-most-once latch and the never-store rule could drift
 * apart — on the one surface in this codebase that handles a credential
 * (docs/changes/0037 — "Lock code handling reuses the alarm keypad's contract").
 *
 * Placement-agnostic on purpose: the same component is the body of a keypad
 * dialog and the inline keypad a large `full` alarm card renders, because
 * placement is a function of tier and span rather than of the keypad.
 */

/** How a code must be entered — Home Assistant's `CodeFormat`. */
export type CodeFormat = 'number' | 'text'

/** The one attribute a code-capable entity publishes about its code. */
export interface CodeFormatAttributes {
  code_format?: unknown
  [key: string]: unknown
}

/**
 * The entity's `code_format`, narrowed to what HA's `CodeFormat` defines.
 *
 * Anything else — `null`, absent, an empty string, a regex some integration put
 * there — reads as "no code format". That is the conservative direction for
 * *display* (no keypad is offered where none can be honoured) and it never
 * suppresses a code the entity needs: an entity that refuses the command without
 * one answers with a service error, which every family already surfaces through
 * its standard error state.
 *
 * The two domains publish it differently and this reader flattens the
 * difference deliberately. `AlarmControlPanelEntity.state_attributes` publishes
 * the key unconditionally, `null` when no code is wanted; `LockEntity` publishes
 * it only when an integration sets one. Absent and `null` therefore mean the
 * same thing here, and neither may be mistaken for "a code is required".
 */
export function readCodeFormat(
  attributes: CodeFormatAttributes | undefined
): CodeFormat | undefined {
  const raw = attributes?.code_format
  return raw === 'number' || raw === 'text' ? raw : undefined
}

export interface KeypadProps {
  /** `number` renders the digit pad, `text` a masked field. */
  format: CodeFormat
  /** Names the transition being authorised — "Arm away", "Disarm", "Unlock". */
  actionLabel: string
  /**
   * Receives the entered code. Called at most once per mount: the submit
   * control latches, so a double-tap on a laggy device cannot send twice
   * (docs/changes/0024 — "Confirm and keypad dialogs submit at most once per
   * open").
   */
  onSubmit: (code: string) => void
  onCancel: () => void
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

export function Keypad({ format, actionLabel, onSubmit, onCancel }: KeypadProps) {
  const [code, setCode] = useState('')
  /*
   * At-most-once per open, held here rather than by disabling on a promise:
   * this component never learns whether the call succeeded, and the guarantee
   * is about the submit gesture rather than the request.
   */
  const [submitted, setSubmitted] = useState(false)

  /*
   * One mechanism, not two. This began with an `if (submitted) return` guard as
   * well as the `disabled` below — and the guard could never run, because a
   * disabled button dispatches no click at all. An unreachable early return
   * inside the thing enforcing at-most-once is the worst place to keep dead
   * code: it reads as the enforcement while the attribute is doing the work, so
   * it could be wrong indefinitely without a test noticing. The latch state is
   * still the source of truth; `disabled` is how it is enforced.
   */
  const submit = useCallback(() => {
    setSubmitted(true)
    onSubmit(code)
  }, [code, onSubmit])

  const append = useCallback((digit: string) => setCode((current) => current + digit), [])
  const backspace = useCallback(() => setCode((current) => current.slice(0, -1)), [])

  return (
    <Flex direction="column" gap="3" data-testid="code-keypad">
      <Text size="2" color="gray">
        {actionLabel}
      </Text>

      {format === 'text' ? (
        <TextField.Root
          // `password`, so the code is masked in the DOM as well as on screen —
          // a text input would put it in the accessibility tree in clear.
          type="password"
          size="3"
          value={code}
          placeholder="Code"
          aria-label="Code"
          autoComplete="off"
          onChange={(event) => setCode(event.target.value)}
        />
      ) : (
        <Flex direction="column" gap="2">
          {/*
           * The masked readout. A row of dots rather than the digits: the code
           * is the secret, and a wall tablet is the least private screen in the
           * house. `aria-label` carries the length only, for the same reason.
           */}
          <Text
            size="5"
            align="center"
            aria-label={`${code.length} digits entered`}
            data-testid="code-keypad-readout"
          >
            {code.length > 0 ? '•'.repeat(code.length) : ' '}
          </Text>
          <Grid columns="3" gap="2">
            {DIGITS.map((digit) => (
              <Button key={digit} size="3" variant="soft" onClick={() => append(digit)}>
                {digit}
              </Button>
            ))}
            <Button size="3" variant="soft" onClick={backspace} aria-label="Backspace">
              ⌫
            </Button>
            <Button size="3" variant="soft" onClick={() => append('0')}>
              0
            </Button>
            <Button size="3" variant="soft" onClick={() => setCode('')} aria-label="Clear">
              ✕
            </Button>
          </Grid>
        </Flex>
      )}

      <Flex gap="3" justify="end">
        <Button size="3" variant="soft" color="gray" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="3" onClick={submit} disabled={submitted}>
          {actionLabel}
        </Button>
      </Flex>
    </Flex>
  )
}
