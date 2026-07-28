import { useEffect, useLayoutEffect, useMemo, type CSSProperties, type ReactNode } from 'react'
import type { Decorator } from '@storybook/react-vite'
import { useGlobals } from 'storybook/preview-api'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { LiebeThemeProvider } from '~/components/LiebeThemeProvider'
import { CardItemProvider } from '~/components/cardItemContext'
import { dashboardStore } from '~/store/dashboardStore'
import { entityStore } from '~/store/entityStore'
import {
  DEFAULT_THEME_ID,
  getTheme,
  resolveAppearance,
  type ThemeAppearance,
} from '~/theme/themeRegistry'
import { weatherForecastService } from '~/services/weatherForecast'
import {
  seedUnsupportedForecast,
  seedWeatherForecast,
  type LiebeStoryParameters,
} from '~/test/fixtures'
import { gridConfig } from '../app/utils/responsive'
import { createMockHass } from './mockHass'

/** Width the grid-cell decorator pretends the dashboard container has. */
const STORY_CONTAINER_WIDTH = 1200

const EMPTY_PARAMETERS: LiebeStoryParameters = {}

function readLiebeParameters(parameters: Record<string, unknown>): LiebeStoryParameters {
  return (parameters.liebe as LiebeStoryParameters | undefined) ?? EMPTY_PARAMETERS
}

/* ------------------------------------------------------------------ *
 * Store seeding
 * ------------------------------------------------------------------ */

function seedStores(liebe: LiebeStoryParameters) {
  const {
    entities = [],
    connected = true,
    initialLoading = false,
    mode = 'view',
    forecasts = [],
  } = liebe

  /*
   * Forecasts go into the cache the pipeline fills, not into a stubbed hook, so
   * a card story reads them through the same `useWeatherForecast` the panel
   * uses. A seeded entry is fresh, so the service finds nothing to fetch and the
   * workshop needs no connection behind it.
   */
  for (const { entityId, type = 'daily', forecast = [], unsupported } of forecasts) {
    if (unsupported) seedUnsupportedForecast(entityId, type)
    else seedWeatherForecast(entityId, forecast, type)
  }

  // Written straight to the store rather than through `entityStoreActions`:
  // `setConnected` debounces disconnects by 500ms, which would make a
  // "Disconnected" story render its connected state first.
  entityStore.setState((state) => ({
    ...state,
    entities: Object.fromEntries(entities.map((entity) => [entity.entity_id, entity])),
    isConnected: connected,
    isInitialLoading: initialLoading,
    lastError: null,
    // Every derived field is written explicitly: `...state` would otherwise
    // carry a previous story's subscriptions and staleness into this one.
    subscribedEntities: new Set<string>(),
    staleEntities: new Set<string>(),
  }))

  // `dashboardActions.setMode` persists to localStorage; a story's mode is not
  // a user preference, so set the store field directly.
  dashboardStore.setState((state) => ({ ...state, mode }))
}

function resetStores() {
  // Timers, subscribers and cache together: the forecast service is a
  // module-level singleton, so a story's forecast would otherwise outlive it.
  weatherForecastService.reset()
  entityStore.setState((state) => ({
    ...state,
    entities: {},
    isConnected: false,
    isInitialLoading: true,
    lastError: null,
    subscribedEntities: new Set<string>(),
    staleEntities: new Set<string>(),
  }))
  dashboardStore.setState((state) => ({ ...state, mode: 'view' }))
}

function StoreSeed({ liebe, children }: { liebe: LiebeStoryParameters; children: ReactNode }) {
  // Seeding in a layout effect keeps the brief first render against the empty
  // store off-screen, and avoids mutating a store during React's render phase.
  useLayoutEffect(() => {
    seedStores(liebe)
    return resetStores
  }, [liebe])

  return <>{children}</>
}

/**
 * Seeds the entity and dashboard stores from the story's `liebe` parameter, so
 * cards read their state through the same hooks they use in the panel — no
 * card-side test props.
 */
export const withStoreSeed: Decorator = (Story, context) => (
  <StoreSeed liebe={readLiebeParameters(context.parameters)}>
    <Story />
  </StoreSeed>
)

/* ------------------------------------------------------------------ *
 * Service-call interception
 * ------------------------------------------------------------------ */

function ServiceCallHost({
  liebe,
  children,
}: {
  liebe: LiebeStoryParameters
  children: ReactNode
}) {
  const { entities, serviceCall, serviceCallError } = liebe

  const hass = useMemo(
    () =>
      createMockHass({
        entities,
        fail: serviceCall === 'error',
        failureMessage: serviceCallError,
      }),
    [entities, serviceCall, serviceCallError]
  )

  return <HomeAssistantProvider hass={hass}>{children}</HomeAssistantProvider>
}

/**
 * Supplies a network-free `hass` so service calls are logged as Storybook
 * actions instead of reaching a WebSocket.
 *
 * Note for error stories: `HassService` retries a failing call three times with
 * 1s/2s/4s backoff, so a card's error state appears roughly seven seconds after
 * the interaction — that is the panel's real behavior, not a workshop artifact.
 */
export const withServiceCalls: Decorator = (Story, context) => (
  <ServiceCallHost liebe={readLiebeParameters(context.parameters)}>
    <Story />
  </ServiceCallHost>
)

/* ------------------------------------------------------------------ *
 * Providers (theme + appearance toolbar)
 * ------------------------------------------------------------------ */

/**
 * Wraps every story in the panel's provider shell, driven by the toolbar the
 * way the panel is driven by its configuration: the provider stamps the
 * contract attributes (`data-liebe-theme`, `data-appearance`) on the theme root
 * and injects the selected theme's layer, so scoped theme rules have exactly
 * the hooks and the cascade they get in the panel.
 *
 * Single-appearance themes force their appearance, and the forced value is
 * written back into the toolbar global so the control shows what is actually
 * rendered instead of a choice the theme cannot honour.
 *
 * `useGlobals` is Storybook's own hook for reading and writing toolbar state,
 * and a decorator is where Storybook expects it — hence the rules-of-hooks
 * exemption below, which the react-hooks plugin cannot infer from the name.
 */
export const withProviders: Decorator = (Story) => {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [globals, updateGlobals] = useGlobals()

  const themeId = String(globals.theme ?? DEFAULT_THEME_ID)
  const theme = getTheme(themeId)
  const requested = (globals.appearance as ThemeAppearance | undefined) ?? 'dark'
  const appearance = resolveAppearance(theme, requested)

  // Syncing the toolbar is a side effect on Storybook's global state: doing it
  // inline would be a state update during render, which React warns about and
  // which can re-enter this decorator.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (appearance !== requested) {
      updateGlobals({ appearance })
    }
  }, [appearance, requested, updateGlobals])

  return (
    <LiebeThemeProvider themeId={themeId} appearance={appearance}>
      <div
        style={{
          background: 'var(--color-background)',
          color: 'var(--gray-12)',
          minHeight: '100vh',
          padding: 'var(--space-4)',
        }}
      >
        <Story />
      </div>
    </LiebeThemeProvider>
  )
}

/* ------------------------------------------------------------------ *
 * Placed-item context
 * ------------------------------------------------------------------ */

/**
 * Publishes a story's `itemConfig` the way the grid publishes a placed item's
 * stored options, so the universal options reach the card shell through their
 * real path. Stories that set nothing render inside an empty provider, which is
 * the same as no provider at all.
 */
export const withCardItem: Decorator = (Story, context) => {
  const { entityId } = context.args as { entityId?: string }
  const { itemConfig } = readLiebeParameters(context.parameters)

  return (
    <CardItemProvider entityId={entityId} config={itemConfig}>
      <Story />
    </CardItemProvider>
  )
}

/* ------------------------------------------------------------------ *
 * Grid cell
 * ------------------------------------------------------------------ */

export interface GridCellArgs {
  /** Column span, in grid columns. */
  gridWidth: number
  /** Row span, in grid rows. */
  gridHeight: number
}

export const gridCellArgTypes = {
  gridWidth: {
    name: 'grid width',
    description: 'Column span of the grid cell the card is rendered in',
    control: { type: 'range' as const, min: 1, max: gridConfig.desktop.columns, step: 1 },
    table: { category: 'Grid cell' },
  },
  gridHeight: {
    name: 'grid height',
    description: 'Row span of the grid cell the card is rendered in',
    control: { type: 'range' as const, min: 1, max: gridConfig.desktop.rows, step: 1 },
    table: { category: 'Grid cell' },
  },
}

/**
 * Cell geometry, mirroring `GridLayoutSection` + react-grid-layout: the row
 * height is `containerWidth / columns`, and a span of `n` covers `n` tracks
 * plus the `n - 1` gaps between them.
 */
export function gridCellSize(width: number, height: number) {
  const { columns, margin, containerPadding } = gridConfig.desktop
  const [gapX, gapY] = margin
  const rowHeight = Math.floor(STORY_CONTAINER_WIDTH / columns)
  const columnWidth =
    (STORY_CONTAINER_WIDTH - gapX * (columns - 1) - containerPadding[0] * 2) / columns

  return {
    width: width * columnWidth + (width - 1) * gapX,
    height: height * rowHeight + (height - 1) * gapY,
    gapX,
    gapY,
  }
}

/**
 * Renders a card story inside a fixed-size cell with real grid metrics, so
 * every layout tier is reachable from the `grid width`/`grid height` controls.
 */
export const withGridCell: Decorator = (Story, context) => {
  const { gridWidth = 2, gridHeight = 2 } = context.args as Partial<GridCellArgs>
  const { width, height, gapX } = gridCellSize(gridWidth, gridHeight)

  return (
    <div
      className="grid-item"
      style={
        {
          width,
          height,
          // The grid gap as a token so token-driven layout work can consume it
          // from the workshop exactly as it will from the panel.
          '--liebe-grid-gap': `${gapX}px`,
          display: 'grid',
        } as CSSProperties
      }
    >
      <Story />
    </div>
  )
}
