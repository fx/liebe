import type { Meta, StoryObj } from '@storybook/react-vite'
import { getTheme } from '../themeRegistry'
import { ThemeGallery, galleryEntities } from '../../../.storybook/themeGallery'

/**
 * **LCARS** — a dark-only okudagram console, and the theming system's stress
 * test.
 *
 * Liquid Glass proves a theme can be nothing but tokens; LCARS proves the other
 * end of the contract. Black ground, bundled Antonio in uppercase, cards as
 * colour-capped blocks, a framed console shell — and every rule in
 * `src/theme/themes/lcars.css` keyed off a class or attribute the [stable
 * selector contract](https://github.com/fx/liebe/blob/main/docs/specs/theming/index.md)
 * promises. Nothing targets an internal class name, so if a later PR
 * restructures a card and these galleries break, the contract was violated.
 *
 * The theme declares `dark-only`, so the appearance toolbar is written back to
 * dark whichever way it is set: what you see here is the only appearance LCARS
 * has. The typeface is registered at the document level rather than in the
 * theme layer — a shadow root does not load `@font-face` declared inside it —
 * and ships as a bundled woff2, so it works on a LAN-only install.
 */
const meta: Meta = {
  title: 'Design System/Themes/LCARS',
  globals: { theme: getTheme('lcars')!.id },
  parameters: {
    liebe: { entities: galleryEntities() },
  },
}

export default meta
type Story = StoryObj

/**
 * A mixed screenful of cards inside the console frame: the elbow and segmented
 * rail on the screen, a bar over the section, and each card a black block with
 * a domain-coloured pill cap.
 */
export const Gallery: Story = {
  render: () => <ThemeGallery />,
}

/**
 * The same cards across three sections, which is what the section rules are
 * actually written for: bar colours alternate, and each bar carries a code
 * label generated from a CSS counter.
 *
 * A screen renders one section today, so this is the only surface those two
 * rules are visible on — and the acceptance surface for the day a screen
 * renders several.
 */
export const SectionFrames: Story = {
  render: () => <ThemeGallery sections={3} />,
}
