import * as React from 'react'
import {
  Flex,
  Button,
  Text,
  ScrollArea,
  Box,
  IconButton,
  Switch,
  Select,
  TextField,
  TextArea,
  Dialog,
} from '@radix-ui/themes'
import { X } from 'lucide-react'
import { cardConfigurations, getCardType } from './configurations/cardConfigurations'
import { actionConfigOptions, displayConfigOptions } from './configurations/universalOptions'
import type { GridItem } from '~/store/types'
import type { HassEntity } from '~/store/entityTypes'
import type { CardAction } from '~/store/cardActions'
import { isCounterStateClass, isNumericSensorEntity } from '~/store/sensorOptions'
import { useEntity } from '~/hooks'
import { ActionEditor } from './ActionEditor'
import { EntityPicker } from './EntityPicker'
import { NumberArrayEditor } from './NumberArrayEditor'
import { OrderedMultiSelect } from './OrderedMultiSelect'
import { CardItemProvider } from './cardItemContext'
import { IconSelect } from './IconSelect'
import { WeatherCard } from './WeatherCard'
import { TextCard } from './TextCard'
import { LightCard } from './LightCard'
import { BinarySensorCard } from './BinarySensorCard'
import { Separator as SeparatorCard } from './Separator'
import { GridCard } from './GridCard'
import { dashboardStore } from '~/store'
import { deriveCardTier, type CardSpan } from '~/utils/cardTier'
import { useEffect } from 'react'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: GridItem
  /**
   * The span the item is being laid out at, for the preview. The caller has it
   * — `GridView` from the grid, a card from its own props — and the preview
   * cannot recover it, since nothing about a `GridItem` records the breakpoint
   * it is being shown at.
   */
  span?: CardSpan
  onSave: (updates: Partial<GridItem>) => void
}

interface ContentProps {
  config?: Record<string, unknown>
  onChange?: (updates: Record<string, unknown>) => void
  item?: GridItem
}

/**
 * An entity capability a control depends on.
 *
 * A control the configured entity cannot use is **not rendered**: options are
 * feature-gated automatically from the entity, never from config
 * (docs/specs/entity-cards/options/common.md, convention 3), and a control that
 * writes a key nothing will read looks like a setting that did nothing.
 *
 * - `numeric` — the entity reports readings rather than text, so it has a
 *   history a graph or a trend can be drawn from.
 * - `counter` — its `state_class` is cumulative, the only case bar rendering is
 *   defined for.
 */
export type ConfigOptionRequirement = 'numeric' | 'counter'

// Configuration option types
export interface ConfigOption {
  type:
    | 'boolean'
    | 'string'
    | 'number'
    | 'select'
    | 'textarea'
    | 'icon'
    | 'action'
    | 'entity'
    | 'number-array'
    | 'ordered-multi-select'
  default: unknown
  label: string
  description?: string
  placeholder?: string
  options?: Array<{ value: string; label: string }> // For select and ordered-multi-select types
  min?: number // For number and number-array types
  max?: number // For number and number-array types
  step?: number // For number and number-array types
  integer?: boolean // For number-array type: whole numbers only
  unit?: string // For number-array type: suffix shown after each value
  domains?: string[] // For entity type: narrows what the picker offers
  deviceClasses?: string[] // For entity type: narrows it further
  requires?: ConfigOptionRequirement // Hides the control when the entity cannot use it
}

export interface ConfigDefinition {
  [key: string]: ConfigOption
}

interface SectionProps {
  title: string
  children: React.ReactNode
}

function Section({ title, children }: SectionProps) {
  return (
    <Box mb="4">
      <Text size="2" weight="bold" as="div" mb="2">
        {title}
      </Text>
      <Flex direction="column" gap="2">
        {children}
      </Flex>
    </Box>
  )
}

interface ComponentProps {
  title: string
  description?: string
  configDefinition: ConfigDefinition
  config: Record<string, unknown>
  onChange: (updates: Record<string, unknown>) => void
}

/**
 * A definition key may address one level into a nested option — `stateLabels.onLabel`.
 *
 * Two plain controls writing into one nested key is what the switch card's
 * labels need, and all any option has needed so far (docs/changes/0022 —
 * "`stateLabels` as two flat form fields"). It is deliberately not a general
 * path facility: one dot, resolved here, so `ConfigDefinition` itself gains no
 * schema for nesting and a future generic object control has nothing to undo.
 */
function readOptionValue(config: Record<string, unknown>, key: string): unknown {
  const [head, tail] = key.split('.')
  if (!tail) return config[key]

  const parent = config[head]
  return typeof parent === 'object' && parent !== null
    ? (parent as Record<string, unknown>)[tail]
    : undefined
}

/** The update for a change to `key`, preserving the rest of a nested option. */
function buildOptionUpdate(
  config: Record<string, unknown>,
  key: string,
  value: unknown
): Record<string, unknown> {
  const [head, tail] = key.split('.')
  if (!tail) return { [key]: value }

  const parent = config[head]
  const existing = typeof parent === 'object' && parent !== null ? parent : {}
  return { [head]: { ...existing, [tail]: value } }
}

function Component({ title, description, configDefinition, config, onChange }: ComponentProps) {
  const handleChange = (key: string, value: unknown) => {
    onChange(buildOptionUpdate(config, key, value))
  }

  const renderConfigOption = (key: string, option: ConfigOption) => {
    const currentValue = readOptionValue(config, key) ?? option.default

    switch (option.type) {
      case 'boolean':
        return (
          <Flex key={key} direction="column" gap="1">
            <Flex align="center" justify="between">
              <Text size="2" weight="medium">
                {option.label}
              </Text>
              <Switch
                checked={Boolean(currentValue)}
                onCheckedChange={(checked) => handleChange(key, checked)}
              />
            </Flex>
            {option.description && (
              <Text size="1" color="gray">
                {option.description}
              </Text>
            )}
          </Flex>
        )

      case 'string':
        return (
          <Flex key={key} direction="column" gap="1">
            <Text size="2" weight="medium">
              {option.label}
            </Text>
            <TextField.Root
              value={String(currentValue || '')}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={option.placeholder}
            />
            {option.description && (
              <Text size="1" color="gray">
                {option.description}
              </Text>
            )}
          </Flex>
        )

      case 'textarea':
        return (
          <Flex key={key} direction="column" gap="1">
            <Text size="2" weight="medium">
              {option.label}
            </Text>
            <TextArea
              value={String(currentValue || '')}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={option.placeholder}
              rows={3}
            />
            {option.description && (
              <Text size="1" color="gray">
                {option.description}
              </Text>
            )}
          </Flex>
        )

      case 'number':
        return (
          <Flex key={key} direction="column" gap="1">
            <Text size="2" weight="medium">
              {option.label}
            </Text>
            <TextField.Root
              type="number"
              value={String(currentValue || option.default || '')}
              onChange={(e) => {
                const value = e.target.value === '' ? option.default : Number(e.target.value)
                handleChange(key, value)
              }}
              placeholder={option.placeholder}
              min={option.min}
              max={option.max}
              step={option.step}
            />
            {option.description && (
              <Text size="1" color="gray">
                {option.description}
              </Text>
            )}
          </Flex>
        )

      case 'select':
        return (
          <Flex key={key} direction="column" gap="1">
            <Text size="2" weight="medium">
              {option.label}
            </Text>
            <Select.Root
              value={String(currentValue || option.default || '')}
              onValueChange={(value) => handleChange(key, value)}
            >
              <Select.Trigger />
              <Select.Content position="popper">
                {option.options?.map((opt) => (
                  <Select.Item key={opt.value} value={opt.value}>
                    {opt.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
            {option.description && (
              <Text size="1" color="gray">
                {option.description}
              </Text>
            )}
          </Flex>
        )

      case 'icon':
        return (
          <Flex key={key} direction="column" gap="1">
            <Text size="2" weight="medium">
              {option.label}
            </Text>
            <Box style={{ marginTop: '8px' }}>
              <IconSelect
                value={String(currentValue || option.default || '')}
                onChange={(iconName) => handleChange(key, iconName)}
                buttonLabel={option.placeholder || 'Select Icon'}
              />
            </Box>
            {option.description && (
              <Text size="1" color="gray" style={{ marginTop: '8px' }}>
                {option.description}
              </Text>
            )}
          </Flex>
        )

      case 'action':
        return (
          <ActionEditor
            key={key}
            label={option.label}
            description={option.description}
            value={config[key]}
            defaultValue={option.default as CardAction}
            onChange={(action) => handleChange(key, action)}
          />
        )

      /*
       * The three shared non-scalar controls. Each takes the stored value raw
       * and resolves it itself, because "what this build does with a value it
       * does not recognise" is part of each control's contract rather than
       * something the form can decide for them
       * (docs/specs/entity-cards/options/common.md).
       */
      case 'entity':
        return (
          <EntityPicker
            key={key}
            label={option.label}
            description={option.description}
            value={currentValue}
            domains={option.domains}
            deviceClasses={option.deviceClasses}
            placeholder={option.placeholder}
            onChange={(entityId) => handleChange(key, entityId)}
          />
        )

      case 'number-array':
        return (
          <NumberArrayEditor
            key={key}
            label={option.label}
            description={option.description}
            value={currentValue}
            min={option.min}
            max={option.max}
            step={option.step}
            integer={option.integer}
            unit={option.unit}
            placeholder={option.placeholder}
            onChange={(values) => handleChange(key, values)}
          />
        )

      case 'ordered-multi-select':
        return (
          <OrderedMultiSelect
            key={key}
            label={option.label}
            description={option.description}
            value={currentValue}
            options={option.options ?? []}
            onChange={(values) => handleChange(key, values)}
          />
        )

      default:
        return null
    }
  }

  return (
    <Section title={title}>
      {description && (
        <Text size="2" color="gray" style={{ marginBottom: '12px' }}>
          {description}
        </Text>
      )}
      <Flex direction="column" gap="3">
        {Object.entries(configDefinition).map(([key, option]) => renderConfigOption(key, option))}
      </Flex>
    </Section>
  )
}

/**
 * Whether the configured entity can use a control, for the definitions that
 * declare a requirement. Resolved against the live entity — the same predicate
 * the history service resolves `unsupported` with — so the form offers exactly
 * the options that can take effect.
 */
function meetsRequirement(
  requires: ConfigOptionRequirement | undefined,
  entity: HassEntity | undefined
): boolean {
  if (requires === undefined) return true
  if (!isNumericSensorEntity(entity)) return false
  return requires === 'numeric' || isCounterStateClass(entity?.attributes?.state_class)
}

function Content({ config = {}, onChange = () => {}, item }: ContentProps) {
  // Read before the early returns below, because a hook cannot be called after
  // one. An item with no entity (a separator, a text card) has no capabilities
  // to gate on and no definition that declares any.
  const { entity } = useEntity(item?.entityId ?? '')

  const cardType =
    item?.type === 'separator'
      ? 'separator'
      : item?.type === 'text'
        ? 'text'
        : item
          ? getCardType(item)
          : undefined

  if (!item || !cardType || !cardConfigurations[cardType]) {
    return (
      <Section title="Configuration">
        <Text size="2" color="gray">
          No configuration options available for this card type.
        </Text>
      </Section>
    )
  }

  const cardConfig = cardConfigurations[cardType]

  // If this card has a configuration definition, use Component
  if (cardConfig.definition) {
    const definition = Object.fromEntries(
      Object.entries(cardConfig.definition).filter(([, option]) =>
        meetsRequirement(option.requires, entity)
      )
    )

    return (
      <Component
        title={cardConfig.title}
        description={cardConfig.description}
        configDefinition={definition}
        config={config}
        onChange={onChange}
      />
    )
  }

  // Otherwise, show placeholder text
  return (
    <Section title={cardConfig.title}>
      <Text size="2" color="gray">
        {cardConfig.placeholder || 'No configuration options available yet.'}
      </Text>
    </Section>
  )
}

/**
 * The universal option surface, rendered alongside whatever options the card
 * itself defines (docs/specs/entity-cards/options/common.md).
 *
 * It sits beside `Content` rather than inside it so that every entity card gets
 * it — including the domains with no per-card definition at all, which `Content`
 * answers with "no configuration options available". Separators and text cards
 * are not entity cards and have no entity for an action to act on.
 */
function UniversalOptions({ item, config, onChange }: Required<ContentProps>) {
  if (item.type !== 'entity') return null

  return (
    <>
      <Component
        title="Display"
        description="Name, icon and colour overrides. Every option here leaves the card as it was when unset."
        configDefinition={displayConfigOptions}
        config={config}
        onChange={onChange}
      />
      <Component
        title="Actions"
        description="What each gesture on this card does."
        configDefinition={actionConfigOptions}
        config={config}
        onChange={onChange}
      />
    </>
  )
}

interface PreviewProps {
  item: GridItem
  config: Record<string, unknown>
  span?: CardSpan
}

// Wrapper component that temporarily sets mode to 'view' for preview
function ViewModeWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Store current mode
    const currentMode = dashboardStore.state.mode

    // Set to view mode
    dashboardStore.setState((state) => ({
      ...state,
      mode: 'view',
    }))

    // Restore original mode on unmount
    return () => {
      dashboardStore.setState((state) => ({
        ...state,
        mode: currentMode,
      }))
    }
  }, [])

  return <>{children}</>
}

function Preview({ item, config, span }: PreviewProps) {
  /*
   * The preview renders the card at the tier it will actually render at on the
   * grid, which means the *effective* span — the caller's, scaled to the
   * breakpoint's column count before it got here. Falling back to the stored
   * dimensions is the last resort for a caller with no grid behind it: it is
   * the same number at the wide breakpoints, and a preview is better than
   * none at the narrow ones (docs/changes/0011-layout-tiers.md).
   */
  const effectiveSpan = span ?? { width: item.width, height: item.height }
  const tier = deriveCardTier(effectiveSpan)

  const cardType =
    item?.type === 'separator'
      ? 'separator'
      : item?.type === 'text'
        ? 'text'
        : item
          ? getCardType(item)
          : undefined

  if (!cardType || !cardConfigurations[cardType]) {
    return (
      <Section title="Preview">
        <Text size="2" color="gray">
          No preview available for this card type.
        </Text>
      </Section>
    )
  }

  // Merge current config with item properties for preview
  const previewItem = { ...item }
  if (item.type === 'separator') {
    Object.assign(previewItem, config)
  } else if (item.type === 'text') {
    Object.assign(previewItem, config)
  } else {
    previewItem.config = config
  }

  return (
    <ViewModeWrapper>
      <Section title="Preview">
        <Text size="2" color="gray" style={{ marginBottom: '16px' }}>
          Live preview of your configuration
        </Text>
        <Box
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '16px',
            backgroundColor: 'var(--gray-2)',
            borderRadius: 'var(--radius-3)',
            minHeight: '200px',
            alignItems: 'center',
          }}
        >
          <Box style={{ width: '280px', pointerEvents: 'none' }}>
            {item.type === 'separator' ? (
              <GridCard domain="separator" tier={tier} transparent={previewItem.hideBackground}>
                <SeparatorCard
                  title={previewItem.title}
                  orientation={previewItem.separatorOrientation || 'horizontal'}
                  textColor={previewItem.separatorTextColor || 'gray'}
                />
              </GridCard>
            ) : item.type === 'text' ? (
              <GridCard domain="text" tier={tier} transparent={previewItem.hideBackground}>
                <TextCard
                  entityId={item.id}
                  content={previewItem.content}
                  alignment={previewItem.alignment}
                  textSize={previewItem.textSize}
                  textColor={previewItem.textColor}
                  isSelected={false}
                  onSelect={undefined}
                />
              </GridCard>
            ) : cardType === 'weather' && item.entityId ? (
              <WeatherCard
                entityId={item.entityId}
                tier={tier}
                span={effectiveSpan}
                config={config}
              />
            ) : cardType === 'light' && item.entityId ? (
              <LightCard entityId={item.entityId} tier={tier} item={previewItem} />
            ) : cardType === 'binary_sensor' && item.entityId ? (
              <BinarySensorCard entityId={item.entityId} tier={tier} item={previewItem} />
            ) : (
              <Text size="2" color="gray">
                Preview not available for this card type
              </Text>
            )}
          </Box>
        </Box>
      </Section>
    </ViewModeWrapper>
  )
}

function Modal({ open, onOpenChange, item, span, onSave }: ModalProps) {
  // Initialize config based on item type
  const getInitialConfig = () => {
    if (item.type === 'separator') {
      // For separator, use the direct properties as config
      return {
        title: item.title || '',
        separatorOrientation: item.separatorOrientation || 'horizontal',
        separatorTextColor: item.separatorTextColor || 'gray',
        hideBackground: item.hideBackground || false,
      }
    } else if (item.type === 'text') {
      // For text cards, use the direct properties as config
      return {
        content: item.content || '# Text Card\n\nDouble-click to edit this text.',
        alignment: item.alignment || 'left',
        textSize: item.textSize || 'medium',
        textColor: item.textColor || 'default',
        hideBackground: item.hideBackground || false,
      }
    }
    return item.config || {}
  }

  const [localConfig, setLocalConfig] = React.useState<Record<string, unknown>>(getInitialConfig())

  React.useEffect(() => {
    setLocalConfig(getInitialConfig())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item])

  const handleSave = () => {
    // For separator, we need to save the config as direct properties
    if (item.type === 'separator') {
      onSave({
        title: localConfig.title as string,
        separatorOrientation: localConfig.separatorOrientation as 'horizontal' | 'vertical',
        separatorTextColor: localConfig.separatorTextColor as string,
        hideBackground: localConfig.hideBackground as boolean,
      })
    } else if (item.type === 'text') {
      // For text cards, save the config as direct properties
      onSave({
        content: localConfig.content as string,
        alignment: localConfig.alignment as 'left' | 'center' | 'right',
        textSize: localConfig.textSize as 'small' | 'medium' | 'large',
        textColor: localConfig.textColor as string,
        hideBackground: localConfig.hideBackground as boolean,
      })
    } else {
      onSave({ config: localConfig })
    }
    onOpenChange(false)
  }

  const handleConfigChange = (updates: Record<string, unknown>) => {
    setLocalConfig((prev) => ({ ...prev, ...updates }))
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="900px" style={{ maxHeight: '85vh', padding: 0 }}>
        <Flex
          direction="column"
          style={{
            height: '100%',
            maxHeight: '85vh',
          }}
        >
          <Flex
            align="center"
            justify="between"
            p="4"
            style={{ borderBottom: '1px solid var(--gray-a5)' }}
          >
            <Dialog.Title size="5">Card Configuration</Dialog.Title>
            <Dialog.Description size="2" style={{ display: 'none' }}>
              Configure card display options
            </Dialog.Description>
            <Dialog.Close>
              <IconButton size="2" variant="ghost">
                <X size={16} />
              </IconButton>
            </Dialog.Close>
          </Flex>

          <Box style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <Flex style={{ height: '100%' }} gap="4">
              {/* Left side - Configuration form */}
              <Box style={{ flex: 1, overflow: 'hidden' }}>
                <ScrollArea>
                  <Box p="4">
                    <Content config={localConfig} onChange={handleConfigChange} item={item} />
                    <UniversalOptions
                      config={localConfig}
                      onChange={handleConfigChange}
                      item={item}
                    />
                  </Box>
                </ScrollArea>
              </Box>

              {/* Right side - Preview */}
              <Box
                style={{
                  width: '350px',
                  borderLeft: '1px solid var(--gray-a5)',
                  overflow: 'hidden',
                }}
              >
                <ScrollArea>
                  <Box p="4">
                    {/*
                     * The preview renders inside the context the grid publishes
                     * for a placed item, so the universal options — which the
                     * shell reads from there rather than from a card prop — show
                     * up here as they will on the dashboard. Without it the
                     * display section would be editing a card the preview never
                     * changed.
                     */}
                    <CardItemProvider entityId={item.entityId} config={localConfig}>
                      <Preview item={item} config={localConfig} span={span} />
                    </CardItemProvider>
                  </Box>
                </ScrollArea>
              </Box>
            </Flex>
          </Box>

          <Flex gap="3" justify="end" p="4" style={{ borderTop: '1px solid var(--gray-a5)' }}>
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button onClick={handleSave}>Save Changes</Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}

// Create compound component with forward declaration
export const CardConfig = {} as {
  Modal: typeof Modal
  Section: typeof Section
  Component: typeof Component
}

// Assign components
CardConfig.Modal = Modal
CardConfig.Section = Section
CardConfig.Component = Component
