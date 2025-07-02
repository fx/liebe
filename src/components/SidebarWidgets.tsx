import { Flex } from '@radix-ui/themes'
import { useStore } from '@tanstack/react-store'
import { dashboardStore } from '../store/dashboardStore'
import { ClockWidget } from './widgets/ClockWidget'
import { WeatherWidget } from './widgets/WeatherWidget'
import { QuickControlsWidget } from './widgets/QuickControlsWidget'
import type { WidgetConfig } from '../store/types'

export function SidebarWidgets() {
  const sidebarWidgets = useStore(dashboardStore, (state) => state.sidebarWidgets)

  const renderWidget = (widget: WidgetConfig) => {
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
  }

  return (
    <Flex direction="column" gap="3">
      {sidebarWidgets.sort((a, b) => a.position - b.position).map((widget) => renderWidget(widget))}
    </Flex>
  )
}
