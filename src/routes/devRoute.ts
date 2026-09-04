/**
 * Dev-only route resolution: development renders the workshop page, production
 * renders `NotFound` so the dev content never ships in the panel artifact.
 *
 * Pure in `dev`: `import.meta.env.DEV` is statically replaced per build, so
 * the branch is untestable in unit through the route module itself — this
 * helper takes the flag as an argument, making both arms directly callable.
 */
export function resolveDevRouteComponent<TDev, TProd>(
  dev: boolean,
  devPage: TDev,
  prodPage: TProd
): TDev | TProd {
  return dev ? devPage : prodPage
}
