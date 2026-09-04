import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { composeStories, setProjectAnnotations } from '@storybook/react-vite'
import * as previewAnnotations from '../../.storybook/preview'
import { resetDispatchGuard } from '../services/guardedDispatch'

/**
 * The story runner: every `play` function in the workshop, executed as a test.
 *
 * Storybook's own `play` functions used to run nowhere — `build-storybook`
 * proves they compile, `*.stories.tsx` is excluded from coverage, and Vitest
 * collects `*.{test,spec}.*` only. Roughly two hundred assertions therefore read
 * as tests to every reviewer while being unable to fail, and at least two had
 * been wrong since the day they were written (docs/changes/0040-test-harness-
 * reliability.md). This file is the decision that ended that: the workshop is
 * **gate-grade**, and the gate is the suite that already runs rather than a
 * second CI job driving a browser.
 *
 * It uses Storybook's portable-stories API, so each story is composed with the
 * real `.storybook/preview` annotations — the same decorators, parameters and
 * globals the workshop renders it with — and then rendered and played here.
 * Nothing about a story changes to be testable.
 *
 * See `docs/specs/storybook/index.md` — "CI & publishing" for the decision and
 * its cost, and `BROWSER_ONLY` below for the one thing jsdom cannot do.
 */

/*
 * The workshop swaps this hook for a fixture-driven stub through a Vite plugin
 * in `.storybook/vite.config.ts`, because the real one resolves the stream
 * element through the Home Assistant frontend's card-helper ladder and can only
 * ever succeed inside HA. The runner has to reproduce that substitution or every
 * camera story renders the still-image fallback and the card's whole stream
 * surface — the connecting spinner, the status pill, the controls, the Retry —
 * becomes unreachable. Mocking the module by the same specifier the card imports
 * keeps the scoping identical to the plugin's.
 */
vi.mock('../components/CameraCard/useCameraStreamReady', async () =>
  vi.importActual('../../.storybook/mockCameraStreamReady')
)

setProjectAnnotations([previewAnnotations.default])

/**
 * The prefix `.storybook/mockCameraStream.ts` gives both of its frames — the one
 * the workshop serves and the one it deliberately does not.
 *
 * The loader below is scoped to these and nothing else. A prototype-wide shim
 * would answer for every image in the workshop, and answering "not found" for a
 * `data:` avatar or a remote album cover is not what a browser does — it would
 * push cards into their image-error states behind assertions that never asked
 * about loading at all. Outside this prefix, jsdom's silence is the honest
 * behaviour and is left alone.
 */
const MOCK_CAMERA_FRAME_PREFIX = 'mock-camera-frame'

/**
 * The file names `.storybook/public` holds — the workshop's `staticDirs`, and so
 * exactly the set of URLs its server can answer.
 *
 * Asked of Vite's module graph rather than of the filesystem, and neither
 * `__dirname` nor `import.meta.url` is involved. `__dirname` exists here only
 * because Vitest's SSR transform defines it; `import.meta.url` under the jsdom
 * environment is the *page* URL rather than a `file:` one, so `fileURLToPath`
 * on it throws `The URL must be of scheme file`. Both are properties of the
 * runner rather than of this test, and the second is the trap — it is the
 * portable-looking one. `import.meta.glob` is resolved at transform time by the
 * same tool that resolves every other path in this file, so it answers the only
 * question the loader below has — "does the workshop serve this?" — without
 * either.
 */
const WORKSHOP_STATIC_FILES = new Set(
  Object.keys(import.meta.glob('../../.storybook/public/*')).map((path) => path.split('/').pop()!)
)

/**
 * jsdom's stand-in for the workshop's static file server, for the mock camera
 * frames only.
 *
 * jsdom never fetches an `<img>`, so it fires neither `load` nor `error` — and
 * `.storybook/mockCameraStream.ts` announces a stream by re-dispatching the
 * image's own `load`. Without this the camera stories sit in `CONNECTING`
 * forever, which is a property of the runner rather than of the card.
 *
 * The answer is deliberately the real one rather than "always succeed": the mock
 * distinguishes its two branches by pointing at a file the workshop serves and
 * one it deliberately does not, so asking the same question the browser asks the
 * server keeps BOTH branches honest. A shim that always fired `load` would turn
 * the stream-error story into a silent pass.
 */
function installStaticFileImageLoader() {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!
  /** Intrinsic size a decoded frame reports; only "> 0" is ever read. */
  const DECODED_FRAME_SIZE = 640
  const decoded = new WeakSet<HTMLImageElement>()

  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: descriptor.get,
    set(this: HTMLImageElement, value: string) {
      descriptor.set!.call(this, value)

      // `.storybook/public` is `staticDirs` in the workshop, and the fallback
      // appends a cache-busting query the server ignores.
      const file = value.split('?')[0].split('/').pop() ?? ''
      decoded.delete(this)
      if (!file.startsWith(MOCK_CAMERA_FRAME_PREFIX)) return

      const served = WORKSHOP_STATIC_FILES.has(file)

      queueMicrotask(() => {
        if (served) decoded.add(this)
        this.dispatchEvent(new Event(served ? 'load' : 'error'))
      })
    },
  })

  /*
   * `useCameraStreamStatus` reads `naturalWidth` to tell a frame that arrived
   * from one that only announced itself — an MJPEG stream that stalls fires
   * `load` and decodes nothing. jsdom decodes nothing either and reports 0 for
   * every image, so the status machine would stay in `connecting` however
   * faithfully the `load` above is delivered. Reporting a size for exactly the
   * images this loader served keeps the two branches distinct.
   */
  for (const dimension of ['naturalWidth', 'naturalHeight'] as const) {
    Object.defineProperty(HTMLImageElement.prototype, dimension, {
      configurable: true,
      get(this: HTMLImageElement) {
        return decoded.has(this) ? DECODED_FRAME_SIZE : 0
      },
    })
  }
}

installStaticFileImageLoader()

/**
 * Stories whose assertions jsdom cannot evaluate, each with the reason.
 *
 * Every one of these measures rendered geometry, and jsdom lays nothing out:
 * every box is 0×0, so an assertion about a column's width fails and its
 * neighbour about overflow (`scrollWidth <= clientWidth`) passes on `0 <= 1`
 * without proving anything. Both outcomes are worthless, which is why these are
 * named rather than left to score.
 *
 * The list is **self-verifying**, and in two directions rather than one. Each
 * entry is executed and MUST throw here, so a story that starts passing is an
 * entry that has gone stale and gets reported rather than skipped forever — the
 * failure mode this whole change exists to remove, one level down. And each
 * entry pins the message it MUST throw with: none of these stories asserts only
 * geometry, so "it threw" alone would swallow a real regression in the
 * assertions around it — `ForecastsMaxCountOnMinimumWidthTile` counts columns
 * before it measures one, `DragToMaximum` has to find the slider before it can
 * drag it. Matching the message keeps the entry an exemption from one
 * assertion rather than from the whole story.
 */
const BROWSER_ONLY: Record<string, { reason: string; throws: RegExp }> = {
  'WeatherCard/ForecastsMaxCountOnMinimumWidthTile': {
    reason: 'asserts capacity omits columns rather than overflowing, from measured widths',
    throws: /expected 12 to be less than 12/,
  },
  'SensorCard/GraphInFullSmallTile': {
    reason: 'asserts the graph-to-tile height ratio from measured boxes',
    throws: /to be close to NaN/,
  },
  'SensorCard/GraphInFullLargeTile': {
    reason: 'asserts the graph-to-tile height ratio from measured boxes',
    throws: /to be close to NaN/,
  },
  'Slider/DragToMaximum': {
    reason: 'drags across the track by client coordinates, which jsdom reports as 0',
    throws: /aria-valuenow/,
  },
}

const modules = import.meta.glob('../**/*.stories.tsx', { eager: true }) as Record<
  string,
  Record<string, unknown>
>

type PlayableStory = {
  (): React.ReactElement
  /**
   * Runs the story's loaders and its `beforeEach` hooks — the project's, the
   * meta's and the story's — and the cleanups the previous `load` left behind.
   *
   * Not optional bookkeeping: several stories here reset a module-level service
   * from `beforeEach` (`entityHistoryService` in `SensorCard` and
   * `EntityDetailDialog`, so a second story does not render from the window the
   * first one fetched). Rendering without it would let exactly the singleton
   * state those hooks exist to clear leak between stories.
   */
  load: () => Promise<void>
  play?: (context: { canvasElement: HTMLElement }) => Promise<void>
}

/** `../components/WeatherCard/WeatherCard.stories.tsx` → `WeatherCard`. */
function suiteName(path: string): string {
  return path.split('/').pop()!.replace('.stories.tsx', '')
}

beforeEach(() => {
  /*
   * The dispatch guard is process-wide on purpose (`guardedDispatch.ts` — "the
   * guarantee is about a command reaching Home Assistant at most once"), so a
   * story whose service call never settles leaves that command in flight for
   * every story after it. The next identical command is then ADMITTED AS A
   * SUCCESS, which is how `ActionCard/Activating` rendered the success check
   * while asserting the in-flight spinner. Resetting per story is what the
   * workshop gets for free by reloading the preview between stories.
   */
  resetDispatchGuard()
})

for (const [path, module] of Object.entries(modules)) {
  const suite = suiteName(path)
  const composed = composeStories(module as never) as Record<string, PlayableStory>

  describe(`story: ${suite}`, () => {
    for (const [name, Story] of Object.entries(composed)) {
      const browserOnly = BROWSER_ONLY[`${suite}/${name}`]

      it(name, async () => {
        const play = async () => {
          await Story.load()
          const { container } = render(<Story />)
          await Story.play?.({ canvasElement: container })
        }

        if (browserOnly === undefined) {
          await play()
          return
        }

        // Self-verifying exemption: the entry has to still be earning its
        // place, and to fail for the reason it claims rather than any reason.
        await expect(
          play(),
          `${suite}/${name} is listed browser-only (${browserOnly.reason}) but no longer fails that way here — re-check the entry`
        ).rejects.toThrow(browserOnly.throws)
      })
    }
  })
}
