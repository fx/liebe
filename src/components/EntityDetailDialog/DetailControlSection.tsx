import type { ReactNode } from 'react'
import { Flex, Text } from '@radix-ui/themes'

export interface DetailControlSectionProps {
  /** The service error the control's last dispatch produced, if any. */
  error?: string | null
  /** The control itself — the same elements the card's `full` tier renders. */
  children: ReactNode
}

/**
 * The frame a domain control renders inside when the detail dialog mounts it.
 *
 * It exists so a card family can register *the same* control its `full` tier
 * renders (docs/changes/0014 — "The detail dialog and its pluggable domain
 * control slot") without that control knowing which surface it is on. The card
 * side of that is `GridCard.Controls`, whose whole contribution is a centred
 * flex row (`.liebe-card-controls`); this supplies the same row off the card,
 * so the control itself renders bare children and fits both.
 *
 * The error line is the one thing this adds that the card does not. A card
 * reports a failed dispatch through the tile's `title` — a tooltip, which is
 * pointer-only and never announced. The dialog is where the helper is operated
 * when the tile is 1×1 and has no control at all, so a refused save has to say
 * so somewhere a keyboard or screen-reader user meets it: `role="alert"` is
 * read out when it appears. `input_datetime` makes this concrete — a helper
 * carrying neither a date nor a time refuses the save with a message naming the
 * shape it wanted, and that message is the only thing distinguishing "refused"
 * from "silently did nothing".
 */
export function DetailControlSection({ error, children }: DetailControlSectionProps) {
  return (
    <Flex direction="column" gap="2" data-testid="detail-controls">
      <Flex align="center" gap="2" wrap="wrap">
        {children}
      </Flex>
      {error ? (
        <Text size="1" color="red" role="alert">
          {error}
        </Text>
      ) : null}
    </Flex>
  )
}
