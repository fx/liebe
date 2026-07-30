import type { Meta, StoryObj } from '@storybook/react-vite'
import { getTheme } from '../themeRegistry'
import { ThemeGallery, ThemeGallerySplit, galleryEntities } from '../../../.storybook/themeGallery'
import { PartLabelSplit } from '../../../.storybook/partLabels'

/**
 * **Liquid Glass** — frosted translucency over a radial-gradient wallpaper, and
 * the theming system's proof that a theme can be *only* tokens.
 *
 * Nothing in `src/theme/themes/liquidGlass.css` targets a component: it
 * declares custom properties on the theme root and stops. That is enforced, not
 * merely intended — `src/theme/__tests__/liquidGlass.test.ts` fails the build on
 * a selector or a non-token declaration in that file. So these galleries double
 * as the regression canary the spec asks for: if a later PR moves a card's
 * markup around and the gallery still renders, token routing survived.
 *
 * The theme is pinned on these stories rather than left to the toolbar, so the
 * gallery is always the Liquid Glass gallery. The appearance is not: switch it
 * in the toolbar, or use _Both appearances_ to see the pair at once.
 */
const meta: Meta = {
  title: 'Design System/Themes/Liquid Glass',
  globals: { theme: getTheme('liquid-glass')!.id },
  parameters: {
    liebe: { entities: galleryEntities() },
  },
}

export default meta
type Story = StoryObj

/** A mixed screenful of cards in the appearance selected in the toolbar. */
export const Gallery: Story = {
  render: () => <ThemeGallery />,
}

/**
 * Dark above light, each at full width. Liquid Glass declares `both`, and the
 * two are different designs rather than one design flipped: dark is a 10% white
 * veil over a deep mesh, light a 58% veil over a pale one, because a 10% white
 * veil on a pale ground is not a surface at all.
 */
export const BothAppearances: Story = {
  render: () => <ThemeGallerySplit />,
}

/**
 * The label on a pill and a chip, across the whole palette in both appearances.
 *
 * `--liebe-part-label` / `--liebe-part-label-active` default to the neutrals
 * the anatomy used to hardcode, so this grid is what Liquid Glass has always
 * rendered — the token changed what a theme *can* say, not what this one says
 * (docs/changes/0036-theming-contract-gaps.md PR 3). Compare it with the LCARS
 * story of the same name, which is the case the tokens exist for.
 */
export const PartLabels: Story = {
  render: () => <PartLabelSplit />,
}
