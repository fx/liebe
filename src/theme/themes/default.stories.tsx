import type { Meta, StoryObj } from '@storybook/react-vite'
import { DEFAULT_THEME_ID } from '../themeRegistry'
import { PartLabelSplit } from '../../../.storybook/partLabels'

/**
 * **Default** — the theme every dashboard starts on, and the one the token
 * contract's values are specified against.
 *
 * It has needed no story of its own: it is what every other story in the
 * workshop renders under unless the toolbar is moved, so pinning it would have
 * duplicated them all. What is here instead is the surface where "Default is
 * unchanged" is a claim worth being able to check — the pair of tokens added by
 * [0036](https://github.com/fx/liebe/blob/main/docs/changes/0036-theming-contract-gaps.md)
 * PR 3 for the colour of a label on a pill or a chip. They default to the two
 * neutrals the anatomy stylesheet used to write as literals, so Default renders
 * exactly as it did; the story exists so that stays visible rather than
 * asserted.
 */
const meta: Meta = {
  title: 'Design System/Themes/Default',
  globals: { theme: DEFAULT_THEME_ID },
}

export default meta
type Story = StoryObj

/**
 * The label on a pill and a chip, across the whole palette in both appearances.
 *
 * Muted while inactive, the primary foreground while active — the neutral the
 * tint pattern deliberately leaves labels on, because the pattern's hue is
 * calibrated for a glyph at 3:1 and a 12.5px label needs 4.5:1, which no end of
 * a triplet clears on its own 20% tint. Compare with the LCARS story of the
 * same name, where the part is filled solid and the label goes black.
 */
export const PartLabels: Story = {
  render: () => <PartLabelSplit />,
}
