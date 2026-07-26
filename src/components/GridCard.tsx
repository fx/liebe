import * as React from 'react'
import { createPortal } from 'react-dom'
import { IconButton, Spinner } from '@radix-ui/themes'
import { X, Settings } from 'lucide-react'
import { useDashboardStore } from '~/store'
import { useCardActions } from '~/hooks/useCardActions'
import { useCardItem } from './cardItemContext'
import { EntityDetailDialog } from './EntityDetailDialog'
import { CardMeta, CardName, CardState, IconCircle } from './anatomy'
import type { ResolvedCardAction } from '~/store/cardActions'
import type { DomainColorName } from '~/theme/tokens'
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
   */
  color?: DomainColorName
  size?: 'small' | 'medium' | 'large'
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
   */
  onClick?: () => void
  /**
   * The entity the card is for: the implicit target of a `call-service` action
   * and of the generic `toggle` fallback. Defaults to what the grid published
   * for the item being rendered (`CardItemProvider`).
   */
  entityId?: string
  /**
   * The card's stored options (`item.config`), read for `tapAction`,
   * `holdAction` and `doubleTapAction`. Defaults to the grid's, as above.
   */
  actions?: Record<string, unknown>
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
  size: 'small' | 'medium' | 'large'
  isLoading?: boolean
  domain: string
  color: DomainColorName
  isOn: boolean
}

// Context for compound components
const GridCardContext = React.createContext<GridCardContextValue>({
  size: 'medium',
  isLoading: false,
  domain: 'unknown',
  color: 'default',
  isOn: false,
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
        size = 'medium',
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
        actions,
        defaultAction,
        onMoreInfo,
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

      // Handle ESC key press to exit fullscreen
      React.useEffect(() => {
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
      React.useEffect(() => {
        setDetailFor(null)
      }, [isEditMode, detailEntityId])

      /*
       * The gesture controller. `disabled` in edit mode is the whole of
       * edit-mode action suppression: no gesture resolves, no timer is armed,
       * and the click below goes to selection instead
       * (docs/specs/entity-cards/options/common.md — "Action type").
       */
      const gestures = useCardActions({
        config: actions ?? item.config,
        defaultAction,
        entityId: detailEntityId,
        onToggle: onClick,
        onMoreInfo: onMoreInfo ?? openDetail,
        unavailable: isUnavailable,
        disabled: isEditMode,
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

      const contextValue = React.useMemo(
        () => ({ size, isLoading, domain, color, isOn }),
        [size, isLoading, domain, color, isOn]
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
            data-color={color}
            data-size={size}
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
  const { isLoading, domain, color, isOn } = React.useContext(GridCardContext)

  return (
    <IconCircle
      domain={domain}
      color={color}
      active={isOn}
      className={`grid-card-icon${className ? ` ${className}` : ''}`}
    >
      {isLoading ? <Spinner size="2" /> : children}
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
  const { domain, color } = React.useContext(GridCardContext)

  return (
    <CardName
      domain={domain}
      color={color}
      className={`grid-card-title${className ? ` ${className}` : ''}`}
    >
      {children}
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
  const { domain, color, isOn } = React.useContext(GridCardContext)

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
