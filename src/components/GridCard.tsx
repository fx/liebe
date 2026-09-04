import * as React from 'react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { IconButton, Spinner, Theme } from '@radix-ui/themes'
import { X, Settings } from 'lucide-react'
import { useStore } from '@tanstack/react-store'
import { useDashboardStore } from '~/store'
import { entityStore } from '~/store/entityStore'
import {
  useCardActions,
  type CardConfirmPrompt,
  type CardConfirmRequest,
} from '~/hooks/useCardActions'
import { useCardItem } from './cardItemContext'
import { EntityDetailDialog } from './EntityDetailDialog'
import { ConfirmToggleDialog } from './ConfirmToggleDialog'
import { CardMeta, CardName, CardState, IconCircle, hueStyle } from './anatomy'
import {
  readCardDisplay,
  resolveCardColor,
  type CardAlignOption,
  type CardDisplayOptions,
} from '~/store/cardDisplay'
import { isCardBodyElement } from './cardBodyMarker'
import { observeContentWidth } from './cardContentWidth'
import { getIcon } from '~/utils/iconList'
import type { ResolvedCardAction } from '~/store/cardActions'
import type { DomainColorName } from '~/theme/tokens'
import type { CardTier } from '~/utils/cardTier'
import './GridCard.css'

// Types
export interface GridCardProps {
  children: React.ReactNode
  /**
   * The entity's domain, stamped as `data-domain` on the tile and handed to
   * every anatomy part the shell renders. Required for the same reason the
   * anatomy requires it: the stable selector contract is only worth something
   * if every card is reachable by it, and a defaulted domain would trade a
   * missing attribute for a wrong one.
   */
  domain: string
  /**
   * Which `--liebe-c-*` triplet this card's rendered state resolves to. It is a
   * state input, not a fixed per-domain setting — a thermostat passes `heat`,
   * `cool` or `ok` depending on what it is doing.
   *
   * This is what the stored `color: auto` resolves to. A stored colour other
   * than `auto` pins the triplet and this prop stops being consulted, which is
   * the whole of the option: the user asked for one colour, so the card's state
   * no longer moves it.
   */
  color?: DomainColorName
  /**
   * A live colour the entity itself reports — a bulb's actual RGB under the
   * light card's `useLightColor`. Offered rather than applied: `resolveCardHue`
   * decides whether it survives the card's configured colour and its danger
   * state, and parts read the survivor off context.
   */
  hue?: string
  /**
   * The entity is in a danger state — a jammed lock, a triggered alarm — as
   * opposed to merely active. A card family declares it from its own domain
   * knowledge; the shell's part is that such a card cannot be *configured* into
   * looking calm: the display options that carry the warning stop applying
   * while it holds (REVIEW.md — "Danger states"; `applyDangerFloor` in
   * `~/store/cardDisplay`). No card declares one yet — the security and lock
   * families arrive with 0024 — but the guard ships with the mechanism it
   * guards rather than after it.
   */
  danger?: boolean
  /**
   * How far along its range a level-bearing entity is, as a fraction from `0`
   * to `1` — a light's brightness, a fan's speed, a cover's position. It is
   * what modulates the strength of an **icon-only tile's** state tint, so a
   * dimmed lamp reads dimmer than a full one (docs/specs/design-system —
   * "Card anatomy", the icon-only tile exception).
   *
   * The same normalised value the card already computes for its own slider,
   * passed rather than re-derived: the tile and the control it replaces are
   * describing one level, and a second derivation is a second answer waiting
   * to disagree with the first. Cards hold it as a percentage, so the call
   * site divides.
   *
   * Left unset by a card with no level — a switch, a lock, a sensor — and that
   * absence is not `0`: an unset level means "this entity has no level", and
   * the tile carries the undimmed tint. Passing `0` says the entity is at the
   * bottom of a range it has, which is a different tile.
   *
   * Read only while `iconOnly` holds. Everywhere else the tile is neutral and
   * the level is already on the card's own slider.
   */
  level?: number
  /**
   * The layout tier this card renders at, derived by the renderer from the
   * item's effective grid span (`~/utils/cardTier`) and stamped on the tile as
   * `data-tier` — public API under the stable selector contract
   * (docs/specs/theming/index.md).
   *
   * Defaulted rather than required, unlike `domain`: every shell renders at
   * some tier, so the contract's presence guarantee has to hold even for a
   * shell rendered outside a grid — a story, the configuration preview, the
   * sidebar widget. `row` is that default because it is the shape a card with
   * no other information should take: the icon-and-meta row every card
   * implements.
   */
  tier?: CardTier
  isLoading?: boolean
  isError?: boolean
  isStale?: boolean
  isSelected?: boolean
  isOn?: boolean
  isUnavailable?: boolean
  onSelect?: () => void
  onDelete?: () => void
  /**
   * The card family's toggle semantics — what a tap does when the resolved
   * action is `toggle`, confirmation gates and all. Named `onClick` for the
   * cards that have always passed it here; the shell no longer calls it on
   * every click, it calls it when a gesture resolves to `toggle`.
   *
   * Omit it and `toggle` falls back to `homeassistant.toggle` on `entityId`, per
   * the contract's rule for card families with no toggle of their own — so a
   * card that has one must pass it unconditionally and guard inside, rather than
   * withholding it for a transient state.
   *
   * Returning `'more-info'` resolves the gesture to the detail dialog instead —
   * see `UseCardActionsOptions.onToggle`, which this is forwarded to.
   */
  onClick?: () => void | 'more-info' | Promise<unknown>
  /**
   * The entity the card is for: the implicit target of a `call-service` action
   * and of the generic `toggle` fallback. Defaults to what the grid published
   * for the item being rendered (`CardItemProvider`).
   */
  entityId?: string
  /**
   * The card's stored options (`item.config`) — the three action keys, and the
   * display keys (`name`, `icon`, `hideName`, `hideState`, `color`,
   * `alignHorizontal`, `alignVertical`) the shell applies to the compound slots
   * and to the tile. Defaults to the grid's, as above.
   */
  config?: Record<string, unknown>
  /**
   * What the stored literal `default` resolves to for this card. Read-only
   * families declare `more-info`; everything else leaves it at `toggle`
   * (docs/specs/entity-cards/options/common.md — "Universal options").
   */
  defaultAction?: ResolvedCardAction
  /**
   * What `more-info` opens, for the rare card that owns a detail surface of its
   * own. Left unset — as every card leaves it — the shell opens the entity
   * detail dialog itself, which is what makes the `more-info` hold default work
   * on every card with an entity rather than on the ones that remembered to
   * wire it. A card with no entity (a text tile, a separator) has no details,
   * and `more-info` stays inert there.
   */
  onMoreInfo?: () => void
  /**
   * The card family's own confirmation rule, consulted after an action
   * resolves. The cover's `confirmOpen` is what it is for — see
   * `UseCardActionsOptions.confirmRoute`. A card that declares one still gates
   * its *embedded* controls itself: the shell gates what the shell dispatches.
   */
  confirmRoute?: (action: ResolvedCardAction) => CardConfirmPrompt | null
  onConfigure?: () => void
  hasConfiguration?: boolean
  title?: string
  className?: string
  style?: React.CSSProperties
  isFullscreen?: boolean
  onFullscreenChange?: (fullscreen: boolean) => void
  fullscreenContent?: React.ReactNode
  transparent?: boolean
  backdrop?: boolean | string
  customPadding?: string
}

/**
 * `backgroundColor` and `background-color` are the same declaration; so are
 * `paddingInlineStart` and `padding-inline-start`.
 */
const normalizeProperty = (property: string) => property.replace(/[^a-z]/gi, '').toLowerCase()

/*
 * `border`'s per-side and logical family, expanded rather than spelled out: it
 * is 44 declarations, and a hand-written list is one typo away from leaving
 * open the very hole the fence exists to close. Every edge below accepts the
 * shorthand plus its `-color` / `-style` / `-width` form, and each of them
 * alone is enough to repaint the tile's edge over `--liebe-card-border`.
 */
const BORDER_EDGES = [
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-block',
  'border-block-start',
  'border-block-end',
  'border-inline',
  'border-inline-start',
  'border-inline-end',
]
const BORDER_FACETS = ['', '-color', '-style', '-width']

/*
 * The properties `GridCard.css` resolves from the token contract. A
 * caller-supplied inline value for any of them would outrank every cascade
 * layer — including `liebe-theme` and `liebe-user` — and make exactly the
 * surface a theme most wants to restyle permanently unreachable
 * (docs/specs/theming — "Application mechanism"). Closing the shell's own
 * inline declarations while leaving the `style` prop wide open would have left
 * the same hole one component further out, so the prop is filtered instead of
 * trusted; change 0012's precedence contract depends on it staying shut.
 *
 * The line the fence draws is *any inline declaration that can override one the
 * sheet resolves from a token* — which is why it lists whole families, not the
 * single spelling a card happened to reach for. A shorthand overrides its
 * longhands (`border` covers `border-top-color`), and a longhand overrides its
 * share of a shorthand (`border-top` alone is enough to outrank the themed
 * `border`), so both directions have to be inside the fence or neither is.
 *
 * Data-driven values are still the caller's to set, and several cards depend on
 * that: the weather variants' `backgroundImage` (the condition artwork), the
 * camera's `contain`, a light's actual bulb RGB. That is why the background
 * family is deliberately only half-fenced — `background` and `background-color`
 * are the themed surface, while `background-image` / `-size` / `-position` /
 * `-repeat` are the paint layers a card carries its data in. Custom properties
 * pass too — writing `--liebe-card-bg` is using the theming channel rather than
 * going around it, which is how the `backdrop` prop works.
 *
 * `padding` and `outline` are fenced along with the rest, and neither costs a
 * card anything. `--liebe-card-padding` owns the tile's inset, and the one card
 * that needs a different one — the camera, whose matting is a per-card setting —
 * asks for it through the `customPadding` prop, a channel the shell controls
 * rather than an inline value that would outrank the sheet. `outline` is the
 * whole vocabulary of the state rings (`data-selected` / `data-error` /
 * `data-unavailable`), so a caller-supplied one would not just recolour a
 * surface, it would overwrite a state signal.
 *
 * `border-image` is fenced, unlike its background counterpart: a non-`none`
 * `border-image-source` suppresses the painted `border-color` and
 * `border-style` the token contract resolves, so it is a way to repaint the
 * fenced border rather than a way to carry a card's data — and no card carries
 * data through it. `font` and `all` are in for the same structural reason as
 * `border-top`: `font` resets `font-family`, and `all` resets every property
 * there is, so either one left open would reopen the whole fence in one
 * declaration.
 */
const THEMABLE_PROPERTIES: ReadonlySet<string> = new Set(
  [
    // Resets everything, this fence included.
    'all',
    'backdrop-filter',
    // The one vendor alias still honoured by a shipping engine (Safari before
    // 18), and therefore still a second spelling of the themed blur. The dead
    // `-webkit-`/`-moz-` aliases of the others are not listed.
    '-webkit-backdrop-filter',
    'background',
    'background-color',
    ...BORDER_EDGES.flatMap((edge) => BORDER_FACETS.map((facet) => `${edge}${facet}`)),
    'border-image',
    'border-image-outset',
    'border-image-repeat',
    'border-image-slice',
    'border-image-source',
    'border-image-width',
    'border-radius',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
    'border-start-start-radius',
    'border-start-end-radius',
    'border-end-start-radius',
    'border-end-end-radius',
    'box-shadow',
    'color',
    'font',
    'font-family',
    'letter-spacing',
    'outline',
    'outline-color',
    'outline-offset',
    'outline-style',
    'outline-width',
    'padding',
    'padding-block',
    'padding-block-end',
    'padding-block-start',
    'padding-bottom',
    'padding-inline',
    'padding-inline-end',
    'padding-inline-start',
    'padding-left',
    'padding-right',
    'padding-top',
  ].map(normalizeProperty)
)

/**
 * The caller's `style`, minus anything the token contract owns. Returns a new
 * object every call, so nothing here mutates a caller's literal.
 */
function withoutThemableProperties(style?: React.CSSProperties): React.CSSProperties {
  if (!style) return {}

  return Object.fromEntries(
    Object.entries(style).filter(
      ([property]) => !THEMABLE_PROPERTIES.has(normalizeProperty(property))
    )
  ) as React.CSSProperties
}

/**
 * What counts as an embedded control for the purposes of press-and-hold.
 *
 * Cards are full of them — mode pills, steppers, switches, text fields, select
 * triggers, sliders — and a press that lands on one belongs to that control, not
 * to the tile. Controls already consume their own *clicks*, which was enough
 * when a click was all the tile listened for; press-and-hold starts half a
 * second earlier, so holding a stepper would fire the card's hold action before
 * the button it was pressed on ever ran.
 *
 * Written as one rule about the target rather than as a `stopPropagation` added
 * to every control: the controls are a moving set drawn from three libraries
 * (Radix Themes, Radix primitives, plain elements), and the enumeration that
 * would have to be kept complete is exactly the kind that ships a hole. This
 * asks the DOM what the press landed on instead.
 */
const EMBEDDED_CONTROL_SELECTOR =
  'a[href], button, input, textarea, select, label, [contenteditable="true"], [role="button"], [role="checkbox"], [role="combobox"], [role="listbox"], [role="menuitem"], [role="option"], [role="radio"], [role="slider"], [role="spinbutton"], [role="switch"], [role="tab"], [role="textbox"]'

function isEmbeddedControl(e: React.SyntheticEvent): boolean {
  // A pointer or mouse event's target is always an element — hit testing never
  // resolves to a text node — so this is a cast rather than a check.
  const control = (e.target as Element).closest(EMBEDDED_CONTROL_SELECTOR)
  // Scoped to the card: `closest` walks past it otherwise, and an interactive
  // ancestor of the whole grid would suppress every card's gestures.
  return Boolean(
    control && control !== e.currentTarget && (e.currentTarget as Element).contains(control)
  )
}

interface GridCardContextValue {
  tier: CardTier
  isLoading?: boolean
  domain: string
  color: DomainColorName
  isOn: boolean
  /** The stored display options, already resolved — see `readCardDisplay`. */
  display: CardDisplayOptions
  /**
   * What an icon-only tile says to a screen reader, or nothing when the option
   * is off. Resolved by the shell from the entity and read by `CardBody`, which
   * is the component that knows suppression actually happened.
   */
  iconOnlyLabel?: string
  /**
   * The data-driven colour that survived the precedence below, if any. Parts
   * read it from here rather than from the card, so the icon the shell renders
   * and a control the card renders cannot disagree about whether the tint
   * applies — see `resolveCardHue`.
   */
  hue?: string
  /**
   * The pixel width available to the card's content — the shell's own content
   * box, padding already taken off — or `undefined` where it has not been
   * observed.
   *
   * See `useCardContentWidth` for what consumes it and why the two states are
   * not interchangeable.
   */
  contentWidth?: number
}

/**
 * Which colour wins: the entity's own, the user's, or the card's.
 *
 * Three rules meet on one property, and each is owned by a different document,
 * so this composes them in the one place that can see all three rather than
 * letting whichever is implemented last decide.
 *
 * 1. **A danger state suppresses the tint outright.** The floor in
 *    `readCardDisplay` reverts the signalling options to "what the card itself
 *    renders", and a bulb-derived hue is precisely not that — it is a
 *    data-driven override sitting on top of the card's own treatment, so the
 *    floor already excludes it. It matters more here than for a configured
 *    colour, not less: an auditor can read `color: ok` in a config and see a
 *    danger state dressed up as calm, but a hue arriving from an entity at
 *    render time appears nowhere in the configuration at all.
 * 2. **An explicit `color` wins over the bulb.** "An explicit universal `color`
 *    MUST win over everything, including the bulb-derived color — a named value
 *    pins the card's active treatment predictably"
 *    (docs/specs/entity-cards/options/light.md).
 * 3. **`auto` lets the bulb through**, which is the only case the option
 *    governs.
 */
export function resolveCardHue(
  hue: string | undefined,
  display: CardDisplayOptions,
  danger: boolean
): string | undefined {
  if (danger) return undefined
  return display.color === 'auto' ? hue : undefined
}

/**
 * One alignment axis as the tile stamps it, or nothing at all.
 *
 * `auto` is the absence of an attribute rather than an `auto` value, which is
 * what makes the default provably free: every rule the alignment pair adds is
 * scoped to `[data-align-h]` / `[data-align-v]`, so a card with neither key —
 * which is every card placed before this option existed — matches none of them
 * and cannot render differently than it did (docs/changes/0032). It is the same
 * presence-only contract `data-active` and `data-icon-only` carry.
 */
function alignAttribute(value: CardAlignOption): CardAlignOption | undefined {
  return value === 'auto' ? undefined : value
}

/**
 * The data-driven colour that survived `resolveCardHue`, for a control the card
 * renders into one of the shell's slots.
 *
 * The shell's own parts read this off context directly. A card's embedded
 * control cannot — it is created in the card's render body — so it needs this
 * hook rather than the value the card passed in. The distinction is the whole
 * point: what the card passed is a *proposal*, and the precedence above may have
 * rejected it. A slider tinted from the raw proposal while the icon beside it
 * takes the survivor is one card disagreeing with itself about whether the bulb
 * colour applies, which is exactly what a pinned `color` or a danger state would
 * produce.
 *
 * Outside a shell — a story, the config preview — there is no provider and this
 * is `undefined`, which is the same "no data-driven colour" the default context
 * carries.
 */
export function useGridCardHue(): string | undefined {
  return React.useContext(GridCardContext).hue
}

/**
 * The pixel width the shell has left for content, for a card contract whose
 * capacity is width-derived rather than span-derived.
 *
 * The tier and the span are lossy about pixels on purpose: one effective span
 * is not one width, because the breakpoint mapping and a user-configurable
 * column count make a two-cell tile arbitrarily narrow. Where a contract has to
 * decide how many fixed-minimum-width parts fit — the weather forecast's
 * columns are the shipped case (docs/specs/entity-cards/options/weather.md —
 * "Forecast presentation") — the answer needs the width itself.
 *
 * **The shell measures; the card never does.** That prohibition is unchanged
 * (docs/changes/0011-layout-tiers.md): what changed is that the shell now
 * publishes one observation of the box it owns, so cards consume a signal
 * exactly as they consume tier and span. It is an observation rather than
 * arithmetic on the grid's laid-out width because the content width moves
 * without the grid moving — a theme setting a different `--liebe-card-padding`,
 * LCARS's asymmetric frame — and because a card renders in hosts with no grid
 * renderer at all (the configuration preview, the sidebar widget, the
 * workshop). The shell renders in all of them, so the signal does too.
 *
 * **`undefined` means "not observed", and is NOT the same as `0`.** A consumer
 * MUST treat the two differently: `0` is a measured content box with no room in
 * it, and a fixed-minimum-width part must be omitted; `undefined` is a tree
 * that has not been laid out (jsdom, an environment with no `ResizeObserver`,
 * the first render before the observer's initial callback) and carries no
 * information about width at all, so a consumer falls back to whatever its
 * width-blind contract says rather than omitting content it was never told did
 * not fit. Collapsing them would blank every forecast in the unit suite and,
 * worse, would report "does not fit" about a measurement that never happened.
 */
export function useCardContentWidth(): number | undefined {
  return React.useContext(GridCardContext).contentWidth
}

/**
 * The resolved display options, for a part of the composition seam that is not
 * one of the shell's own compound slots.
 *
 * `CardBody` is the only consumer and the reason this exists: the body is where
 * `iconOnly` collapses a card to its lead, and the body is rendered by the card
 * rather than by the shell, so it cannot be handed the options as props without
 * every card passing them. Outside a shell — a story, the config preview — this
 * is the same "leave the card alone" default an unconfigured item resolves to.
 *
 * Not for cards. A card that needs an option reads it from its own
 * `readCardDisplay(config)` (several already do), which is the same object: the
 * shell resolves the stored config it was given, so the two readings agree by
 * construction as long as the danger flag matches.
 */
export function useGridCardDisplay(): CardDisplayOptions {
  return React.useContext(GridCardContext).display
}

/**
 * The accessible name an icon-only tile keeps, for the component that renders
 * it — see `CardBody`.
 *
 * The shell resolves it (only the shell knows the entity) and the body emits it
 * (only the body knows suppression happened). Splitting it that way is not
 * ceremony: emitting it from the shell instead means emitting it whenever the
 * OPTION is set, and a card that renders no `CardBody` — the climate `dial`
 * variant, or any card's bare unavailable tile — still has its name and state
 * visible on the tile, so the clipped copy would announce the same identity
 * twice. Emitted from the body, it appears exactly where the words it replaces
 * were removed, including the camera's, whose body sits under a wrapper the
 * shell's fence cannot see past.
 */
export function useGridCardIconOnlyLabel(): string | undefined {
  return React.useContext(GridCardContext).iconOnlyLabel
}

/**
 * What the tile renders under `iconOnly`, out of the children the card handed
 * it.
 *
 * The body seam reaches everything a card composes through `CardBody`, and
 * nothing it renders *beside* one — the weather variants' condition scrim, the
 * media player's artwork backdrop. Those are the "backdrops, overlays, badges"
 * the option's suppression rule names, and they are the shell's to fence
 * because no card should have to check a flag to know it is not being shown
 * (docs/changes/0033-icon-only-cards.md — "Suppression mechanism").
 *
 * Keeping the bodies rather than dropping the non-bodies, and only when a body
 * is actually among them: a card that renders no `CardBody` at this level is
 * either one whose own icon-only form is still owed (the climate `dial`
 * variant) or a **replacement state surface** — the bare centred `Flex` a
 * dozen cards render in place of themselves while unavailable — and the
 * contract is explicit that `iconOnly` does not reduce those ("Card states
 * outrank suppression"). Blanking a tile is the one outcome worse than
 * suppressing too little, so the fence declines to act rather than guessing.
 */
function fenceToCardBody(children: React.ReactNode): React.ReactNode {
  const bodies = React.Children.toArray(children).filter(isCardBodyElement)
  return bodies.length > 0 ? bodies : children
}

/**
 * The background paint the caller asked for, dropped for an icon-only tile.
 *
 * The other half of the same fence, for the layer that is not an element at
 * all: the weather variants carry their condition artwork as an inline
 * `background-image` on the tile itself, which `THEMABLE_PROPERTIES`
 * deliberately lets through as card data. Under `iconOnly` it is exactly the
 * "artwork chrome" the option suppresses, and hiding the scrim element while
 * leaving the artwork under it would be worse than doing neither.
 *
 * The themed half of the family (`background`, `background-color`) is already
 * fenced for every card, so this only ever removes the paint layers.
 */
const BACKGROUND_PAINT_PROPERTIES: ReadonlySet<string> = new Set(
  ['background-image', 'background-size', 'background-position', 'background-repeat'].map(
    normalizeProperty
  )
)

function withoutBackgroundPaint(style: React.CSSProperties): React.CSSProperties {
  return Object.fromEntries(
    Object.entries(style).filter(
      ([property]) => !BACKGROUND_PAINT_PROPERTIES.has(normalizeProperty(property))
    )
  ) as React.CSSProperties
}

// Context for compound components
const GridCardContext = React.createContext<GridCardContextValue>({
  tier: 'row',
  isLoading: false,
  domain: 'unknown',
  color: 'default',
  isOn: false,
  // An anatomy part rendered outside a shell — the config preview, a story —
  // gets the same "leave the card alone" defaults an unconfigured item has.
  display: readCardDisplay(undefined),
})

/**
 * The card shell — the `liebe-card` tile every entity card renders inside.
 *
 * Its whole visual surface comes from the token contract via `GridCard.css`:
 * flat in dark, a small shadow in light, `--liebe-card-radius` corners, and
 * state treatments (selected / error / unavailable / loading) stamped as
 * `data-*` attributes the layered sheet styles. Nothing visual is set inline,
 * because an inline declaration outranks every cascade layer and would be
 * unreachable by a theme (docs/specs/theming — "Application mechanism"). What
 * remains inline is not design: the pointer affordance, the camera's matting
 * padding (through the `customPadding` prop the shell controls), and
 * caller-supplied data like a weather variant's condition artwork. The caller's
 * `style` prop is filtered on the way through so it cannot reintroduce a
 * themable declaration — see `THEMABLE_PROPERTIES`.
 */
export const GridCard = React.memo(
  React.forwardRef<HTMLDivElement, GridCardProps>(
    (
      {
        children,
        domain,
        color = 'default',
        hue,
        danger = false,
        level,
        tier = 'row',
        isLoading = false,
        isError = false,
        transparent = false,
        isSelected = false,
        isOn = false,
        isUnavailable = false,
        onSelect,
        onDelete,
        onClick,
        entityId,
        config,
        defaultAction,
        onMoreInfo,
        confirmRoute,
        onConfigure,
        hasConfiguration = false,
        title,
        className,
        style,
        isFullscreen = false,
        onFullscreenChange,
        fullscreenContent,
        backdrop,
        customPadding,
      },
      ref
    ) => {
      const { mode } = useDashboardStore()
      const isEditMode = mode === 'edit'
      // What the grid published about the item this card is rendering. Explicit
      // props still win, so a card (or a story) can override either.
      const item = useCardItem()

      /*
       * The placed item's stored options, and the display half of them resolved.
       *
       * Resolved here rather than in each card because that is what makes the
       * five display options universal: a card keeps rendering its own name,
       * icon and state into the compound slots, and the shell decides what those
       * slots actually show (docs/specs/entity-cards/options/common.md —
       * "Universal options"). A card cannot forget to honour an option it never
       * sees — and, in a danger state, cannot be configured out of warning.
       */
      const storedConfig = config ?? item.config
      const display = React.useMemo(
        () => readCardDisplay(storedConfig, { danger }),
        [storedConfig, danger]
      )

      /*
       * `auto` keeps the card's state-derived colour; anything else pins a
       * triplet. Either way the value travels as a `data-color` attribute that
       * `anatomy.css` maps onto `--liebe-c-*` — never as a Radix colour prop —
       * so a theme that remaps the triplet recolours a pinned card too.
       */
      const resolvedColor = resolveCardColor(display.color, color)

      /*
       * Hiding both lines is a layout, not an accident: the spec requires the
       * icon-only tile to stay valid, with the icon centred
       * (docs/specs/entity-cards/options/common.md — `hideName`/`hideState`
       * "MUST compose with the layout tiers"). The attribute is what
       * `GridCard.css` centres on; it is stamped whenever both lines are hidden
       * rather than only in `glance`, because a tile with nothing but an icon
       * wants the same treatment at every size.
       */
      const isIconOnly = display.hideName && display.hideState

      /*
       * The `iconOnly` option, which is a different thing from the attribute
       * above and stamps a marker of its own.
       *
       * `data-icon-only` is derived — it says "both meta lines are hidden, so
       * centre what is left" — and it keeps meaning exactly that, for exactly
       * the configurations that produced it before this option existed.
       * `data-icon-tile` says "the user asked for the icon-only presentation",
       * which is a stronger claim: it is what the suppression, and the tile
       * tint that follows it, are allowed to key on. Hanging either on the
       * derived attribute would reach every legacy `hideName` + `hideState`
       * card, which the contract's unchanged-tiles scenario forbids
       * (docs/specs/entity-cards/options/common.md — "Scenario: Existing
       * hideName+hideState tiles are unaffected"; docs/specs/theming —
       * "Stable selector contract", where `data-icon-tile` is the public name
       * and `data-icon-only` is deliberately not contract).
       *
       * Reads off the resolved options, so the danger floor has already had
       * it: a jammed lock renders its whole warning whatever the config says.
       */
      const iconOnly = display.iconOnly

      // Handle ESC key press to exit fullscreen
      useEffect(() => {
        const handleKeyPress = (event: KeyboardEvent) => {
          if (event.key === 'Escape' && isFullscreen) {
            onFullscreenChange?.(false)
          }
        }

        if (isFullscreen) {
          document.addEventListener('keydown', handleKeyPress)
          return () => document.removeEventListener('keydown', handleKeyPress)
        }
      }, [isFullscreen, onFullscreenChange])

      // The `isStale` prop is still accepted (callers pass it) but intentionally
      // not rendered — stale entities are tracked without a visual indicator.
      // See docs/specs/entity-state/index.md for the stale-display decision.

      const isTransparent = transparent && !isEditMode

      /*
       * The settings button. A card that runs its own configuration modal passes
       * these itself; every other entity card gets the grid's, so the universal
       * option surface is reachable from every card rather than from the four
       * that happened to grow a modal of their own
       * (docs/specs/entity-cards/options/common.md — options are edited from the
       * card's own configuration UI).
       */
      const configure = onConfigure ?? item.onConfigure
      const canConfigure = (hasConfiguration || Boolean(item.onConfigure)) && Boolean(configure)

      /*
       * The detail dialog `more-info` opens. Owned by the shell, so every card
       * with an entity reaches it through the default `holdAction` without
       * wiring anything —
       * and mounted only while it is open, so a screen of cards carries no
       * dialogs behind it. A card that passes its own `onMoreInfo` keeps it.
       */
      const detailEntityId = entityId ?? item.entityId

      /*
       * What an icon-only tile says to a screen reader.
       *
       * `iconOnly` takes every word off the tile, and the contract is explicit
       * that this must not reach assistive technology with it: "The tile MUST
       * keep an accessible name carrying the entity's resolved name and, where
       * the card has one, its state ('Reading lamp, on') … Hiding the name from
       * a screen reader too would make an actionable tile anonymous"
       * (docs/specs/entity-cards/options/common.md — "Icon-only presentation").
       *
       * Built from the ENTITY rather than from what the card rendered, which is
       * the whole reason it lives in the shell. A label assembled out of the
       * suppressed slots would be blank where the user also hid both lines,
       * incomplete where a card carries its reading somewhere other than a meta
       * line (a `tall` sensor puts it in the control slot), and about the wrong
       * thing where a card's title line is not the entity's name at all (a
       * media player's is the track). The user's `name` override still wins,
       * because that is the name they gave this tile.
       *
       * A failed service call replaces the state with its message, because that
       * is the state the tile is actually in and the one the user has to act
       * on. Cards report a failure inline — a light's state line reads `ERROR`
       * — so suppression takes exactly the text that identifies it, and the
       * contract says what has to happen then: "where suppression removes the
       * text that identifies the state … the message becomes the tile's
       * accessible name" (docs/specs/entity-cards/options/common.md — "Card
       * states outrank suppression"). The tile's error outline and pulse are
       * the shell's own and suppression never touched them.
       *
       * The selector returns a string, so it re-runs on every store change and
       * re-renders on none of them unless the answer moved — and it answers
       * `undefined` whenever the option is off, which is every card on a
       * dashboard that does not use it.
       */
      const iconOnlyLabel = useStore(entityStore, (state) => {
        if (!iconOnly) return undefined

        const entity = detailEntityId ? state.entities[detailEntityId] : undefined
        const resolved = display.name || entity?.attributes?.friendly_name || detailEntityId
        if (!resolved) return undefined

        const reported = (isError && title) || entity?.state
        return reported ? `${resolved}, ${reported}` : resolved
      })
      // The entity the dialog is open for, rather than a boolean: it is the
      // same state, and holding the id means the render below needs no second
      // check that a card with no entity somehow opened one.
      const [detailFor, setDetailFor] = React.useState<string | null>(null)
      const openDetail = React.useMemo(
        // A card with no entity — a text tile, a separator — has no details to
        // open, and handing the controller no handler is what tells it that
        // `more-info` is not actionable there.
        () => (detailEntityId ? () => setDetailFor(detailEntityId) : undefined),
        [detailEntityId]
      )

      /*
       * The confirmation a gated action is waiting on.
       *
       * Held by the shell for the same reason the gate itself is: the shell is
       * what dispatches, so a card cannot forget to present the dialog for an
       * option it declared (docs/specs/entity-cards/options/switch.md —
       * "`confirm`"). Nothing has been sent while this is set; the request
       * carries the closure that would send it.
       *
       * Dropped on the same two keys as the detail dialog, and for the same
       * reasons — a pending confirmation belongs to one card operating one
       * entity in view mode.
       */
      const [confirmRequest, setConfirmRequest] = React.useState<CardConfirmRequest | null>(null)

      /*
       * Two ways an open dialog stops belonging to this card:
       *  - the dashboard switches to edit mode, where actions are suppressed
       *    and the card is being dragged rather than operated
       *    (docs/changes/0014 — the dialog cannot open in edit mode);
       *  - the card instance is recycled onto a different entity, which must
       *    not leave the previous entity's details standing.
       * Both are the same reset, so both keys drop both dialogs. Entering *or*
       * leaving edit mode closes them, which costs nothing: neither could have
       * been open in edit mode anyway.
       *
       * Reset during render with previous-value guards rather than in an
       * effect, which is this repo's pattern for exactly this job (`CoverCard`,
       * `LockCard`, `InputNumberCard`) and what `react-hooks/set-state-in-effect`
       * requires. The shell had it the other way round until
       * docs/changes/0040-test-harness-reliability.md: it wrote
       * `React.useEffect(...)`, which the rule could not match, so the shell and
       * the cards solved one problem two ways and the difference was not a
       * decision anyone made. PR 3 of that change made the call visible; this is
       * PR 4, which removes the suppression it left behind.
       *
       * It is more than a re-spelling on **one** of the two keys, and the
       * difference between them is worth stating precisely, because the obvious
       * reading gets it backwards.
       *
       * On edit mode it is a re-spelling. `CoverCard`'s resurrection bug does
       * not reach here: the shell already reset, and the `!isEditMode` render
       * guard below covers the one commit the effect ran late by, so nothing
       * stale was ever on screen. What `CoverCard` lacked was the reset itself,
       * not a render-phase one.
       *
       * On the entity it is a fix. Nothing guards that key, so a card instance
       * recycled onto another entity while a dialog stood committed a frame of
       * the **previous** entity's dialog over the new one before the passive
       * effect cleared it — details for a device the user is no longer looking
       * at, or a confirmation asking about a gesture that was made against a
       * different entity, where the answer that looks safe is to accept.
       * Resetting during render drops both a commit earlier, so that frame
       * cannot exist. `GridCard.dialogReset.test.tsx` observes it from a layout
       * effect, which is the only vantage that can tell the two spellings apart
       * — by the time a passive effect or an `act()` boundary has flushed, both
       * implementations agree.
       *
       * One guard for the two of them because it is one rule, matching the
       * cards; the change document's requirement that each site be audited
       * individually is answered by the audit, not by keeping them apart.
       */
      const [prevIsEditMode, setPrevIsEditMode] = React.useState(isEditMode)
      const [prevDetailEntityId, setPrevDetailEntityId] = React.useState(detailEntityId)
      if (isEditMode !== prevIsEditMode || detailEntityId !== prevDetailEntityId) {
        setPrevIsEditMode(isEditMode)
        setPrevDetailEntityId(detailEntityId)
        setDetailFor(null)
        setConfirmRequest(null)
      }

      /*
       * The gesture controller. `disabled` in edit mode is the whole of
       * edit-mode action suppression: no gesture resolves, no timer is armed,
       * and the click below goes to selection instead
       * (docs/specs/entity-cards/options/common.md — "Action type").
       */
      const gestures = useCardActions({
        config: storedConfig,
        defaultAction,
        entityId: detailEntityId,
        onToggle: onClick,
        onMoreInfo: onMoreInfo ?? openDetail,
        unavailable: isUnavailable,
        disabled: isEditMode,
        requestConfirmation: setConfirmRequest,
        confirmRoute,
      })

      /**
       * True for the card's own content, false for a portalled descendant.
       *
       * Not the tautology it reads as. React synthetic events bubble through the
       * REACT tree, not the DOM tree, so an event inside a portalled descendant
       * reaches these handlers even though the element it came from lives
       * outside the card in the DOM. `contains()` is exactly what tells the two
       * apart: true for a real descendant — the card's own content, which must
       * still drive the card's gestures — and false for a portalled one, which
       * must not.
       *
       * The live case is `InputSelectCard`: its Radix `Select.Content` is
       * written inside the card in JSX but portalled to `document.body`, so
       * without this check picking an option from the open dropdown would ALSO
       * fire the card's action. Radix dialogs, popovers and tooltips portal the
       * same way — including the detail dialog `more-info` opens, which is why
       * the press handler is guarded too and not just the click: a press held
       * inside a portalled dialog must not arm the card's hold timer behind it.
       * (A press on a portalled *control* is stopped by `isEmbeddedControl`
       * anyway; this catches the rest of a portalled surface.)
       *
       * So do not "simplify" this away. It is pinned by "ignores a click from a
       * portalled descendant, but not one from a real child" in
       * `__tests__/GridCard.test.tsx`.
       */
      const isRealDescendant = (e: React.SyntheticEvent) =>
        e.target === e.currentTarget || (e.currentTarget as Node).contains(e.target as Node)

      const handlePointerDown = (e: React.PointerEvent) => {
        // Only a primary activation starts a gesture: a right-button press or a
        // second finger is not a tap the user is waiting to complete, and it may
        // never produce the click that would consume a fired hold.
        if (e.button !== 0 || !e.isPrimary) return

        if (isRealDescendant(e) && !isEmbeddedControl(e)) gestures.press()
      }

      const handleClick = (e: React.MouseEvent) => {
        if (isEditMode && onSelect) {
          onSelect()
        } else if (!isEditMode && isRealDescendant(e) && !isEmbeddedControl(e)) {
          gestures.tap()
        }
      }

      const effectiveHue = resolveCardHue(hue, display, danger)

      /*
       * The content-width signal (docs/specs/design-system — "Size-adaptive
       * layouts"; `useCardContentWidth` for the consumer's half).
       *
       * The box observed is this component's own, and the instrument is shared
       * across every mounted shell (`observeContentWidth`) — the spec asks for
       * "a single shared observation, not a per-card one", and a dashboard is a
       * wall of tiles. The content box rather than `offsetWidth` because the
       * signal is what is left FOR content: the tile's padding is a theme's to
       * change, and a card asking "do four 44px columns fit" must not be handed
       * the width of the frame around them.
       *
       * Both the observation and the caller's `ref` are driven from the one ref
       * callback rather than from an effect: React hands it the node on attach
       * and `null` on detach, which is exactly the pair of events the
       * observation needs, and assigning the caller's `ref` from an effect
       * would leave a consumer's ref null for the first commit.
       */
      const [contentWidth, setContentWidth] = React.useState<number | undefined>(undefined)
      const stopObserving = React.useRef<(() => void) | undefined>(undefined)

      const setShellRef = React.useCallback(
        (node: HTMLDivElement | null) => {
          stopObserving.current?.()
          stopObserving.current = node
            ? observeContentWidth(node, setContentWidth)
            : // Detached: the tile is gone, and so is any width it reported.
              // Left as the state it was, because the component is unmounting
              // with it — nothing reads this again.
              undefined

          if (typeof ref === 'function') ref(node)
          else if (ref) ref.current = node
        },
        [ref]
      )

      const contextValue = React.useMemo(
        () => ({
          tier,
          isLoading,
          domain,
          color: resolvedColor,
          isOn,
          display,
          hue: effectiveHue,
          iconOnlyLabel,
          contentWidth,
        }),
        [
          tier,
          isLoading,
          domain,
          resolvedColor,
          isOn,
          display,
          effectiveHue,
          iconOnlyLabel,
          contentWidth,
        ]
      )

      /*
       * What the icon-only tile's state tint resolves from, and the only two
       * things about it the sheet cannot work out for itself
       * (docs/specs/design-system — "Card anatomy", the icon-only tile
       * exception; `GridCard.css` for the rules that consume these).
       *
       *  - **The bulb's colour.** The tile is the tint surface here, so it
       *    needs the survivor of `resolveCardHue` exactly as an anatomy part
       *    does — and takes it through the part's own `hueStyle`, so the tile
       *    and the glyph on it cannot mix the same hue at two strengths.
       *    Without it a colour-following bulb would tint its tile with the
       *    `light` triplet's amber while its glyph rendered the bulb's actual
       *    colour, which is one card disagreeing with itself.
       *  - **The level**, as the 0–1 fraction the sheet modulates the tint's
       *    strength by. Written only when the card reported one: an absent
       *    property falls back to the undimmed tint, which is what a switch or
       *    a lock should carry, while writing a `0` for them would render
       *    every on switch at the bottom of a range it does not have.
       *
       * Both are custom properties, so they are the theming channel rather
       * than a way around it — a theme redeclaring `--liebe-icon-tile-tint`
       * still wins the paint. And both are written only under `iconOnly`,
       * which the danger floor has already reverted where it applies: a jammed
       * lock's tile is a danger presentation, not a tinted glyph.
       */
      const iconTileStyle = iconOnly
        ? {
            ...(effectiveHue ? hueStyle(effectiveHue) : {}),
            /*
             * Clamped rather than trusted, and a non-finite value is treated
             * as no level at all. A card computing a percentage off a live
             * attribute can hand over 105 — `calc()` would carry that into a
             * tint stronger than the undimmed one — or `NaN`, from an
             * arithmetic on a missing attribute, which clamping preserves.
             * `calc(40% + 60% * NaN)` is invalid, so `color-mix()` fails, and
             * a REGISTERED property whose value is invalid falls back to its
             * initial one: the active tile would lose its only state signal
             * outright, which is the failure the floor exists to prevent.
             */
            ...(level === undefined || !Number.isFinite(level)
              ? {}
              : { '--liebe-icon-tile-level': Math.min(1, Math.max(0, level)) }),
          }
        : {}

      /*
       * Everything left inline is data or affordance, never design:
       *  - `cursor` says what a press will do, and changes with the mode rather
       *    than with the theme.
       *  - `padding` only when a card asked for one through `customPadding`
       *    (the camera's matting, resolved from its matting setting and size).
       *    That prop is the shell's own controlled channel; the same property
       *    arriving through the caller's `style` is fenced off.
       *  - `--liebe-card-blur` is a token override, i.e. the theming channel
       *    itself rather than a way around it — a card that paints its own
       *    background image turns the blur off through it.
       *  - the caller's `style`, filtered: it still carries a card's own data,
       *    but no longer the themable surface. See `THEMABLE_PROPERTIES`.
       */
      const cardStyle = {
        cursor: isLoading
          ? 'wait'
          : isEditMode
            ? 'move'
            : gestures.hasTapAction
              ? 'pointer'
              : 'default',
        ...(customPadding && !isTransparent ? { padding: customPadding } : {}),
        ...(backdrop !== undefined && backdrop !== true
          ? { '--liebe-card-blur': backdrop === false ? 'none' : backdrop }
          : {}),
        ...(iconOnly
          ? withoutBackgroundPaint(withoutThemableProperties(style))
          : withoutThemableProperties(style)),
        // After the caller's style, deliberately: these are the shell's own
        // resolution of the tint, and a card must not be able to hand the tile
        // a different hue than the one `resolveCardHue` let through.
        ...iconTileStyle,
      } as React.CSSProperties

      return (
        <GridCardContext.Provider value={contextValue}>
          <div
            ref={setShellRef}
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            // Release on all three: a pointer that leaves the tile or is taken
            // over by a scroll gesture never produces the `pointerup` that would
            // otherwise leave the hold timer running to fire under a finger that
            // has moved on.
            onPointerUp={gestures.release}
            onPointerCancel={gestures.release}
            onPointerLeave={gestures.release}
            title={title}
            className={`liebe-card grid-card${className ? ` ${className}` : ''}`}
            data-domain={domain}
            data-color={resolvedColor}
            data-tier={tier}
            data-icon-only={isIconOnly ? 'true' : undefined}
            data-icon-tile={iconOnly ? 'true' : undefined}
            /*
             * The alignment pair, applied at the tile rather than inside any
             * card. The tile is the one box every card renders into whatever
             * it puts there — the climate `dial` variant renders no `CardBody`
             * at all — so this is the seam that reaches all of them without a
             * card opting in (docs/specs/entity-cards/options/common.md —
             * "Content alignment"). `GridCard.css` places the tile's content
             * box; `CardBody.css` refines that onto the body's own flex axes
             * where a card renders through one.
             */
            data-align-h={alignAttribute(display.alignHorizontal)}
            data-align-v={alignAttribute(display.alignVertical)}
            data-active={isOn ? 'true' : undefined}
            data-selected={isSelected && isEditMode ? 'true' : undefined}
            data-error={isError ? 'true' : undefined}
            data-unavailable={isUnavailable ? 'true' : undefined}
            data-loading={isLoading ? 'true' : undefined}
            data-transparent={isTransparent ? 'true' : undefined}
            style={cardStyle}
          >
            {/* Content — fenced to the card body while `iconOnly` holds, so a
                backdrop or an overlay a card renders beside its body does not
                survive the suppression its body just applied. */}
            {iconOnly ? fenceToCardBody(children) : children}

            {/*
             * Edit affordances, hidden in fullscreen. Rendered AFTER the
             * content on purpose: both are positioned elements at
             * `z-index: auto`, so the later one in the DOM paints on top —
             * which is how the buttons stay clickable over card content that
             * positions itself (the weather variants do). Doing it by DOM
             * order rather than by a z-index keeps the project's
             * no-arbitrary-z-index rule intact.
             */}
            {isEditMode && (canConfigure || onDelete) && !isFullscreen && (
              /*
               * The scrimmed-ground rule's Radix half
               * (docs/specs/design-system — "Card anatomy"): a Radix control
               * colours itself from a Radix scale keyed off the ancestor
               * `Theme`'s appearance and reads none of the `--liebe-*`
               * foreground tokens the artwork scopes pin white — so over the
               * now-reliably-dark scrim a light-appearance control renders
               * dark-on-dark (the delete glyph measured 3.19 → 1.18:1). The
               * nested dark `Theme` re-resolves the controls to their dark
               * scale while the artwork scope's tokens pass through untouched.
               * Rendered after the content like the scrimmed layers it can sit
               * over, for the same DOM-order reason; `hasBackground={false}`
               * so the scope paints no surface of its own, exactly as the
               * portal host does.
               */
              <Theme appearance="dark" hasBackground={false}>
                <div className="liebe-card-actions">
                  {/* Configuration Button */}
                  {canConfigure && (
                    <IconButton
                      size="1"
                      variant="ghost"
                      color="gray"
                      onClick={(e) => {
                        e.stopPropagation()
                        configure?.()
                      }}
                      aria-label="Configure card"
                    >
                      <Settings size={14} />
                    </IconButton>
                  )}

                  {/* Delete Button */}
                  {onDelete && (
                    <IconButton
                      size="1"
                      variant="ghost"
                      color="red"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete()
                      }}
                      aria-label="Delete entity"
                    >
                      <X size={14} />
                    </IconButton>
                  )}
                </div>
              </Theme>
            )}
          </div>

          {/* Portal-based fullscreen overlay that escapes shadow DOM */}
          {isFullscreen &&
            fullscreenContent &&
            createPortal(
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100vw',
                  height: '100vh',
                  backgroundColor: 'black',
                  zIndex: 9999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                onClick={() => onFullscreenChange?.(false)}
              >
                {fullscreenContent}

                {/* Close indicator */}
                <div
                  style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    background: 'rgba(0, 0, 0, 0.7)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backdropFilter: 'blur(4px)',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '500',
                    pointerEvents: 'none',
                  }}
                >
                  Click or press ESC to exit
                </div>
              </div>,
              document.body
            )}

          {/*
           * The detail dialog. Portalled by the dialog primitive, which is
           * exactly the case the shell's `isRealDescendant` guard exists for:
           * it renders inside this card's React tree, so a press within it
           * would otherwise arm the hold timer of the card behind it.
           */}
          {/*
           * `!isEditMode` as well as the state. The reset above now runs during
           * render, so nothing stale reaches a commit and this guard cannot be
           * the thing that hides it — which is the point of keeping it. It is a
           * belt to the reset's braces, and cheap: a dialog that can only be
           * opened in view mode should also only be *rendered* in view mode, so
           * a future path that sets `detailFor` without going through the reset
           * still cannot leave one standing over a draggable card.
           */}
          {!isEditMode && detailFor && (
            <EntityDetailDialog
              entityId={detailFor}
              open
              // Only a close is the shell's to act on. The dialog reports every
              // open-state change through this one callback, `true` included —
              // a controlled dialog can report the state it is already in while
              // reconciling — so a handler that discarded the argument would
              // tear down the dialog the hold just opened.
              onOpenChange={(open) => {
                if (!open) setDetailFor(null)
              }}
            />
          )}
          {/*
           * Same `!isEditMode` guard as the detail dialog: a confirmation that
           * outlived the switch to edit mode would be asking about an action
           * that can no longer be dispatched.
           */}
          {!isEditMode && confirmRequest && (
            <ConfirmToggleDialog
              request={confirmRequest}
              isOn={isOn}
              name={display.name}
              onResolve={() => setConfirmRequest(null)}
            />
          )}
        </GridCardContext.Provider>
      )
    }
  )
)

GridCard.displayName = 'GridCard'

// Compound Components
//
// Each one is now a thin wrapper over the anatomy part it corresponds to, which
// is how every card migrated onto the anatomy at once: a card keeps calling
// `GridCard.Icon` / `.Title` / `.Status` and gets `liebe-icon` / `liebe-name` /
// `liebe-state` with the contract attributes stamped from the shell's context.
// The `grid-card-*` classes ride along as internal aliases so existing selectors
// keep resolving; the `liebe-*` class is the contract one.

// Icon component with loading spinner support
interface GridCardIconProps {
  children: React.ReactNode
  className?: string
}

export const GridCardIcon = React.memo(({ children, className }: GridCardIconProps) => {
  const { isLoading, domain, color, isOn, display, hue } = React.useContext(GridCardContext)

  /*
   * The `icon` override. An unset override, and one naming an icon this build
   * does not have, both leave the card's own glyph in place: a configuration
   * written by a build with a larger icon set is resolved for display, not
   * repaired (docs/specs/dashboard-config — "Forward Compatibility").
   */
  const overrideIcon = display.icon ? getIcon(display.icon) : undefined

  return (
    <IconCircle
      domain={domain}
      color={color}
      hue={hue}
      active={isOn}
      className={`grid-card-icon${className ? ` ${className}` : ''}`}
    >
      {/*
       * `createElement` rather than JSX, as the binary sensor's configurable
       * icons already do: the component comes out of the curated list, and JSX
       * on a local capitalized binding reads to the linter as a component
       * declared during render. Size matches the glyphs the cards pass; the
       * circle itself is `--liebe-icon-circle`.
       */}
      {isLoading ? (
        <Spinner size="2" />
      ) : overrideIcon ? (
        React.createElement(overrideIcon, { size: 20 })
      ) : (
        children
      )}
    </IconCircle>
  )
})

GridCardIcon.displayName = 'GridCardIcon'

// Title component
interface GridCardTitleProps {
  children: React.ReactNode
  className?: string
}

export const GridCardTitle = React.memo(({ children, className }: GridCardTitleProps) => {
  const { domain, color, display } = React.useContext(GridCardContext)

  // `hideName` removes the line rather than emptying it: an empty `liebe-name`
  // would still take its share of the stack's gap.
  if (display.hideName) return null

  return (
    <CardName
      domain={domain}
      color={color}
      className={`grid-card-title${className ? ` ${className}` : ''}`}
    >
      {/* A non-empty `name` replaces whatever the card passed — for every card,
          because the card's friendly name arrives here as children. */}
      {display.name || children}
    </CardName>
  )
})

GridCardTitle.displayName = 'GridCardTitle'

// Controls component (for buttons, sliders, etc.)
interface GridCardControlsProps {
  children: React.ReactNode
  className?: string
}

export const GridCardControls = React.memo(({ children, className }: GridCardControlsProps) => {
  return (
    <div className={`liebe-card-controls grid-card-controls${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
})

GridCardControls.displayName = 'GridCardControls'

// Status component
interface GridCardStatusProps {
  children: React.ReactNode
  /** Supporting value after the state ("· 80%"); stays muted while active. */
  detail?: React.ReactNode
  className?: string
}

export const GridCardStatus = React.memo(({ children, detail, className }: GridCardStatusProps) => {
  const { domain, color, isOn, display } = React.useContext(GridCardContext)

  if (display.hideState) return null

  return (
    <CardState
      domain={domain}
      color={color}
      active={isOn}
      detail={detail}
      className={`grid-card-status${className ? ` ${className}` : ''}`}
    >
      {children}
    </CardState>
  )
})

GridCardStatus.displayName = 'GridCardStatus'

// Create a typed compound component
export const GridCardWithComponents = Object.assign(GridCard, {
  Icon: GridCardIcon,
  Meta: CardMeta,
  Title: GridCardTitle,
  Controls: GridCardControls,
  Status: GridCardStatus,
})
