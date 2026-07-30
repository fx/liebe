/**
 * The single import site for Radix's portalling components, and the seam that
 * decides where their content mounts.
 *
 * Radix defaults every portal to `document.body`, which in the panel is outside
 * the shadow root and outside all three layers the theming engine injects there
 * (docs/specs/theming — "Portalled UI MUST stay inside the token scope"). Each
 * component is re-exported here with its `container` filled in from
 * `PortalContainerContext`, so the decision lives in one place instead of at
 * twenty-odd call sites, and an ESLint `no-restricted-imports` rule keeps the
 * raw ones from being reached for by accident.
 *
 * WHERE THE CONTAINER GOES, AND WHY NOT THE OBVIOUS PLACE
 * ------------------------------------------------------
 * A host INSIDE the shadow root is what the theming spec prefers and what
 * change 0036 PR 2 attempted first. It is unavailable. Every Radix overlay
 * marked `modal` — which `Dialog.Root` hardcodes — calls `hideOthers(content)`
 * from the `aria-hidden` package, which reconciles its target against
 * `document.body` with `Node.contains` and climbs only to the FIRST shadow host
 * it meets. From inside the panel that host is `<liebe-panel>`, which
 * `document.body` does not contain either, because Home Assistant nests it
 * several shadow roots deep. The helper then keeps no target at all and hides
 * every child of `document.body` — `<home-assistant>` included, and with it the
 * panel and the overlay that just opened. See
 * docs/changes/0036-theming-contract-gaps.md for the measurement.
 *
 * So the container sits at the document level, a direct child of
 * `document.body`, which is the case `hideOthers` handles correctly — and is
 * also exactly where Radix put the overlays before this module existed, so the
 * modality and the stacking they had are unchanged.
 *
 * WHY IT IS A `<Theme>`, AND WHY IT CARRIES `liebe-root`
 * -----------------------------------------------------
 * Two independent reasons, and the container fails differently without each:
 *
 *  - **`liebe-root`** is the selector the token contract is declared on. Radix
 *    stamps `radix-themes` on the theme root it wraps around EVERY portal, so
 *    while the contract was declared on that class each open overlay
 *    re-declared the whole of it on itself — and an element's own declaration
 *    is the value it uses however its ancestors were overridden. That, not the
 *    overlay's location, is why custom CSS reached the dashboard and stopped at
 *    the edge of every dialog. The declarations moved to `.liebe-root` in the
 *    same change; without this container they would then reach no overlay at
 *    all, which is why the two ship together.
 *  - **A Radix `<Theme>`** because almost every `--liebe-*` token aliases a
 *    Radix one, and a `var()` in a custom property substitutes at the element
 *    that declares it. A plain `<div class="liebe-root">` in `document.body`
 *    has none of Radix's variables in scope, so the whole contract would
 *    compute to nothing on it.
 *
 * It is deliberately a NESTED theme (`data-is-root-theme="false"`): Radix gives
 * only the root theme `position: relative; z-index: 0; min-height: 100vh`, and
 * a stacking context here would cap full-viewport overlays below Home
 * Assistant's chrome — the trap 0008 met from the other side. Nothing here sets
 * a z-index either; Radix's portalled content manages its own stacking (see
 * AGENTS.md, "Radix UI Styling Best Practices").
 */

import { createContext, useContext, useState, type ComponentProps, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Theme } from '@radix-ui/themes'
import { LIEBE_ROOT_CLASS, PORTAL_ROOT_CLASS } from '~/theme/rootSelectors'
import type { ThemeAppearance } from '~/theme/themeRegistry'
// This module is the wrapper the rest of the panel imports instead, so it is
// the one place the raw portalled components may be named.
/* eslint-disable no-restricted-imports */
import {
  AlertDialog as ThemesAlertDialog,
  ContextMenu as ThemesContextMenu,
  Dialog as ThemesDialog,
  DropdownMenu as ThemesDropdownMenu,
  HoverCard as ThemesHoverCard,
  Popover as ThemesPopover,
  Select as ThemesSelect,
  Tooltip as ThemesTooltip,
} from '@radix-ui/themes'
/* eslint-enable no-restricted-imports */

/**
 * The element overlays mount into, or `null` with no `PortalHost` above them —
 * a tree rendered outside `LiebeThemeProvider`, which then behaves exactly as
 * importing Radix directly would.
 */
const PortalContainerContext = createContext<HTMLElement | null>(null)

/**
 * The portal host of the surrounding Liebe tree, as Radix wants it.
 *
 * `undefined` rather than `null` when there is none: Radix reads a missing
 * `container` as "use the default" and an explicit `null` as "no container at
 * all", which renders the overlay nowhere.
 */
export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined
}

export interface PortalHostProps {
  children: ReactNode
  /**
   * The stamps the panel root carries, mirrored onto the container so a theme's
   * scoped rules select an overlay exactly as they select the dashboard.
   * `LiebeThemeProvider` passes what it resolved.
   */
  themeId?: string
  appearance?: ThemeAppearance
}

/**
 * The mount point of the `liebe-portal-root` container: the body of the
 * document this code is running in.
 *
 * Read once, in state, rather than at every render — `document.body` does not
 * change under a mounted panel, and reading it during render keeps the portal
 * available on the first commit. `null` where there is no document at all, so a
 * non-DOM render (a prerender pass) simply has no container and every overlay
 * falls back to Radix's own default.
 */
function usePortalMountPoint(): HTMLElement | null {
  const [mountPoint] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.body
  )
  return mountPoint
}

/**
 * Mounts the `liebe-portal-root` container at the document level and publishes
 * it as the portal target for everything below.
 *
 * A callback ref into state rather than a `useRef`, because the container has
 * to be a value React re-renders on: the first render has no container yet, and
 * an overlay opened later must see the element rather than a ref object that
 * was empty when it was read.
 */
export function PortalHost({ children, themeId, appearance }: PortalHostProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const mountPoint = usePortalMountPoint()

  return (
    <PortalContainerContext.Provider value={container}>
      {children}
      {mountPoint &&
        createPortal(
          /*
           * Deliberately childless. React never renders into it, so the
           * portalled subtrees it ends up holding are nobody's to reconcile
           * away — and since every overlay Radix puts in it is positioned
           * `fixed`, the container itself stays a zero-height box that adds
           * nothing to Home Assistant's layout.
           *
           * `hasBackground={false}` for the same reason it has no z-index: the
           * container is a scope, not a surface. Radix would otherwise paint
           * `--color-background` on it, since an explicitly passed appearance
           * is what its `hasBackground` default keys off.
           */
          <Theme
            ref={setContainer}
            className={`${LIEBE_ROOT_CLASS} ${PORTAL_ROOT_CLASS}`}
            data-liebe-theme={themeId}
            data-appearance={appearance}
            appearance={appearance}
            hasBackground={false}
          />,
          mountPoint
        )}
    </PortalContainerContext.Provider>
  )
}

/*
 * One wrapper per portalled component, spelled out rather than produced by a
 * generic factory. Both obvious factory signatures — `ForwardRefExoticComponent<P>`
 * and `(props: P) => ReactNode` — put `P` only in contravariant position, where
 * TypeScript cannot infer it and silently falls back to the constraint: every
 * wrapped component collapsed to "takes a container and nothing else" and
 * rejected `children` at each of the twenty-odd call sites. Six four-line
 * functions cost less than the casts that would hide that.
 *
 * `container` is written BEFORE the spread in each one, so a caller passing its
 * own still wins — the prop stays the escape hatch it is for content that has to
 * land somewhere else.
 *
 * React 19 passes `ref` as an ordinary prop, so `ComponentProps` carries it
 * through the spread and none of these needs `forwardRef`.
 */

function DialogContent(props: ComponentProps<typeof ThemesDialog.Content>) {
  const container = usePortalContainer()
  return <ThemesDialog.Content container={container} {...props} />
}

function AlertDialogContent(props: ComponentProps<typeof ThemesAlertDialog.Content>) {
  const container = usePortalContainer()
  return <ThemesAlertDialog.Content container={container} {...props} />
}

function DropdownMenuContent(props: ComponentProps<typeof ThemesDropdownMenu.Content>) {
  const container = usePortalContainer()
  return <ThemesDropdownMenu.Content container={container} {...props} />
}

function DropdownMenuSubContent(props: ComponentProps<typeof ThemesDropdownMenu.SubContent>) {
  const container = usePortalContainer()
  return <ThemesDropdownMenu.SubContent container={container} {...props} />
}

function SelectContent(props: ComponentProps<typeof ThemesSelect.Content>) {
  const container = usePortalContainer()
  return <ThemesSelect.Content container={container} {...props} />
}

function PopoverContent(props: ComponentProps<typeof ThemesPopover.Content>) {
  const container = usePortalContainer()
  return <ThemesPopover.Content container={container} {...props} />
}

function ContextMenuContent(props: ComponentProps<typeof ThemesContextMenu.Content>) {
  const container = usePortalContainer()
  return <ThemesContextMenu.Content container={container} {...props} />
}

function ContextMenuSubContent(props: ComponentProps<typeof ThemesContextMenu.SubContent>) {
  const container = usePortalContainer()
  return <ThemesContextMenu.SubContent container={container} {...props} />
}

function HoverCardContent(props: ComponentProps<typeof ThemesHoverCard.Content>) {
  const container = usePortalContainer()
  return <ThemesHoverCard.Content container={container} {...props} />
}

export const Dialog = { ...ThemesDialog, Content: DialogContent }

export const AlertDialog = { ...ThemesAlertDialog, Content: AlertDialogContent }

export const DropdownMenu = {
  ...ThemesDropdownMenu,
  Content: DropdownMenuContent,
  SubContent: DropdownMenuSubContent,
}

export const Select = { ...ThemesSelect, Content: SelectContent }

export const Popover = { ...ThemesPopover, Content: PopoverContent }

export const ContextMenu = {
  ...ThemesContextMenu,
  Content: ContextMenuContent,
  SubContent: ContextMenuSubContent,
}

export const HoverCard = { ...ThemesHoverCard, Content: HoverCardContent }

// A single component rather than a namespace: Radix's `Tooltip` takes its
// content as a prop and portals it itself.
export function Tooltip(props: ComponentProps<typeof ThemesTooltip>) {
  const container = usePortalContainer()
  return <ThemesTooltip container={container} {...props} />
}
