import * as React from 'react'
import { Button, Flex, Text, TextField } from '@radix-ui/themes'
import { X } from 'lucide-react'
import { numberEntrySchema, readStoredList, type NumberEntryBounds } from '~/store/configControls'

export interface NumberArrayEditorProps extends NumberEntryBounds {
  label: string
  description?: string
  /** The stored value, which may be anything a hand-edited config contains. */
  value: unknown
  /** Spinner increment for the add field; does not constrain what is accepted. */
  step?: number
  /** Suffix shown after each value — `%` for brightness presets. */
  unit?: string
  placeholder?: string
  onChange: (values: unknown[]) => void
}

/**
 * The number-array editor — the config control behind list-of-number options
 * such as the light card's `brightnessPresets`.
 *
 * Values are added one at a time and removed by tapping them, which keeps the
 * whole control to two touch targets per entry and needs no drag affordance.
 * Stored order is the order they render in, so the control never sorts: the
 * user's arrangement is part of the configuration.
 *
 * **Only a value the entry schema accepts is ever added**, and an entry already
 * in the list is refused rather than silently deduplicated — the same rule the
 * action editor follows, for the same reason: a config that fails the import
 * gate on someone else's machine is a defect a long way from its cause.
 *
 * **Entries this build cannot use are shown, not dropped.** A stored `150` in a
 * 1–100 option, or an entry that is not a number at all, is rendered greyed with
 * what will happen to it spelled out, and removing a *different* entry leaves it
 * exactly as stored (docs/specs/dashboard-config/index.md — "Forward
 * Compatibility"). Rewriting it would turn opening the form into a silent edit.
 */
export function NumberArrayEditor({
  label,
  description,
  value,
  min,
  max,
  integer,
  step,
  unit = '',
  placeholder = 'Add a value',
  onChange,
}: NumberArrayEditorProps) {
  const [draft, setDraft] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const entries = readStoredList(value)
  const entrySchema = numberEntrySchema({ min, max, integer })

  const isUsable = (entry: unknown) => entrySchema.safeParse(entry).success
  const describe = (entry: unknown) =>
    typeof entry === 'number' ? `${entry}${unit}` : String(entry)

  const ignoredCount = entries.filter((entry) => !isUsable(entry)).length

  const add = () => {
    if (!draft.trim()) {
      setError('Enter a number to add.')
      return
    }

    const parsed = entrySchema.safeParse(Number(draft))
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    if (entries.some((entry) => entry === parsed.data)) {
      setError(`${describe(parsed.data)} is already in the list.`)
      return
    }

    setError(null)
    setDraft('')
    onChange([...entries, parsed.data])
  }

  const removeAt = (index: number) => {
    // Filtered by position rather than by value: the list may legitimately hold
    // an entry this build does not understand, and matching on value would need
    // to understand it.
    onChange(entries.filter((_, entryIndex) => entryIndex !== index))
  }

  return (
    <Flex direction="column" gap="1">
      <Text size="2" weight="medium">
        {label}
      </Text>

      {entries.length === 0 ? (
        <Text size="1" color="gray">
          Nothing set — the card renders no values.
        </Text>
      ) : (
        <Flex gap="2" wrap="wrap">
          {entries.map((entry, index) => (
            <Button
              key={`${describe(entry)}-${index}`}
              size="3"
              variant="soft"
              color={isUsable(entry) ? 'blue' : 'gray'}
              /*
               * Radix's accent-11 text on an accent-3 surface lands at 4.25:1 in
               * the light appearance — under AA for text this size. The
               * high-contrast step is the design system's own answer to that
               * (docs/specs/storybook/index.md — a11y), and it costs nothing in
               * the dark appearance, which already passes.
               */
              highContrast
              aria-label={`Remove ${describe(entry)}`}
              onClick={() => removeAt(index)}
            >
              {describe(entry)}
              {!isUsable(entry) && ' (ignored)'}
              <X size={14} />
            </Button>
          ))}
        </Flex>
      )}

      {ignoredCount > 0 && (
        <Text size="1" color="gray">
          Greyed values stay in the configuration but are skipped when the card renders.
        </Text>
      )}

      <Flex gap="2" mt="1">
        <TextField.Root
          size="3"
          type="number"
          style={{ flex: 1 }}
          // The refusal is only useful if it reaches the field it is about:
          // `aria-invalid` marks the input, and the message below announces
          // itself, so a screen-reader user finds out why Add did nothing.
          aria-invalid={Boolean(error)}
          value={draft}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          aria-label={`${label} to add`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            add()
          }}
        />
        <Button size="3" variant="soft" onClick={add}>
          Add
        </Button>
      </Flex>

      {error ? (
        <Text size="1" color="red" role="alert">
          {error}
        </Text>
      ) : (
        description && (
          <Text size="1" color="gray">
            {description}
          </Text>
        )
      )}
    </Flex>
  )
}
