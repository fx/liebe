import { Theme } from '@radix-ui/themes'
import { dashboardActions, dashboardStore } from '~/store/dashboardStore'
import { useCameraFullscreenActive, CAMERA_FULLSCREEN_Z_INDEX } from '~/store/cameraFullscreenStore'
import { useEffect } from 'react'
import { RouterProvider } from '@tanstack/react-router'
import { router } from '~/router'

export function PanelApp() {
  useEffect(() => {
    // Initialize the dashboard store
    // For panel mode, we start with no screens and let the user create them
    const state = dashboardStore.state
    if (!state.currentScreenId && state.screens.length > 0) {
      dashboardActions.setCurrentScreen(state.screens[0].id)
    }
  }, [])

  // This is the ROOT Theme (data-is-root-theme="true"), so it establishes a
  // stacking context (`position: relative; z-index: 0`) that would otherwise
  // cap the camera card's in-place fullscreen overlay below Home Assistant's
  // chrome. While any camera overlay is open, lift this ancestor's stacking so
  // the overlay paints over HA's header/sidebar — WITHOUT moving the stream
  // node. See docs/changes/0008-camera-fullscreen-no-dom-move.md.
  const cameraFullscreenActive = useCameraFullscreenActive()

  return (
    <Theme
      style={
        cameraFullscreenActive
          ? { position: 'relative', zIndex: CAMERA_FULLSCREEN_Z_INDEX }
          : undefined
      }
    >
      <RouterProvider router={router} />
    </Theme>
  )
}
