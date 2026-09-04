import {
  IconHome,
  IconBulb,
  IconBulbOff,
  IconDoor,
  IconDoorOff,
  IconLock,
  IconLockOpen,
  IconBell,
  IconBellOff,
  IconTemperature,
  IconDroplet,
  IconDropletOff,
  IconWind,
  IconFlame,
  IconFlameOff,
  IconShieldCheck,
  IconVolume,
  IconVolumeOff,
  IconSun,
  IconMoon,
  IconWalk,
  IconUser,
  IconUserOff,
  IconPower,
  IconCircleX,
  IconWifi,
  IconWifiOff,
  IconCircleCheck,
  IconCircle,
  IconAlertTriangle,
  IconInfoCircle,
  IconEye,
  IconEyeOff,
  IconBattery,
} from '@tabler/icons-react'

export interface Icon {
  name: string
  displayName: string
  component: React.ComponentType<{ size?: number }>
  category: 'general' | 'lighting' | 'security' | 'climate' | 'media' | 'sensors' | 'status'
}

export const ICONS: Icon[] = [
  // General
  { name: 'Home', displayName: 'Home', component: IconHome, category: 'general' },
  { name: 'Power', displayName: 'Power On', component: IconPower, category: 'general' },
  { name: 'PowerOff', displayName: 'Power Off', component: IconCircleX, category: 'general' },
  { name: 'CircleCheck', displayName: 'On', component: IconCircleCheck, category: 'status' },
  { name: 'Circle', displayName: 'Off', component: IconCircle, category: 'status' },

  // Lighting
  { name: 'Bulb', displayName: 'Light On', component: IconBulb, category: 'lighting' },
  { name: 'BulbOff', displayName: 'Light Off', component: IconBulbOff, category: 'lighting' },
  { name: 'Sun', displayName: 'Day', component: IconSun, category: 'lighting' },
  { name: 'Moon', displayName: 'Night', component: IconMoon, category: 'lighting' },

  // Security
  { name: 'Door', displayName: 'Door Closed', component: IconDoor, category: 'security' },
  { name: 'DoorOff', displayName: 'Door Open', component: IconDoorOff, category: 'security' },
  { name: 'Lock', displayName: 'Locked', component: IconLock, category: 'security' },
  { name: 'LockOpen', displayName: 'Unlocked', component: IconLockOpen, category: 'security' },
  { name: 'ShieldCheck', displayName: 'Armed', component: IconShieldCheck, category: 'security' },
  // Removed in change 0044 (compat note): 'Shield', 'DeviceTv', 'DeviceTvOff',
  // 'Clock', 'Calendar' and 'BatteryOff' used to resolve here. A persisted
  // `display.icon` override naming one now resolves to `undefined` via
  // `getIcon` — which every caller already treats as "no override" (GridCard
  // falls back to the card's own glyph per the dashboard-config Forward
  // Compatibility contract), so no migration was written: the tile keeps its
  // glyph instead of the chosen icon. Re-adding a name here restores it.
  { name: 'Bell', displayName: 'Bell On', component: IconBell, category: 'security' },
  { name: 'BellOff', displayName: 'Bell Off', component: IconBellOff, category: 'security' },

  // Climate & Environment
  {
    name: 'Temperature',
    displayName: 'Temperature',
    component: IconTemperature,
    category: 'climate',
  },
  { name: 'Droplet', displayName: 'Wet', component: IconDroplet, category: 'climate' },
  { name: 'DropletOff', displayName: 'Dry', component: IconDropletOff, category: 'climate' },
  { name: 'Wind', displayName: 'Fan/Wind', component: IconWind, category: 'climate' },
  { name: 'Flame', displayName: 'Heat On', component: IconFlame, category: 'climate' },
  { name: 'FlameOff', displayName: 'Heat Off', component: IconFlameOff, category: 'climate' },

  // Media & Devices
  { name: 'Volume', displayName: 'Sound On', component: IconVolume, category: 'media' },
  { name: 'VolumeOff', displayName: 'Sound Off', component: IconVolumeOff, category: 'media' },
  { name: 'Wifi', displayName: 'Connected', component: IconWifi, category: 'media' },
  { name: 'WifiOff', displayName: 'Disconnected', component: IconWifiOff, category: 'media' },

  // Sensors & Status
  { name: 'MotionSensor', displayName: 'Motion', component: IconWalk, category: 'sensors' },
  { name: 'User', displayName: 'Presence', component: IconUser, category: 'sensors' },
  { name: 'UserOff', displayName: 'No Presence', component: IconUserOff, category: 'sensors' },
  { name: 'Eye', displayName: 'Visible', component: IconEye, category: 'sensors' },
  { name: 'EyeOff', displayName: 'Hidden', component: IconEyeOff, category: 'sensors' },
  {
    name: 'AlertTriangle',
    displayName: 'Warning',
    component: IconAlertTriangle,
    category: 'status',
  },
  { name: 'InfoCircle', displayName: 'Info', component: IconInfoCircle, category: 'status' },
  { name: 'Battery', displayName: 'Battery', component: IconBattery, category: 'status' },
]

/**
 * Get an icon component by name from the curated list
 */
export function getIcon(iconName: string): React.ComponentType<{ size?: number }> | undefined {
  const icon = ICONS.find((i) => i.name === iconName)
  return icon?.component
}
