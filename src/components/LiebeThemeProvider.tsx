import { Theme } from '@radix-ui/themes'
import type { ReactNode } from 'react'
import { useCameraFullscreenActive, CAMERA_FULLSCREEN_Z_INDEX } from '~/store/cameraFullscreenStore'

export interface LiebeThemeProviderProps {
  children: ReactNode
  /**
   * Resolved appearance for the Radix `Theme`. The panel leaves this undefined
   * (Radix then inherits from the surrounding document); the Storybook preview
   * passes the appearance chosen in the toolbar.
   */
  appearance?: 'dark' | 'light'
}

/**
 * The panel's provider shell, importable in isolation.
 *
 * This is deliberately free of bootstrap side effects (no custom-element
 * registration, no router, no Home Assistant connection) so surfaces that are
 * not the panel — today the Storybook preview — can render components inside
 * exactly the same provider stack the panel uses. See
 * docs/specs/storybook/index.md ("Global decorators & toolbar").
 */
export function LiebeThemeProvider({ children, appearance }: LiebeThemeProviderProps) {
  // This is the ROOT Theme (data-is-root-theme="true"), so it establishes a
  // stacking context (`position: relative; z-index: 0`) that would otherwise
  // cap the camera card's in-place fullscreen overlay below Home Assistant's
  // chrome. While any camera overlay is open, lift this ancestor's stacking so
  // the overlay paints over HA's header/sidebar — WITHOUT moving the stream
  // node. See docs/changes/0008-camera-fullscreen-no-dom-move.md.
  const cameraFullscreenActive = useCameraFullscreenActive()

  return (
    <Theme
      appearance={appearance}
      style={
        cameraFullscreenActive
          ? { position: 'relative', zIndex: CAMERA_FULLSCREEN_Z_INDEX }
          : undefined
      }
    >
      {children}
    </Theme>
  )
}
