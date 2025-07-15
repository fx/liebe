import type { CSSProperties } from 'react'

// Color type from Radix UI themes
type RadixColor =
  | 'gray'
  | 'gold'
  | 'bronze'
  | 'brown'
  | 'yellow'
  | 'amber'
  | 'orange'
  | 'tomato'
  | 'red'
  | 'ruby'
  | 'crimson'
  | 'pink'
  | 'plum'
  | 'purple'
  | 'violet'
  | 'iris'
  | 'indigo'
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'jade'
  | 'green'
  | 'grass'
  | 'lime'
  | 'mint'
  | 'sky'

interface WeatherTextStyles {
  text: CSSProperties
  icon: CSSProperties
}

/**
 * Get consistent text styling for weather cards with background images
 * @param hasBackground - Whether the card has a background image
 * @param variant - The style variant (default, emphasis)
 */
export function getWeatherTextStyles(
  hasBackground: boolean,
  variant: 'default' | 'emphasis' = 'default'
): WeatherTextStyles {
  if (!hasBackground) {
    return {
      text: {},
      icon: {},
    }
  }

  const baseTextStyle: CSSProperties = {
    color: 'white',
    textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.4)',
  }

  const emphasisTextStyle: CSSProperties = {
    color: 'white',
    textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.5)',
  }

  const iconStyle: CSSProperties = {
    color: 'white',
    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))',
  }

  return {
    text: variant === 'emphasis' ? emphasisTextStyle : baseTextStyle,
    icon: iconStyle,
  }
}

/**
 * Get text color prop for Radix UI Text components
 * @param hasBackground - Whether the card has a background image
 * @param defaultColor - The default color when no background
 */
export function getWeatherTextColor(
  hasBackground: boolean,
  defaultColor: RadixColor | undefined = undefined
): RadixColor | undefined {
  return hasBackground ? undefined : defaultColor
}
