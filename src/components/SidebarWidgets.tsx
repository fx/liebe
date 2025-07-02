import { useState } from 'react'
import { Box, Flex, IconButton } from '@radix-ui/themes'
import { GearIcon } from '@radix-ui/react-icons'
import { useStore } from '@tanstack/react-store'
import { dashboardStore } from '../store/dashboardStore'
import { ClockWidget } from './widgets/ClockWidget'
import { WeatherWidget } from './widgets/WeatherWidget'
import { QuickControlsWidget } from './widgets/QuickControlsWidget'
import { WeatherWidgetConfig } from './widgets/WeatherWidgetConfig'
import { Modal } from './ui'
import type { WidgetConfig } from '../store/types'

export function SidebarWidgets() {
  const sidebarWidgets = useStore(dashboardStore, (state) => state.sidebarWidgets)
  const mode = useStore(dashboardStore, (state) => state.mode)
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null)

  const handleConfigChange = (widgetId: string, config: Record<string, unknown>) => {
    dashboardStore.setState((state) => ({
      ...state,
      sidebarWidgets: state.sidebarWidgets.map((w) => (w.id === widgetId ? { ...w, config } : w)),
    }))
  }

  const renderWidget = (widget: WidgetConfig) => {
    const content = (() => {
      switch (widget.type) {
        case 'clock':
          return <ClockWidget key={widget.id} widget={widget} />
        case 'weather':
          return <WeatherWidget key={widget.id} widget={widget} />
        case 'quick-controls':
          return <QuickControlsWidget key={widget.id} widget={widget} />
        default:
          return null
      }
    })()

    if (!content) return null

    return (
      <Box key={widget.id} position="relative">
        {content}
        {mode === 'edit' && widget.type === 'weather' && (
          <IconButton
            size="1"
            variant="soft"
            color="gray"
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              minWidth: '32px',
              minHeight: '32px',
            }}
            onClick={() => setConfigWidgetId(widget.id)}
            aria-label="Configure widget"
          >
            <GearIcon />
          </IconButton>
        )}
      </Box>
    )
  }

  const configWidget = configWidgetId ? sidebarWidgets.find((w) => w.id === configWidgetId) : null

  return (
    <>
      <Flex direction="column" gap="3">
        {sidebarWidgets
          .sort((a, b) => a.position - b.position)
          .map((widget) => renderWidget(widget))}
      </Flex>

      {configWidget && configWidget.type === 'weather' && (
        <Modal
          open={!!configWidgetId}
          onOpenChange={(open) => !open && setConfigWidgetId(null)}
          title="Configure Weather Widget"
          size="small"
          actions={{
            secondary: {
              label: 'Cancel',
              onClick: () => setConfigWidgetId(null),
            },
            primary: {
              label: 'Done',
              onClick: () => setConfigWidgetId(null),
              color: 'blue',
            },
          }}
        >
          <WeatherWidgetConfig
            widget={configWidget}
            onChange={(config) => handleConfigChange(configWidget.id, config)}
          />
        </Modal>
      )}
    </>
  )
}
