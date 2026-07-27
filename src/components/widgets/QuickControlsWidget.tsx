import { Card, Flex, Heading } from '@radix-ui/themes'
import { ButtonCard } from '../ButtonCard'
import { LightCard } from '../LightCard'
import type { CardSpan } from '~/utils/cardTier'

/** Two cells wide, one tall — the `row` tier's span, stated rather than derived. */
const SIDEBAR_SPAN: CardSpan = { width: 2, height: 1 }

interface QuickControlsWidgetProps {
  widget: { id: string }
}

export function QuickControlsWidget({ widget: _widget }: QuickControlsWidgetProps) {
  return (
    <Card size="2">
      <Flex direction="column" gap="3" p="3">
        <Heading size="4" weight="bold">
          Quick Controls
        </Heading>

        {/*
         * The sidebar is not a grid, so there is no span to derive a tier from
         * and the widget states one: these are full-width strips one line tall,
         * which is the `row` tier's shape. Passed explicitly rather than left to
         * the shell's default so the widget's intent is on the page
         * (docs/changes/0011-layout-tiers.md).
         */}
        <Flex direction="column" gap="2">
          <LightCard entityId="light.living_room" tier="row" span={SIDEBAR_SPAN} />
          <LightCard entityId="light.bedroom" tier="row" span={SIDEBAR_SPAN} />
          <ButtonCard entityId="switch.main_power" tier="row" span={SIDEBAR_SPAN} />
        </Flex>
      </Flex>
    </Card>
  )
}
