import { AlertDialog, Button, Flex } from '@radix-ui/themes'
import { useStore } from '@tanstack/react-store'
import { entityStore } from '~/store/entityStore'
import type { CardConfirmRequest } from '~/hooks/useCardActions'

interface ConfirmToggleDialogProps {
  /** The gated action, holding the closure that dispatches it. */
  request: CardConfirmRequest
  /** Whether the entity is on — what a `toggle` route would invert. */
  isOn: boolean
  /** The card's `name` override, which wins over the entity's friendly name. */
  name?: string
  /** Called once the request is settled, either way. */
  onResolve: () => void
}

/**
 * The confirmation a `confirm: true` card puts in front of a toggle
 * (docs/specs/entity-cards/options/switch.md — "`confirm`").
 *
 * An `AlertDialog` rather than a `Dialog` precisely because of its dismissal
 * semantics: a stray tap outside it does nothing, so the choice has to be made
 * rather than fallen out of. It names the entity and the state the action would
 * leave it in — "Turn off Well Pump?" — because a card asking "are you sure?"
 * about an unnamed device is a dialog people learn to confirm blindly.
 *
 * Mounted only while a request is pending, so a screen of switch cards carries
 * no dialogs (nor entity subscriptions) behind it.
 */
export function ConfirmToggleDialog({ request, isOn, name, onResolve }: ConfirmToggleDialogProps) {
  const friendlyName = useStore(
    entityStore,
    (state) => state.entities[request.entityId]?.attributes?.friendly_name
  )

  const label = name || (typeof friendlyName === 'string' ? friendlyName : request.entityId)
  // `toggle` is the only route whose target depends on where the entity is now;
  // the other two say so themselves.
  const targetOn = request.service === 'toggle' ? !isOn : request.service === 'turn_on'
  const verb = targetOn ? 'Turn on' : 'Turn off'

  return (
    <AlertDialog.Root
      open
      /*
       * Any reported change settles the request. Unlike the detail dialog —
       * whose `open` is bound to state that can legitimately report `true`
       * while reconciling — this one is mounted at a literal `open` and
       * unmounted the moment it resolves, so the only change it can ever report
       * is the close from Cancel, Escape, or the action button.
       */
      onOpenChange={onResolve}
    >
      <AlertDialog.Content maxWidth="420px">
        <AlertDialog.Title>{`${verb} ${label}?`}</AlertDialog.Title>
        <AlertDialog.Description size="2">
          This card asks before switching {label}.
        </AlertDialog.Description>

        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray" size="3">
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button
              size="3"
              onClick={() => {
                request.proceed()
                onResolve()
              }}
            >
              {verb}
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  )
}
