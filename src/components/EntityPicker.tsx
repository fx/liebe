import * as React from 'react'
import { Box, Button, Flex, Popover, ScrollArea, Text, TextField } from '@radix-ui/themes'
import { MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { useEntities } from '~/hooks'
import { entityLinkSchema, ENTITY_LINK_DEFAULT } from '~/store/configControls'
import type { HassEntity } from '~/store/entityTypes'

/**
 * How many matches the list renders at once. A Home Assistant install with a
 * few thousand entities would otherwise put all of them in the popover; the
 * search field is the way past the cap, and the footer says so.
 */
const MAX_RESULTS = 50

export interface EntityPickerProps {
  label: string
  description?: string
  /** The stored value, which may be anything a hand-edited config contains. */
  value: unknown
  /** Narrows what the list offers. A stored id outside it is still kept. */
  domains?: string[]
  /** Narrows the list further by `device_class`, for the same reason. */
  deviceClasses?: string[]
  /** Trigger text while nothing is linked. */
  placeholder?: string
  onChange: (entityId: string) => void
}

function friendlyNameOf(entity: HassEntity): string {
  return entity.attributes.friendly_name || entity.entity_id
}

function matchesFilters(
  entity: HassEntity,
  domains: string[] | undefined,
  deviceClasses: string[] | undefined
): boolean {
  if (domains && !domains.includes(entity.entity_id.split('.')[0])) return false
  if (deviceClasses && !deviceClasses.includes(String(entity.attributes.device_class))) return false
  return true
}

function matchesSearch(entity: HassEntity, search: string): boolean {
  if (!search) return true
  const needle = search.toLowerCase()
  return (
    entity.entity_id.toLowerCase().includes(needle) ||
    friendlyNameOf(entity).toLowerCase().includes(needle)
  )
}

/**
 * The entity picker — the config control behind every option that links a
 * second entity to a card (`motionEntity`, `doorEntity`, `batteryEntity`).
 *
 * The option's value is one entity id, so the control is a search-and-pick
 * rather than a text field: an id typed by hand is a config that silently does
 * nothing, and there is no reason to make the user produce one when the panel
 * already knows every entity there is.
 *
 * **A stored id is never rewritten.** Home Assistant instances differ, and a
 * dashboard shared as YAML lands on one where the linked entity may not exist —
 * so an unresolvable id is shown as configured, with a note saying the card will
 * render without it, and left exactly as stored until the user changes it
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility"). The same
 * holds for an id outside the picker's own filters: it stays selected and
 * labelled, because the filters describe what the list *offers*, not what the
 * option is allowed to hold.
 */
export function EntityPicker({
  label,
  description,
  value,
  domains,
  deviceClasses,
  placeholder = 'No entity linked',
  onChange,
}: EntityPickerProps) {
  const { entities, isConnected, isLoading } = useEntities()
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  /*
   * The search box is the only local state: unlike the action editor, this
   * control has no half-typed intermediate value to protect. Every commit is a
   * whole entity id picked from the list, so `value` can stay the single source
   * of what is selected.
   */
  const parsed = entityLinkSchema.safeParse(value)
  const selectedId = parsed.success ? parsed.data : ENTITY_LINK_DEFAULT
  const selectedEntity = selectedId ? entities[selectedId] : undefined

  const matches = React.useMemo(() => {
    return Object.values(entities)
      .filter((entity) => matchesFilters(entity, domains, deviceClasses))
      .filter((entity) => matchesSearch(entity, search))
      .sort((a, b) => friendlyNameOf(a).localeCompare(friendlyNameOf(b)))
  }, [entities, domains, deviceClasses, search])

  const shown = matches.slice(0, MAX_RESULTS)

  /*
   * An empty list has three causes and only one of them is the user's search.
   * Saying "no match" while the panel is still loading, or while it is not
   * talking to Home Assistant at all, describes the config as the problem when
   * the connection is.
   */
  const emptyMessage = isLoading
    ? 'Still loading entities from Home Assistant…'
    : !isConnected
      ? 'Not connected to Home Assistant — no entities to choose from.'
      : 'No entity matches that search.'

  const commit = (entityId: string) => {
    onChange(entityId)
    setOpen(false)
    setSearch('')
  }

  return (
    <Flex direction="column" gap="1">
      <Text size="2" weight="medium">
        {label}
      </Text>

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger>
          <Button size="3" variant="soft" color="gray" aria-label={label}>
            <Text truncate>
              {selectedEntity ? friendlyNameOf(selectedEntity) : selectedId || placeholder}
            </Text>
          </Button>
        </Popover.Trigger>

        <Popover.Content style={{ width: '340px' }}>
          <TextField.Root
            size="3"
            mb="2"
            autoFocus
            value={search}
            placeholder="Search entities…"
            aria-label={`${label} search`}
            onChange={(event) => setSearch(event.target.value)}
          >
            <TextField.Slot>
              <MagnifyingGlassIcon height="16" width="16" />
            </TextField.Slot>
          </TextField.Root>

          <ScrollArea type="always" scrollbars="vertical" style={{ height: 260 }}>
            <Flex direction="column" gap="1" p="1">
              {shown.map((entity) => (
                <Button
                  key={entity.entity_id}
                  size="3"
                  variant={entity.entity_id === selectedId ? 'solid' : 'soft'}
                  color={entity.entity_id === selectedId ? 'blue' : 'gray'}
                  style={{ justifyContent: 'flex-start', height: 'auto', padding: '8px 12px' }}
                  onClick={() => commit(entity.entity_id)}
                >
                  <Flex direction="column" align="start" gap="0">
                    <Text size="2">{friendlyNameOf(entity)}</Text>
                    <Text size="1" color="gray">
                      {entity.entity_id}
                    </Text>
                  </Flex>
                </Button>
              ))}
            </Flex>

            {shown.length === 0 && (
              <Box p="4">
                <Text size="2" color="gray">
                  {emptyMessage}
                </Text>
              </Box>
            )}
          </ScrollArea>

          <Flex
            justify="between"
            align="center"
            mt="2"
            pt="2"
            style={{ borderTop: '1px solid var(--gray-a5)' }}
          >
            <Text size="1" color="gray">
              {matches.length > shown.length
                ? `Showing ${shown.length} of ${matches.length} — keep typing to narrow it down`
                : `${matches.length} available`}
            </Text>
            {selectedId && (
              <Button size="3" variant="ghost" color="gray" onClick={() => commit('')}>
                Clear
              </Button>
            )}
          </Flex>
        </Popover.Content>
      </Popover.Root>

      {selectedId && !selectedEntity && (
        <Text size="1" color="red">
          {selectedId} is not in this Home Assistant. It stays configured, and the card renders
          without it.
        </Text>
      )}

      {description && (
        <Text size="1" color="gray">
          {description}
        </Text>
      )}
    </Flex>
  )
}
