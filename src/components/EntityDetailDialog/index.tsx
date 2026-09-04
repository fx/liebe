import { createElement, Fragment } from 'react'
import { Badge, Box, Flex, Grid, Heading, Spinner, Text } from '@radix-ui/themes'
import { useEntity } from '~/hooks/useEntity'
import { Modal } from '../ui'
import { DetailHistory } from './DetailHistory'
import { getDetailControls } from './detailControls'
import { redactState, redactedAttributes } from './redaction'

export interface EntityDetailDialogProps {
  /** The entity to show. Its domain selects the registered control slot. */
  entityId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * The failure the tile carries while `isError` holds, or null. Rendered as
   * the dialog's failure section carrying the full message and the recovery
   * actions — the carrier the `title` tooltip never was.
   */
  failureMessage?: string | null
  /**
   * Whether the failure is a dispatched service call with a command to repeat.
   * False for the sources with nothing to re-send — a pre-dispatch refusal, a
   * stream that would not start — which offer no `Retry`.
   */
  canRetry?: boolean
  /** Re-dispatches the retained command: gated, guarded, never retried. */
  onRetry?: () => void | Promise<void>
  /** Clears the presentation state; dispatches nothing. */
  onDismiss?: () => void
}

/**
 * The entity detail dialog — what `more-info` opens, and what the default
 * `holdAction` therefore reaches on every card
 * (docs/specs/entity-cards/options/common.md — "Action type").
 *
 * Deliberately minimal: it exists to make hold-to-more-info mean something now.
 * The history section graphs the recent window for entities that have one (see
 * `DetailHistory`), and the domain control slot ships empty for later card
 * changes to register into.
 * It carries no link to the card's configuration — configuration stays reachable
 * only through the card's edit-mode settings button — and it cannot open in edit
 * mode, where the shell suppresses every action.
 *
 * Everything it renders passes through redaction first. A generic state display
 * over an `input_text` in `mode: password` would print the secret the card
 * masks, and so would an attribute list that echoes it; see `redaction.ts`. For
 * the same reason the dialog offers no copy-to-clipboard or raw-JSON affordance:
 * either one would hand out the value the display just masked.
 */
export function EntityDetailDialog({
  entityId,
  open,
  onOpenChange,
  failureMessage,
  canRetry = false,
  onRetry,
  onDismiss,
}: EntityDetailDialogProps) {
  const { entity, isLoading } = useEntity(entityId)

  const domain = entityId.split('.')[0]
  // Looked up, not created: the registry hands back a component another module
  // defined at its own module scope, so this is the stable-identity case the
  // static-components rule is meant to protect — it just cannot see that from
  // a lookup. Rendered through `createElement` for the same reason.
  const domainControls = getDetailControls(domain)

  const friendlyName = entity?.attributes.friendly_name ?? entityId
  const state = entity && redactState(entity)
  const attributes = entity ? redactedAttributes(entity) : []

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={String(friendlyName)}
      // The entity id is the dialog's accessible description, which is both
      // what a screen reader needs to tell two "Ceiling" cards apart and the
      // detail a user opens this dialog to look up.
      description={entityId}
      size="medium"
      actions={{
        cancelLabel: 'Close',
        primary:
          failureMessage && canRetry && onRetry
            ? {
                label: 'Retry',
                variant: 'soft',
                color: 'red',
                onClick: () => void onRetry(),
              }
            : undefined,
        secondary:
          failureMessage && onDismiss ? { label: 'Dismiss', onClick: onDismiss } : undefined,
      }}
    >
      {/*
       * The failure the tile carries, with its recovery actions. First in the
       * dialog so a keyboard or screen-reader user meets the reason the tile
       * reads ERROR before the state it failed to leave. `role="alert"` is
       * read out when it appears, matching the detail controls' own error
       * line. `Dismiss` clears the presentation state and dispatches nothing;
       * `Retry` re-dispatches the retained command through the confirmation
       * gate and the at-most-once guard rather than around either.
       */}
      {failureMessage ? (
        <Box mb="4" data-testid="detail-failure">
          <Text size="2" color="red" role="alert">
            {failureMessage}
          </Text>
        </Box>
      ) : null}
      {isLoading && !entity ? (
        <Flex align="center" gap="2" data-testid="detail-loading">
          <Spinner size="2" />
          <Text size="2" color="gray">
            Loading entity…
          </Text>
        </Flex>
      ) : !entity ? (
        <Text size="2" color="gray" data-testid="detail-missing">
          Home Assistant is not publishing this entity.
        </Text>
      ) : (
        <Flex direction="column" gap="5">
          <Box>
            <Flex align="center" gap="2" wrap="wrap">
              <Text size="7" weight="bold" data-testid="detail-state">
                {state?.value || '—'}
              </Text>
              {entity.attributes.unit_of_measurement !== undefined && (
                <Text size="4" color="gray">
                  {String(entity.attributes.unit_of_measurement)}
                </Text>
              )}
              {state?.redacted && (
                <Badge color="gray" variant="soft">
                  Hidden
                </Badge>
              )}
            </Flex>
          </Box>

          {/* Absent for a domain no card family has registered controls for. */}
          {domainControls && createElement(domainControls, { entity })}

          {/* Absent entirely for an entity with no graphable history. */}
          <DetailHistory entityId={entityId} />

          <Box>
            <Heading size="2" mb="2">
              Attributes
            </Heading>
            {attributes.length === 0 ? (
              <Text size="2" color="gray">
                This entity publishes no attributes.
              </Text>
            ) : (
              <Grid asChild columns="auto 1fr" gapX="4" gapY="1">
                <dl data-testid="detail-attributes">
                  {attributes.map(({ key, value, redacted }) => (
                    <Fragment key={key}>
                      <Text asChild size="2" color="gray">
                        <dt>{key}</dt>
                      </Text>
                      <Text asChild size="2">
                        <dd
                          style={{ margin: 0, overflowWrap: 'anywhere' }}
                          data-redacted={redacted ? 'true' : undefined}
                        >
                          {value}
                        </dd>
                      </Text>
                    </Fragment>
                  ))}
                </dl>
              </Grid>
            )}
          </Box>
        </Flex>
      )}
    </Modal>
  )
}
