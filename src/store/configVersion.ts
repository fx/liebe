/**
 * The version-marker comparison every loader migration keyed on a config
 * version shares.
 *
 * Convention 7 of the common option contract (docs/specs/entity-cards/options/
 * common.md) requires a *version marker* rather than key absence to decide
 * whether a stored card predates an option: an absent key is exactly what a
 * newly added card carries, so pinning on absence rewrites new cards on their
 * first reload. Each option owns its own marker constant; the comparison is the
 * same one every time, so it lives here rather than being re-derived per
 * migration and drifting.
 */

/**
 * Whether a document's stored `version` is older than `marker`.
 *
 * Major and minor only — the patch component never gates a migration, and
 * comparing it would make a bugfix release look like a format change.
 *
 * A missing or unparseable version reads as *older*: documents predating any
 * marker are old by definition, and a hand-edited `version: "beta"` is a
 * document Liebe cannot date, where pinning an existing card to the control it
 * already renders is the harmless answer and skipping the pin silently changes
 * how a placed card is operated.
 */
export function configPredatesVersion(version: unknown, marker: string): boolean {
  if (typeof version !== 'string') return true

  const [major, minor] = version.split('.').map((part) => Number.parseInt(part, 10))
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return true

  const [markerMajor, markerMinor] = marker.split('.').map(Number)
  return major < markerMajor || (major === markerMajor && minor < markerMinor)
}
