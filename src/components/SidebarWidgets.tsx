import { Flex, Card, Text, IconButton, Button } from '@radix-ui/themes'
import { useStore } from '@tanstack/react-store'
import { dashboardStore, dashboardActions } from '../store/dashboardStore'
import { ClockWidget } from './widgets/ClockWidget'
import { WeatherWidget } from './widgets/WeatherWidget'
import { QuickControlsWidget } from './widgets/QuickControlsWidget'
import { Cross2Icon, PlusIcon, DragHandleDots2Icon } from '@radix-ui/react-icons'
import type { WidgetConfig } from '../store/types'

export function SidebarWidgets() {
  const sidebarWidgets = useStore(dashboardStore, (state) => state.sidebarWidgets)
  const mode = useStore(dashboardStore, (state) => state.mode)

  const renderWidget = (widget: WidgetConfig) => {
    const WidgetComponent = getWidgetComponent(widget.type)
    if (!WidgetComponent) return null

    if (mode === 'edit') {
      return (
        <Card key={widget.id} size="2" style={{ position: 'relative' }}>
          <Flex position="absolute" top="2" right="2" gap="1" style={{ zIndex: 10 }}>
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              style={{ cursor: 'move' }}
              aria-label="Drag widget"
            >
              <DragHandleDots2Icon />
            </IconButton>
            <IconButton
              size="1"
              variant="ghost"
              color="red"
              onClick={() => dashboardActions.removeSidebarWidget(widget.id)}
              aria-label="Remove widget"
            >
              <Cross2Icon />
            </IconButton>
          </Flex>
          <WidgetComponent widget={widget} />
        </Card>
      )
    }

    return <WidgetComponent key={widget.id} widget={widget} />
  }

  const getWidgetComponent = (type: string) => {
    switch (type) {
      case 'clock':
        return ClockWidget
      case 'weather':
        return WeatherWidget
      case 'quick-controls':
        return QuickControlsWidget
      default:
        return null
    }
  }

  const addWidget = (type: WidgetConfig['type']) => {
    const newWidget: WidgetConfig = {
      id: `widget-${Date.now()}`,
      type,
      position: sidebarWidgets.length,
    }
    dashboardActions.addSidebarWidget(newWidget)
  }

  return (
    <Flex direction="column" gap="3">
      {sidebarWidgets.sort((a, b) => a.position - b.position).map((widget) => renderWidget(widget))}

      {mode === 'edit' && (
        <Card size="2">
          <Flex direction="column" gap="2" p="2">
            <Text size="2" weight="medium">
              Add Widget
            </Text>
            <Flex gap="2" wrap="wrap">
              <Button size="1" variant="soft" onClick={() => addWidget('clock')}>
                <PlusIcon />
                Clock
              </Button>
              <Button size="1" variant="soft" onClick={() => addWidget('weather')}>
                <PlusIcon />
                Weather
              </Button>
              <Button size="1" variant="soft" onClick={() => addWidget('quick-controls')}>
                <PlusIcon />
                Quick Controls
              </Button>
            </Flex>
          </Flex>
        </Card>
      )}
    </Flex>
  )
}
