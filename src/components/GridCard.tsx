import * as React from 'react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { IconButton, Spinner } from '@radix-ui/themes'
import { X, Settings } from 'lucide-react'
import { useDashboardStore } from '~/store'
import {
  useCardActions,
  type CardConfirmPrompt,
  type CardConfirmRequest,
} from '~/hooks/useCardActions'
import { useCardItem } from './cardItemContext'
import { EntityDetailDialog } from './EntityDetailDialog'
import { ConfirmToggleDialog } from './ConfirmToggleDialog'
import { CardMeta, CardName, CardState, IconCircle } from './anatomy'
import {
  readCardDisplay,
  resolveCardColor,
  type CardAlignOption,
  type CardDisplayOptions,
} from '~/store/cardDisplay'
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
   * The data-driven colour that survived the precedence below, if any. Parts
   * read it from here rather than from the card, so the icon the shell renders
   * and a control the card renders cannot disagree about whether the tint
   * applies — see `resolveCardHue`.
   */
  hue?: string
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
       * Two ways an open dialog stops belonging to this card:
       *  - the dashboard switches to edit mode, where actions are suppressed
       *    and the card is being dragged rather than operated
       *    (docs/changes/0014 — the dialog cannot open in edit mode);
       *  - the card instance is recycled onto a different entity, which must
       *    not leave the previous entity's details standing.
       * Both are the same reset, so both keys drop it. Entering *or* leaving
       * edit mode closes it, which costs nothing: it could not have been open
       * in edit mode anyway.
       */
      useEffect(() => {
        /*
         * Suppressed, not fixed. This is the exact call site
         * docs/changes/0040-test-harness-reliability.md names: it was written
         * `React.useEffect(...)`, which the rule could not see, so it has never
         * been reported before. PR 3 of that change made it visible; **PR 4 is
         * what fixes it**, by moving this reset to the render-phase pattern the
         * cover card already uses — deliberately separate, because restructuring
         * the shell's dialog state is a behavioural change that deserves its own
         * review and its own tests.
         *
         * REMOVE THIS SUPPRESSION IN PR 4. It exists only so the rule starts
         * guarding *new* code immediately rather than waiting for the cleanup;
         * leaving it in place after PR 4 lands would re-open the hole one line
         * narrower than before.
         */
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDetailFor(null)
      }, [isEditMode, detailEntityId])

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

      useEffect(() => {
        /*
         * Same reset, same keys and same disposition as `setDetailFor` above:
         * newly visible because the call was `React.useEffect(...)`, and left
         * for PR 4 of docs/changes/0040-test-harness-reliability.md to move to
         * the render-phase pattern. Listed in its own right rather than folded
         * into the one above, because the change document requires all five
         * member-call sites audited individually.
         *
         * REMOVE THIS SUPPRESSION IN PR 4.
         */
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setConfirmRequest(null)
      }, [isEditMode, detailEntityId])

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

      const contextValue = React.useMemo(
        () => ({ tier, isLoading, domain, color: resolvedColor, isOn, display, hue: effectiveHue }),
        [tier, isLoading, domain, resolvedColor, isOn, display, effectiveHue]
      )

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
        ...withoutThemableProperties(style),
      } as React.CSSProperties

      return (
        <GridCardContext.Provider value={contextValue}>
          <div
            ref={ref}
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
            {/* Content */}
            {children}

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
           * `!isEditMode` as well as the state, because the effect above clears
           * it only after the edit-mode render has committed — a frame with the
           * dialog still standing over a card that is now draggable.
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
