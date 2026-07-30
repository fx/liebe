import { Flex, Text, Theme } from '@radix-ui/themes'
import { Chip } from '~/components/anatomy/Chip'
import { Pill, PillGroup } from '~/components/anatomy/Pill'
import { domainColors } from '~/theme/tokens'

/**
 * The label-on-a-part review surface — every domain colour, both states, both
 * appearances, under whichever theme the story pins.
 *
 * It exists because `--liebe-part-label` / `--liebe-part-label-active` are the
 * one pair of tokens whose whole point is that a theme may need them to say
 * something the base layer's neutral cannot (docs/changes/0036-theming-contract-gaps.md
 * PR 3). The tokens default to the neutrals the anatomy used to hardcode, so
 * under Default and Liquid Glass this grid is what the labels have always
 * looked like — the two galleries are the before/after pair, and the useful
 * comparison is against LCARS, which fills the active part with the domain hue
 * and darkens the label on it.
 *
 * The whole palette rather than a representative few, because a label's ground
 * changes per hue the moment a theme fills the part: the readability question
 * is asked ten times, not once.
 *
 * Lives in `.storybook/` like the rest of the workshop furniture — excluded
 * from the panel bundle and from the coverage denominator.
 */

/** Pills and chips across the palette, in both states, on the card ground. */
function LabelMatrix() {
  return (
    <Flex
      direction="column"
      gap="3"
      style={{
        background: 'var(--liebe-card-bg)',
        borderRadius: 'var(--liebe-card-radius)',
        color: 'var(--liebe-fg)',
        padding: 'var(--liebe-card-padding)',
      }}
    >
      {/*
       * `domain` carries the triplet's name rather than an entity domain. The
       * matrix is about colour, and a triplet is state-resolved rather than
       * per-domain — `ok` is a lock, a person and a fan — so there is no one
       * domain to name. It keeps `data-domain` stamped, which every part
       * requires, and says which triplet the row is.
       */}
      {domainColors.map(({ name, meaning }) => (
        <Flex key={name} align="center" gap="3" wrap="wrap">
          <Text size="1" style={{ color: 'var(--liebe-muted)', minWidth: 64 }}>
            {name}
          </Text>
          {/*
           * A two-pill group is the shape a card really renders — the active
           * pill beside an inactive one, so the pair is judged together rather
           * than the active label alone.
           */}
          <PillGroup label={`${meaning} — active and inactive`}>
            {/*
             * `onClick` is required of a pill — it is a real button, and one
             * that does nothing is a defect rather than a variant. Here the
             * two states are shown side by side rather than toggled, so the
             * handler is deliberately empty and the story is read, not driven.
             */}
            <Pill label="Active" color={name} domain={name} active onClick={() => {}} />
            <Pill label="Inactive" color={name} domain={name} onClick={() => {}} />
          </PillGroup>
          <Chip label="Active" color={name} domain={name} active />
          <Chip label="Inactive" color={name} domain={name} />
        </Flex>
      ))}
    </Flex>
  )
}

/**
 * The matrix in dark and light at once.
 *
 * Each pane is its own Radix `Theme` stamped `liebe-root`, exactly as
 * `AppearanceSplit` and `ThemeGallerySplit` do it: the `--liebe-*` tokens are
 * declared on that selector, so without the class both panes would resolve the
 * provider's single appearance and the split would show one answer twice. For a
 * `dark-only` theme the two panes are deliberately identical — LCARS declares
 * its tokens unconditionally rather than under a dark selector, and this is the
 * surface that shows it holding in a light subtree.
 */
export function PartLabelSplit() {
  return (
    <Flex direction={{ initial: 'column', md: 'row' }} gap="4" align="stretch">
      {(['dark', 'light'] as const).map((appearance) => (
        <Theme
          key={appearance}
          appearance={appearance}
          className="liebe-root"
          style={{ flex: 1, minWidth: 0 }}
        >
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
            <LabelMatrix />
          </Flex>
        </Theme>
      ))}
    </Flex>
  )
}
