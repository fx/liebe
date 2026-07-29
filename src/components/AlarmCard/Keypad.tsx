import { Button, Flex, Grid, Text, TextField } from '@radix-ui/themes'
import { useCallback, useState } from 'react'
import type { AlarmCodeFormat } from './presentation'

/**
 * The code collector (docs/specs/entity-cards/options/security.md — "Code
 * handling").
 *
 * **It is deliberately dumb.** It honours `code_format`, masks what is typed,
 * and hands the string to whoever asked for it. It does not validate, does not
 * remember, and nothing it collects is ever written to `item.config` — the
 * panel is what validates a code, and a rejected one surfaces as an ordinary
 * service error. A card that checked codes itself would be a card storing them.
 *
 * Placement-agnostic on purpose: the same component is the body of the keypad
 * dialog and the inline keypad a large `full` card renders, because the spec
 * makes placement a function of tier and span rather than of the keypad.
 */
export interface KeypadProps {
  /** `number` renders the digit pad, `text` a masked field. */
  format: AlarmCodeFormat
  /** Names the transition being authorised — "Arm away", "Disarm". */
  actionLabel: string
  /**
   * Receives the entered code. Called at most once per mount: the submit
   * control latches, so a double-tap on a laggy panel cannot send twice
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

  const submit = useCallback(() => {
    if (submitted) return
    setSubmitted(true)
    onSubmit(code)
  }, [code, onSubmit, submitted])

  const append = useCallback((digit: string) => setCode((current) => current + digit), [])
  const backspace = useCallback(() => setCode((current) => current.slice(0, -1)), [])

  return (
    <Flex direction="column" gap="3" data-testid="alarm-keypad">
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
            data-testid="alarm-keypad-readout"
          >
            {code.length > 0 ? '•'.repeat(code.length) : ' '}
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
