import { Store } from '@tanstack/store'
import { useStore } from '@tanstack/react-store'

// Number of camera cards currently showing their in-app ("semi") fullscreen
// overlay. See docs/changes/0008-camera-fullscreen-no-dom-move.md.
//
// The overlay is promoted IN PLACE — its <ha-camera-stream> node never moves in
// the DOM — so it stays a descendant of the root `.radix-themes` element, which
// establishes its own stacking context (`position: relative; z-index: 0`). A
// descendant `z-index` is therefore capped WITHIN that context and cannot
// out-stack Home Assistant's chrome, which sits outside it. While any overlay
// is open, PanelApp lifts the root Theme element's stacking (a STYLE change on
// an ancestor — the stream node still never moves), letting the overlay paint
// over HA's header/sidebar. A counter (not a boolean) keeps that lift correct
// even if two overlays were ever open at once.
export const cameraFullscreenStore = new Store<number>(0)

export function enterCameraFullscreen(): void {
  cameraFullscreenStore.setState((count) => count + 1)
}

export function exitCameraFullscreen(): void {
  // Clamp at zero so an unbalanced exit can never drive the count negative
  // (which would strand the lift off while an overlay is still open).
  cameraFullscreenStore.setState((count) => Math.max(0, count - 1))
}

// True while at least one camera card's in-app fullscreen overlay is open.
export function useCameraFullscreenActive(): boolean {
  return useStore(cameraFullscreenStore, (count) => count > 0)
}
