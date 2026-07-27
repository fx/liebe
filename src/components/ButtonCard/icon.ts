/**
 * Which glyph the switch/fallback card shows, before the universal `icon`
 * override the shell applies on top of it.
 *
 * Pure and domain-gated on purpose (docs/changes/0022 — "Domain gating at the
 * icon-resolution helper"): the `device_class` lookup is physically inside the
 * `switch` branch, so the fallback path — this same card rendering an arbitrary
 * unmapped domain — structurally cannot consult a foreign domain's
 * `device_class`, whose meaning is domain-specific and which the card has no
 * mapping for. A `device_class: outlet` on some future domain must not silently
 * acquire the plug glyph.
 */

/** The glyphs the card can render, resolved by name so this stays pure. */
export type SwitchIconName = 'outlet' | 'power' | 'light' | 'boolean' | 'generic'

/**
 * `device_class` values the `switch` domain actually publishes. Anything else —
 * including a value some other domain uses — falls through to the domain
 * default rather than guessing.
 */
const SWITCH_DEVICE_CLASS_ICONS: Readonly<Record<string, SwitchIconName>> = {
  outlet: 'outlet',
  switch: 'power',
}

export function resolveSwitchIconName(
  domain: string,
  attributes: { device_class?: unknown } | undefined,
  deviceClassIcon: boolean
): SwitchIconName {
  if (domain === 'switch') {
    if (deviceClassIcon) {
      const deviceClass = attributes?.device_class
      if (typeof deviceClass === 'string' && deviceClass in SWITCH_DEVICE_CLASS_ICONS) {
        return SWITCH_DEVICE_CLASS_ICONS[deviceClass]
      }
    }
    // The domain default, which is also where `deviceClassIcon: false` lands:
    // the option turns the lookup off, it does not turn the card generic.
    return 'power'
  }

  if (domain === 'light') return 'light'
  if (domain === 'input_boolean') return 'boolean'

  return 'generic'
}
