import type { ReactNode } from 'react'
import { Flex, Heading, Text, Theme } from '@radix-ui/themes'
import { domainColors } from '~/theme/tokens'

/**
 * Staging for the anatomy stories.
 *
 * The parts are pieces of a card, so a story that renders one on the preview
 * background is judging it against the wrong surface. `PartStage` supplies the
 * card ground the part will actually sit on, and `AppearanceSplit` puts dark
 * and light side by side — the review surface the design-system spec asks for,
 * since a token is only right if it is right in both.
 *
 * Lives in `.storybook/` rather than beside the components: it is workshop
 * furniture, excluded from the panel bundle and from coverage along with the
 * rest of the config.
 */

export interface PartStageProps {
  /** Optional caption above the parts (the appearance name, a state label). */
  title?: string
  children: ReactNode
}

/** A card-shaped surface, painted from the same tokens the card shell will use. */
export function PartStage({ title, children }: PartStageProps) {
  return (
    <Flex
      direction="column"
      gap="3"
      style={{
        background: 'var(--liebe-card-bg)',
        borderRadius: 'var(--liebe-card-radius)',
        boxShadow: 'var(--liebe-card-shadow)',
        color: 'var(--liebe-fg)',
        padding: 'var(--liebe-card-padding)',
      }}
    >
      {title ? (
        <Heading as="h2" size="2" style={{ color: 'var(--liebe-muted)' }}>
          {title}
        </Heading>
      ) : null}
      {children}
    </Flex>
  )
}

export interface AppearanceSplitProps {
  children: ReactNode
}

/**
 * Renders its children twice, once per appearance. Each pane is its own Radix
 * `Theme`, which is where the `--liebe-*` tokens are declared, so the two sides
 * resolve independently rather than sharing the toolbar's choice.
 */
export function AppearanceSplit({ children }: AppearanceSplitProps) {
  return (
    <Flex direction={{ initial: 'column', md: 'row' }} gap="4" align="stretch">
      {(['dark', 'light'] as const).map((appearance) => (
        <Theme key={appearance} appearance={appearance} style={{ flex: 1, minWidth: 0 }}>
          <Flex
            direction="column"
            gap="2"
            style={{
              background: 'var(--liebe-bg)',
              borderRadius: 'var(--liebe-card-radius)',
              padding: 'var(--liebe-card-padding)',
            }}
          >
            <Text size="1" style={{ color: 'var(--liebe-muted)' }}>
              {appearance === 'dark' ? 'Dark' : 'Light'}
            </Text>
            {children}
          </Flex>
        </Theme>
      ))}
    </Flex>
  )
}

/**
 * The domain colours an anatomy story offers as a control — read from the
 * palette itself, so a colour added to the contract is selectable in every
 * anatomy story without touching one.
 */
export const domainColorOptions = domainColors.map(({ name }) => name)
