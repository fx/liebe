import { Spinner } from '@radix-ui/themes'
import type { ReactNode } from 'react'
import {
  EnterFullScreenIcon,
  SpeakerLoudIcon,
  SpeakerOffIcon,
  ExclamationTriangleIcon,
} from '@radix-ui/react-icons'
import './CameraCard.css'

// Single status enum for the pill, derived once in the card (see
// deriveCameraStatus in index.tsx). Label, icon, and color all map from this
// value, so they can never disagree.
export type CameraStatus =
  | 'error'
  | 'connecting'
  | 'no-signal'
  | 'recording'
  | 'streaming'
  | 'idle'
  | 'raw'

const STATUS_LABELS: Record<Exclude<CameraStatus, 'raw'>, string> = {
  error: 'ERROR',
  connecting: 'CONNECTING',
  'no-signal': 'NO SIGNAL',
  recording: 'RECORDING',
  streaming: 'STREAMING',
  idle: 'IDLE',
}

// Radix theme color tokens (not fixed hex values) so the pill follows the
// active theme's palette.
function statusColor(status: CameraStatus): string {
  if (status === 'error') return 'var(--red-9)'
  if (status === 'recording' || status === 'streaming' || status === 'no-signal') {
    return 'var(--blue-9)'
  }
  return 'var(--gray-9)'
}

function StatusIcon({ status }: { status: CameraStatus }) {
  if (status === 'connecting') return <Spinner size="1" />
  if (status === 'no-signal') {
    return (
      <ExclamationTriangleIcon style={{ color: 'var(--amber-9)', width: '1em', height: '1em' }} />
    )
  }
  if (status === 'recording' || status === 'streaming') return <span className="recording-dot" />
  return null
}

function ControlButton({
  onClick,
  title,
  children,
}: {
  onClick: (e: React.MouseEvent) => void
  title: string
  children: ReactNode
}) {
  return (
    <button type="button" onClick={onClick} title={title} className="camera-control-button">
      {children}
    </button>
  )
}

export interface CameraControlsProps {
  friendlyName: string
  status: CameraStatus
  /** Raw entity state; uppercased as the label for the 'raw' status. */
  rawState: string
  /** Whether the mute/fullscreen buttons render (active stream outside edit mode). */
  showControls: boolean
  isMuted: boolean
  handleToggleMute: (e: React.MouseEvent) => void
  handleVideoFullscreen: (e: React.MouseEvent) => void
  size: 'small' | 'medium' | 'large'
  isFullscreen?: boolean
}

// Custom-styled camera controls for both regular and fullscreen views
export function CameraControls({
  friendlyName,
  status,
  rawState,
  showControls,
  isMuted,
  handleToggleMute,
  handleVideoFullscreen,
  size,
  isFullscreen = false,
}: CameraControlsProps) {
  // Base scale factor for different sizes
  const scaleFactor = size === 'small' ? 0.64 : size === 'large' ? 0.96 : 0.8

  return (
    <div
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderRadius: `${0.6 * scaleFactor}em`,
        padding: `${0.3 * scaleFactor}em ${0.5 * scaleFactor}em`,
        backdropFilter: 'blur(8px)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${0.64 * scaleFactor}em`,
        fontSize: isFullscreen ? 'inherit' : `${scaleFactor}em`,
      }}
    >
      {/* Entity info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${0.08 * scaleFactor}em` }}>
        <div
          style={{
            color: 'white',
            fontSize: '1em',
            fontWeight: 600,
            lineHeight: 1.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {friendlyName}
        </div>
        <div
          style={{
            color: statusColor(status),
            fontSize: '0.8em',
            lineHeight: 1.2,
            textTransform: 'uppercase',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: `${0.4 * scaleFactor}em`,
          }}
        >
          <StatusIcon status={status} />
          {status === 'raw' ? rawState.toUpperCase() : STATUS_LABELS[status]}
        </div>
      </div>

      {/* Control buttons */}
      {showControls && (
        <div style={{ display: 'flex', gap: `${0.4 * scaleFactor}em` }}>
          <ControlButton onClick={handleToggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
            {isMuted ? (
              <SpeakerOffIcon style={{ width: '55%', height: '55%' }} />
            ) : (
              <SpeakerLoudIcon style={{ width: '55%', height: '55%' }} />
            )}
          </ControlButton>
          <ControlButton onClick={handleVideoFullscreen} title="Toggle native fullscreen">
            <EnterFullScreenIcon style={{ width: '55%', height: '55%' }} />
          </ControlButton>
        </div>
      )}
    </div>
  )
}
