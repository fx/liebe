/**
 * Whether a stored document predates a migration marker.
 *
 * Legacy pinning discriminates by a **configuration version cutoff, never by
 * key absence** (docs/specs/entity-cards/options/common.md, convention 7): a
 * newly added card legitimately leaves an option key absent, so an
 * absence-triggered rewrite would pin new cards on their first reload — the
 * failure the convention exists to prevent.
 *
 * There is one comparison rather than one per migration because two copies of
 * it would have to agree forever: the loader decides *both* whether to pin and
 * whether to stamp the version from these answers, and a drift between two
 * hand-written parsers shows up as a document that is pinned and then pinned
 * again, or stamped and never pinned at all.
 */

/**
 * `true` when `version` is older than `marker`, compared on major then minor.
 *
 * A missing or unparseable version reads as older. Documents predating the
 * field are old by definition, and pinning an old card to the control it
 * already had is harmless — while failing to pin one silently changes how a
 * placed card is operated, which is the asymmetry the whole convention turns on.
 */
export function configPredatesVersion(version: unknown, marker: string): boolean {
  if (typeof version !== 'string') return true

  const [major, minor] = version.split('.').map((part) => Number.parseInt(part, 10))
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return true

  const [markerMajor, markerMinor] = marker.split('.').map(Number)
  return major < markerMajor || (major === markerMajor && minor < markerMinor)
}
