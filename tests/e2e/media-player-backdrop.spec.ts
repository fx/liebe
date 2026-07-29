import { test, expect, type Page, type Locator } from '@playwright/test'
import { buildSeedConfig, DEMO_MEDIA_PLAYER, gridItemFor, openPanel } from './helpers'

/**
 * The progress readouts stay legible over background artwork.
 *
 * This lives in the e2e suite because **jsdom cannot answer the question**. The
 * treatment works by overriding `--liebe-fg` / `--liebe-muted` in the backdrop
 * scope and letting them inherit down to whatever reads them, and jsdom's
 * `getComputedStyle` neither inherits custom properties nor resolves `var()` —
 * it hands back the literal string `var(--liebe-muted)`. A unit test could
 * therefore only assert that a class name is present, which is precisely the
 * transcription REVIEW.md warns about: it would pass just as happily against
 * the defect this spec exists to catch.
 *
 * The defect: the readouts were `<Text color="gray">`. A Radix `color` prop
 * colours the element itself from a Radix scale, so no ancestor `color` reaches
 * it — the two time readouts stayed grey on a photograph while every other line
 * on the card went white.
 *
 * **Two cards, not one.** A single backdrop card asserting "the readout is
 * white" cannot distinguish a working treatment from one that happens to be
 * white for another reason. The control card renders the same entity with the
 * same progress bar and `artworkMode: thumbnail`, so the spec fails if the two
 * ever agree — which is what makes the assertion about the backdrop rather than
 * about the colour white.
 */

const BACKDROP_ITEM = 'item-media-backdrop'
const CONTROL_ITEM = 'item-media-control'
const BACKDROP_NAME = 'Backdrop Player'
const CONTROL_NAME = 'Control Player'

function seedMediaConfig() {
  return buildSeedConfig({
    // A dedicated screen, like the camera and resize seeds: this spec asserts
    // against a specific pair of cards and must not perturb the deterministic
    // seed the other serial specs read.
    id: 'e2e-media-screen',
    name: 'E2E Media',
    slug: 'e2e-media',
    items: [
      /*
       * Both are 2×2 — `full` on a 12-column desktop grid — because that is the
       * only tier where either the background artwork or the progress bar
       * renders at all. `name` is overridden so the two tiles carry different
       * text: they show the same entity, so a text filter could not otherwise
       * tell them apart, and a first-match selector in a shadow root is a
       * latent false result in both directions.
       */
      {
        id: BACKDROP_ITEM,
        type: 'entity',
        entityId: DEMO_MEDIA_PLAYER,
        x: 0,
        y: 0,
        width: 2,
        height: 2,
        config: { name: BACKDROP_NAME, artworkMode: 'background', showProgress: true },
      },
      {
        id: CONTROL_ITEM,
        type: 'entity',
        entityId: DEMO_MEDIA_PLAYER,
        x: 3,
        y: 0,
        width: 2,
        height: 2,
        config: { name: CONTROL_NAME, artworkMode: 'thumbnail', showProgress: true },
      },
    ],
  })
}

/** The computed colour of a card's first time readout, as the browser resolves it. */
async function readoutColour(card: Locator): Promise<string> {
  const readout = card.locator('.liebe-media-progress-time').first()
  await expect(readout, 'the progress readout should render').toHaveCount(1)
  return readout.evaluate((el) => getComputedStyle(el).color)
}

/** `rgb(...)`/`rgba(...)` split into channels, so "is it white" is a fact about numbers. */
function channels(colour: string): { r: number; g: number; b: number } {
  const [r, g, b] = colour.match(/[\d.]+/g)!.map(Number)
  return { r, g, b }
}

test('progress readouts take the white treatment over background artwork', async ({
  page,
}: {
  page: Page
}) => {
  await openPanel(page, seedMediaConfig())

  const backdrop = gridItemFor(page, BACKDROP_NAME)
  const control = gridItemFor(page, CONTROL_NAME)

  await expect(backdrop, 'the backdrop card should be laid out').toHaveCount(1)
  await expect(control, 'the control card should be laid out').toHaveCount(1)

  // The mode is real: only the backdrop card paints full-bleed artwork.
  await expect(backdrop.locator('.liebe-media-backdrop')).toHaveCount(1)
  await expect(backdrop.locator('.liebe-media-scrim')).toHaveCount(1)
  await expect(control.locator('.liebe-media-backdrop')).toHaveCount(0)

  const backdropColour = await readoutColour(backdrop)
  const controlColour = await readoutColour(control)

  // White over the artwork — asserted on the channels rather than on a string,
  // so an alpha or formatting change does not silently pass or fail it.
  const { r, g, b } = channels(backdropColour)
  expect({ r, g, b }, `backdrop readout resolved to ${backdropColour}`).toEqual({
    r: 255,
    g: 255,
    b: 255,
  })

  /*
   * And the control is NOT white, which is what proves the assertion above is
   * about the backdrop treatment. Without this the spec would pass against a
   * card that painted every readout white in every mode.
   */
  const controlChannels = channels(controlColour)
  expect(
    controlChannels,
    `control readout resolved to ${controlColour}, which should be the muted token`
  ).not.toEqual({ r: 255, g: 255, b: 255 })
  expect(backdropColour, 'the two modes must not resolve to the same colour').not.toBe(
    controlColour
  )
})
