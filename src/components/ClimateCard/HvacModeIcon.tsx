import { Text } from '@radix-ui/themes'

/**
 * The glyph for one HVAC mode.
 *
 * Lifted out of the mode buttons when they became anatomy pills: a `Pill` takes
 * its mark as an `icon` prop, and a ninety-line conditional inline in the card's
 * JSX was already the hardest part of this file to read. `currentColor`
 * throughout, so the pill's tint pattern colours them like every other anatomy
 * glyph.
 *
 * The final arm — the first two letters of the label — is the defensive
 * fallback for a mode with no glyph of its own. Do not delete it, and do not
 * narrow this export: the pill row's `if (!modeConfig) return null` guard drops
 * every mode outside `HVAC_MODES`, and each of that map's seven keys has an arm
 * above, so the fallback is unreachable through the card and is covered by a
 * direct unit test instead. It is what an eighth mode would render if one were
 * added to `HVAC_MODES` without a glyph.
 */
export function HvacModeIcon({ mode, label }: { mode: string; label: string }) {
  return mode === 'off' ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 8l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ) : mode === 'heat' ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M12 3C9 3 7 6 7 9c0 2.5 1 4.5 2.5 6S12 18 12 18s1-.5 2.5-1.5S17 11.5 17 9c0-3-2-6-5-6z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  ) : mode === 'cool' ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ) : mode === 'auto' ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="8"
        fill="currentColor"
        fontWeight="bold"
      >
        A
      </text>
    </svg>
  ) : mode === 'heat_cool' ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M12 3C9 3 7 6 7 9c0 2.5 1 4.5 2.5 6S12 18 12 18"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M12 2v20M12 12h10M14 7l7 7M21 7l-7 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ) : mode === 'dry' ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M12 3l-5 9h10L12 3zM7 14c0 2.8 2.2 5 5 5s5-2.2 5-5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : mode === 'fan_only' ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path
        d="M12 2c0 3-2 4-2 4s4-1 4 2-2 4-2 4 4-1 4 2-2 4-2 4 4-1 4 2M12 22c0-3-2-4-2-4s4 1 4-2-2-4-2-4 4 1 4-2-2-4-2-4 4 1 4-2"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  ) : (
    <Text size="2" weight="bold">
      {label.substring(0, 2)}
    </Text>
  )
}
