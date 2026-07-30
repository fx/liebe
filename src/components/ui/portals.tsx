/**
 * Where Liebe's overlays mount.
 *
 * Radix's portalled components default to `document.body`, which is OUTSIDE
 * the panel's shadow root and therefore outside every layer the theming engine
 * injects there. The engine used to answer that by mirroring the baseline and
 * the theme layer into the Home Assistant document — and by deliberately NOT
 * mirroring the user layer, because user CSS selectors are the author's own and
 * a copy in the document would let a `body { display: none }` out of an
 * imported configuration restyle the frontend around the panel. Containment
 * beat reach, and the cost was that custom CSS never reached a dialog.
 *
 * This module removes the trade-off the way docs/specs/theming
 * ("Portalled UI MUST stay inside the token scope") prefers: overlays portal
 * into a host element INSIDE the shadow root, under the Liebe theme root, so
 * all three layers apply to them by being where they are and nothing is copied
 * out at all.
 *
 * Two pieces, and both are needed:
 *
 *  - `PortalHost` renders the host and publishes it on a context.
 *    `LiebeThemeProvider` mounts it inside the `liebe-root` element, which is
 *    the element the token contract is declared on — an overlay anywhere else
 *    in the shadow root would get the layers but not the tokens.
 *  - The re-exports below fill in Radix's `container` prop from that context.
 *    Importing them instead of the raw `@radix-ui/themes` ones is what makes an
 *    overlay land in the host, and an ESLint `no-restricted-imports` rule keeps
 *    the raw ones from being reached for by accident.
 *
 * The wrapped set is EVERY portalling component Radix Themes ships, not only the
 * ones the panel uses today: `src/components/ui/index.ts` re-exports the whole
 * library, so an unwrapped one would be reachable through the barrel that the
 * lint rule points people at. `ContextMenu` and `HoverCard` have no call site
 * yet and are wrapped for exactly that reason.
 *
 * Nothing here sets a z-index. Radix's portalled content manages its own
 * stacking (see AGENTS.md, "Radix UI Styling Best Practices"), and the host is
 * an empty, unstyled div precisely so that it contributes no box and no
 * stacking of its own.
 */

import { createContext, useContext, useState, type ComponentProps, type ReactNode } from 'react'
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
 * The element overlays mount into, or `null` before it has mounted (and in any
 * tree with no `PortalHost` above it — unit tests rendering a bare `Theme`).
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

/**
 * Renders the portal host beside `children` and publishes it.
 *
 * A callback ref into state rather than a `useRef`, because the container has
 * to be a value React re-renders on: the first render has no host yet, and an
 * overlay opened later must see the element rather than a ref object that was
 * empty when it was read.
 */
export function PortalHost({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)

  return (
    <PortalContainerContext.Provider value={host}>
      {children}
      {/*
       * Deliberately empty and last. React never renders into it, so the
       * portalled subtrees it holds are nobody's to reconcile away, and an
       * empty block box at the end of the theme root adds no layout.
       */}
      <div ref={setHost} className="liebe-portal-host" />
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
