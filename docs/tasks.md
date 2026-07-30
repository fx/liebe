# Tasks

Catch-all task list for work not tracked in a specific [change document](changes/).

## Backlog

- **Find a home for the five geometry assertions the story runner cannot evaluate.** `src/__tests__/stories.test.tsx`'s `BROWSER_ONLY` map lists them with reasons: `WeatherCard/ForecastsMaxCount`, `WeatherCard/ForecastsMaxCountOnMinimumWidthTile`, `SensorCard/GraphInFullSmallTile`, `SensorCard/GraphInFullLargeTile`, `Slider/DragToMaximum`. Each measures rendered boxes, jsdom lays nothing out, and the runner proves they cannot pass there — so they are enforced nowhere. The e2e suite is the only environment that can evaluate them; deciding whether they move there, or whether the same claims are better made against the panel's own layout, is the work. Recorded here rather than in a change document because it belongs to no spec change: [storybook](specs/storybook/index.md) already states the rule, and this is the residue it names.

## Completed
