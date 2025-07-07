import { getIcon } from './iconList'

/**
 * Get a Tabler icon component by name
 * @param iconName The name of the icon
 * @returns The icon component or undefined if not found
 */
export function getTablerIcon(
  iconName: string
): React.ComponentType<{ size?: number }> | undefined {
  return getIcon(iconName)
}
