import { Spinner } from '@radix-ui/themes'
import {
  EnterFullScreenIcon,
  SpeakerLoudIcon,
  SpeakerOffIcon,
  ExclamationTriangleIcon,
} from '@radix-ui/react-icons'
import '../CameraCard.css'

interface CameraAttributes {
  access_token?: string
  entity_picture?: string
  frontend_stream_type?: string
  friendly_name?: string
  supported_features?: number
}

export interface CameraControlsProps {
  friendlyName: string
  entity: { state: string; attributes: CameraAttributes }
  streamError: string | null
  isRecording: boolean
  isStreaming: boolean
  isIdle: boolean
  supportsStream: boolean
  isEditMode: boolean
  isMuted: boolean
  isReconnecting: boolean
  hasFrameWarning: boolean
  handleToggleMute: (e: React.MouseEvent) => void
  handleVideoFullscreen: (e: React.MouseEvent) => void
  size: 'small' | 'medium' | 'large'
  isFullscreen?: boolean
}

// Custom-styled camera controls for both regular and fullscreen views
export function CameraControls({
  friendlyName,
  entity,
  streamError,
  isRecording,
  isStreaming,
  isIdle,
  supportsStream,
  isEditMode,
  isMuted,
  isReconnecting,
  hasFrameWarning,
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
            color: streamError ? '#ff6b6b' : isRecording || isStreaming ? '#4dabf7' : '#868e96',
            fontSize: '0.8em',
            lineHeight: 1.2,
            textTransform: 'uppercase',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: `${0.4 * scaleFactor}em`,
          }}
        >
          {isReconnecting || (supportsStream && !isStreaming && !streamError) ? (
            <Spinner size="1" />
          ) : hasFrameWarning && !streamError ? (
            <ExclamationTriangleIcon style={{ color: '#f59e0b', width: '1em', height: '1em' }} />
          ) : (isRecording || isStreaming) && !streamError ? (
            <span className="recording-dot" />
          ) : null}
          {streamError
            ? 'ERROR'
            : isReconnecting || (supportsStream && !isStreaming && !streamError)
              ? 'CONNECTING'
              : hasFrameWarning
                ? 'NO SIGNAL'
                : supportsStream && isStreaming && (isRecording || entity.state === 'streaming')
                  ? 'RECORDING'
                  : supportsStream && isStreaming
                    ? 'STREAMING'
                    : isIdle
                      ? 'IDLE'
                      : entity.state.toUpperCase()}
        </div>
      </div>

      {/* Control buttons */}
      {supportsStream && isStreaming && !streamError && !isEditMode && (
        <div style={{ display: 'flex', gap: `${0.4 * scaleFactor}em` }}>
          <button
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
            style={{
              width: '2.5em',
              height: '2.5em',
              borderRadius: '0.5em',
              border: 'none',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
              padding: 0,
              fontSize: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
            }}
          >
            {isMuted ? (
              <SpeakerOffIcon style={{ width: '55%', height: '55%' }} />
            ) : (
              <SpeakerLoudIcon style={{ width: '55%', height: '55%' }} />
            )}
          </button>
          <button
            onClick={handleVideoFullscreen}
            title="Toggle native fullscreen"
            style={{
              width: '2.5em',
              height: '2.5em',
              borderRadius: '0.5em',
              border: 'none',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
              padding: 0,
              fontSize: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
            }}
          >
            <EnterFullScreenIcon style={{ width: '55%', height: '55%' }} />
          </button>
        </div>
      )}
    </div>
  )
}
