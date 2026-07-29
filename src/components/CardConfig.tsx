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
import {
  coverSupportsPosition,
  coverSupportsTilt,
  readCoverDeviceClass,
} from './CoverCard/presentation'
import { isSecurityCover } from '~/store/coverOptions'
import { resolveArmModes } from './AlarmCard/presentation'
import { fanHasPresets, readFanFeatures } from './FanCard/features'
import { actionConfigOptions, displayConfigOptions } from './configurations/universalOptions'
import type { GridItem } from '~/store/types'
import type { HassEntity } from '~/store/entityTypes'
import type { CardAction } from '~/store/cardActions'
import { isCounterStateClass, isNumericSensorEntity } from '~/store/sensorOptions'
import { readClimateCapabilities } from './ClimateCard/climateModel'
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
 * **Every requirement below MUST be answered by the same predicate its render
 * path uses — never by a second one shaped like it.** A gate and a renderer
 * asking different questions about one attribute is how a user is offered an
 * option, turns it on, and nothing happens, with no error and nothing to say
 * why. `fan-presets` shipped that way: the form asked whether `preset_modes`
 * had entries while the card asked whether it had *strings*, so a fan
 * publishing `[1, null]` was offered a control it could never render. So a new
 * requirement imports the card's predicate; if the card has none to import,
 * that is the thing to write first.
 *
 * - `numeric` — the entity reports readings rather than text, so it has a
 *   history a graph or a trend can be drawn from.
 * - `counter` — its `state_class` is cumulative, the only case bar rendering is
 *   defined for.
 * - `cover-position` — the cover advertises set-position, so a position slider
 *   (and the reversed-scale declaration that only a position can express) has
 *   something to drive.
 * - `cover-tilt` — the cover advertises at least one tilt bit.
 * - `security-cover` — the cover's `device_class` is one of the perimeter
 *   openings, the only ones `confirmOpen` is offered for.
 * - `fan-speed` / `fan-oscillate` / `fan-direction` — the fan advertises the
 *   matching capability bit.
 * - `fan-presets` — the fan advertises `PRESET_MODE` **and** lists modes; the
 *   bit without a list is a control with nothing in it.
 * - `climate-presets` / `climate-fan-modes` — the thermostat advertises the
 *   feature bit *and* publishes a non-empty list, so there is a pill row to
 *   show or hide.
 * - `climate-humidity` — it reports a `current_humidity` to display.
 * - `alarm-arm-modes` — the panel advertises at least one arm-mode bit, so the
 *   multi-select has something to offer. Answered by the card's own
 *   `resolveArmModes`, which is also what filters the stored list at render
 *   time — so the form cannot offer a mode the card would then drop.
 */
export type ConfigOptionRequirement =
  | 'numeric'
  | 'counter'
  | 'cover-position'
  | 'cover-tilt'
  | 'security-cover'
  | 'fan-speed'
  | 'fan-oscillate'
  | 'fan-direction'
  | 'fan-presets'
  | 'climate-presets'
  | 'climate-fan-modes'
  | 'climate-humidity'
  | 'alarm-arm-modes'

/**
 * An entity-derived choice set.
 *
 * - `alarm-arm-modes` — the arm modes this panel's `supported_features`
 *   advertises, in the definition's own order, resolved by the card's
 *   `resolveArmModes`.
 */
export type ConfigOptionChoiceSource = 'alarm-arm-modes'

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
  /**
   * The value of the choice that means "no explicit setting" — selecting it
   * *removes* the key rather than storing this string.
   *
   * For options whose real default is derived from the entity rather than
   * fixed (`input_number`'s control style follows the helper's own `mode`),
   * absence is the only way to say "follow it". Without a choice that writes
   * absence, a form built on `Select` can only ever write a concrete value, so
   * opening the form would silently pin a card that was following its entity —
   * and nothing would ever get it back (docs/changes/0022).
   */
  clearValue?: string
  domains?: string[] // For entity type: narrows what the picker offers
  deviceClasses?: string[] // For entity type: narrows it further
  requires?: ConfigOptionRequirement // Hides the control when the entity cannot use it
  /**
   * Narrows the CHOICES to what the entity can actually perform.
   *
   * `requires` decides whether a control exists at all; this decides what is
   * inside it, and the two are not the same question. An alarm panel that
   * supports only `away` passes `alarm-arm-modes` — it has *some* arm mode — so
   * the multi-select renders, and without this it would still offer all four.
   * A user then configures `vacation`, the card correctly refuses to render a
   * mode the panel cannot arm to, and the result reads as the card being broken
   * rather than the panel being incapable: the capability check ends up hidden
   * behind a control that suggested otherwise.
   *
   * Answered by the card's own resolver, for the same reason `requires` is —
   * a second predicate shaped like it is how the form and the card come to
   * disagree.
   */
  optionsFrom?: ConfigOptionChoiceSource
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
  const handleChange = (key: string, value: unknown, option?: ConfigOption) => {
    // The "follow the entity" choice stores nothing: `undefined` is what the
    // merge below removes the key on, so the card goes back to resolving its
    // own default rather than carrying a value that pins it.
    const stored =
      option?.clearValue !== undefined && value === option.clearValue ? undefined : value

    onChange(buildOptionUpdate(config, key, stored))
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
              onValueChange={(value) => handleChange(key, value, option)}
            >
              {/*
               * The trigger carries the option's label as its accessible name.
               * Without it the control announces as nothing: the `<Text>` above
               * is a sibling, not a `<label>`, so nothing associates the two —
               * a screen-reader user meets an unnamed combobox, and the only
               * way a test could reach it was by walking the DOM from the label
               * beside it, which is a test routing around the defect rather
               * than reporting it.
               */}
              <Select.Trigger aria-label={option.label} />
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

  // The cover requirements read capabilities off the entity through the card's
  // own predicates, so the form and the card can never disagree about whether a
  // control is possible.
  if (requires === 'cover-position') return coverSupportsPosition(entity?.attributes)
  if (requires === 'cover-tilt') return coverSupportsTilt(entity?.attributes)
  // Answered by the card's own resolver rather than a second predicate shaped
  // like it: `undefined` asks it for every mode the panel supports.
  if (requires === 'alarm-arm-modes') {
    return resolveArmModes(entity?.attributes, undefined).length > 0
  }

  if (requires === 'security-cover') {
    return isSecurityCover(readCoverDeviceClass(entity?.attributes))
  }

  if (requires.startsWith('fan-')) {
    const features = readFanFeatures(entity?.attributes)
    if (requires === 'fan-speed') return features.speed
    if (requires === 'fan-oscillate') return features.oscillate
    if (requires === 'fan-direction') return features.direction
    /*
     * The card's own predicate, not a second one shaped like it. Reading only
     * `preset_modes.length` offered the option to a fan publishing `[1, null]`
     * — modes the renderers filter out — so enabling it produced a card that
     * could never show a preset control, with nothing to say why.
     */
    return fanHasPresets(entity?.attributes)
  }

  // Climate reads its three the same way, through the card's own reader — and
  // reads them once, because all three are answers from one pass over the
  // entity.
  if (requires.startsWith('climate-')) {
    const climate = readClimateCapabilities(entity)
    if (requires === 'climate-presets') return climate.presets
    if (requires === 'climate-fan-modes') return climate.fanModes
    return climate.humidity
  }

  if (!isNumericSensorEntity(entity)) return false
  return requires === 'numeric' || isCounterStateClass(entity?.attributes?.state_class)
}

/**
 * Narrow an option's choices to what this entity can perform.
 *
 * Returns the option untouched when it declares no source — which is every
 * option but one today, so the common path allocates nothing.
 *
 * The definition's own list is *filtered* rather than rebuilt from the
 * resolver's output: that keeps the labels and the ordering the definition
 * declares, and means a mode the resolver knows about but the form never
 * offered cannot appear by accident.
 *
 * An option that declares `optionsFrom` but no `options` narrows to nothing.
 * That is an authoring guard rather than a runtime state — no shipped
 * definition does it — but it IS reachable by the next person to add a source,
 * and narrowing to empty is the right answer for them: a control with no
 * choices is visibly wrong, where falling back to "offer everything" would be
 * invisibly wrong and would defeat the whole point of this function.
 *
 * Exported for its own test, because both arms matter and neither is reachable
 * through the shipped definitions.
 */
export function narrowChoices(option: ConfigOption, entity: HassEntity | undefined): ConfigOption {
  if (option.optionsFrom !== 'alarm-arm-modes') return option

  const supported = new Set<string>(resolveArmModes(entity?.attributes, undefined))
  return { ...option, options: (option.options ?? []).filter((c) => supported.has(c.value)) }
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
      Object.entries(cardConfig.definition)
        .filter(([, option]) => meetsRequirement(option.requires, entity))
        // The choices are narrowed in the same pass that drops unusable
        // controls, because they are the same rule one level down: the form
        // must not offer what the entity cannot do.
        .map(([key, option]) => [key, narrowChoices(option, entity)])
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
    setLocalConfig((prev) => {
      const next = { ...prev, ...updates }
      /*
       * An `undefined` update removes its key rather than storing it: a config
       * carrying `controlStyle: undefined` is neither absent nor a value —
       * `JSON.stringify` would drop it while a YAML dump would write something
       * for it, so the two halves of the same document would disagree about
       * whether the card is configured.
       */
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) delete next[key]
      }
      return next
    })
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
