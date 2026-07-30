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
 * **Nothing mounts a `PortalHost` yet, so today every overlay still lands in
 * `document.body` — exactly as before this module existed.** That is deliberate
 * and the reason is worth reading before wiring one up, because the obvious
 * placement does not work:
 *
 * A host INSIDE the shadow root is what the theming spec prefers and what
 * change 0036 PR 2 attempted. It is unavailable. Every Radix overlay marked
 * `modal` — which `Dialog.Root` hardcodes — calls `hideOthers(content)` from the
 * `aria-hidden` package, which reconciles its target against `document.body`
 * with `Node.contains` and climbs only to the FIRST shadow host it meets. From
 * inside the panel that host is `<liebe-panel>`, which `document.body` does not
 * contain either, because Home Assistant nests it several shadow roots deep. The
 * helper then keeps no target at all and hides every child of `document.body` —
 * `<home-assistant>` included, and with it the panel and the overlay that just
 * opened. See docs/changes/0036-theming-contract-gaps.md for the measurement.
 *
 * What remains is the spec's `liebe-portal-root` container at the document
 * level, which is where a `PortalHost` belongs. It MUST carry `liebe-root`, or
 * the overlays in it will be layered and tokenless: Radix stamps `radix-themes`
 * on the theme root it wraps around every portal, and that is the selector the
 * token contract is declared on, so an overlay re-declares the whole contract on
 * itself and an element's own declaration beats anything an ancestor says.
 *
 * Nothing here sets a z-index. Radix's portalled content manages its own
 * stacking (see AGENTS.md, "Radix UI Styling Best Practices").
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
 * The element overlays mount into, or `null` with no `PortalHost` above them —
 * which is every tree in the panel today, and is what keeps this module's
 * behaviour identical to importing Radix directly.
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
 * The seam the `liebe-portal-root` container will mount, and today exercised
 * only by this module's tests — see the note at the top of the file for why
 * nothing mounts it in the panel yet.
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
