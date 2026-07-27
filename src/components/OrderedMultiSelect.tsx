import { Button, Flex, IconButton, Text } from '@radix-ui/themes'
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import { readStoredList } from '~/store/configControls'

export interface OrderedMultiSelectOption {
  value: string
  label: string
}

export interface OrderedMultiSelectProps {
  label: string
  description?: string
  /** The stored value, which may be anything a hand-edited config contains. */
  value: unknown
  /**
   * The canonical choice list, in the order it is offered. A card whose entity
   * supports only some of the values passes the narrowed list — the control
   * offers what it is given and keeps what it is stored.
   */
  options: OrderedMultiSelectOption[]
  onChange: (values: unknown[]) => void
}

/**
 * The ordered multi-select — the config control behind options that are a
 * subset of a canonical enum *in a user-chosen order*, such as the alarm card's
 * `armModes`, whose first entry is also the mode its single-pill tiers offer.
 *
 * Order is why this is not a set of checkboxes: the stored sequence is data the
 * card reads, so selecting has to be separable from arranging. Each selected
 * value therefore carries its own move-up/move-down/remove controls, and the
 * unselected values are appended from a row of add buttons.
 *
 * **A stored value the caller did not offer is kept in place.** It arrives that
 * way from a newer build, from a hand-edited config, or from an entity whose
 * `supported_features` no longer advertises it — none of which make it the
 * form's business to delete. It renders where it is stored, marked as not
 * available, and moves and removes like any other entry, so the user can act on
 * it deliberately (docs/specs/dashboard-config/index.md — "Forward
 * Compatibility").
 */
export function OrderedMultiSelect({
  label,
  description,
  value,
  options,
  onChange,
}: OrderedMultiSelectProps) {
  const selected = readStoredList(value)
  const labelOf = (entry: unknown) =>
    options.find((option) => option.value === entry)?.label ?? String(entry)
  const isOffered = (entry: unknown) => options.some((option) => option.value === entry)

  const available = options.filter((option) => !selected.includes(option.value))

  const move = (index: number, delta: number) => {
    const next = [...selected]
    const [entry] = next.splice(index, 1)
    next.splice(index + delta, 0, entry)
    onChange(next)
  }

  const removeAt = (index: number) => {
    onChange(selected.filter((_, entryIndex) => entryIndex !== index))
  }

  return (
    <Flex direction="column" gap="1">
      <Text size="2" weight="medium">
        {label}
      </Text>

      {selected.length === 0 ? (
        <Text size="1" color="gray">
          Nothing selected — the card shows none of these.
        </Text>
      ) : (
        <Flex direction="column" gap="1">
          {selected.map((entry, index) => (
            <Flex key={`${String(entry)}-${index}`} align="center" gap="2">
              <Text size="2" color={isOffered(entry) ? undefined : 'gray'} style={{ flex: 1 }}>
                {labelOf(entry)}
                {!isOffered(entry) && ' (not available)'}
              </Text>
              <IconButton
                size="3"
                variant="soft"
                color="gray"
                aria-label={`Move ${labelOf(entry)} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ChevronUp size={16} />
              </IconButton>
              <IconButton
                size="3"
                variant="soft"
                color="gray"
                aria-label={`Move ${labelOf(entry)} down`}
                disabled={index === selected.length - 1}
                onClick={() => move(index, 1)}
              >
                <ChevronDown size={16} />
              </IconButton>
              <IconButton
                size="3"
                variant="soft"
                color="gray"
                aria-label={`Remove ${labelOf(entry)}`}
                onClick={() => removeAt(index)}
              >
                <X size={16} />
              </IconButton>
            </Flex>
          ))}
        </Flex>
      )}

      {available.length > 0 && (
        <Flex gap="2" wrap="wrap" mt="1">
          {available.map((option) => (
            <Button
              key={option.value}
              size="3"
              variant="soft"
              color="gray"
              aria-label={`Add ${option.label}`}
              onClick={() => onChange([...selected, option.value])}
            >
              <Plus size={14} />
              {option.label}
            </Button>
          ))}
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
