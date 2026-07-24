// Cross-browser access to a <video>'s decode statistics. Prefers the standard
// getVideoPlaybackQuality API with legacy webkit/moz counters as fallbacks.
// Shared by CameraStats (display) and useCameraStreamStatus (frame watchdog).

export interface PlaybackQuality {
  decodedFrames: number
  droppedFrames: number
}

type ExtendedVideo = HTMLVideoElement & {
  getVideoPlaybackQuality?: () => { totalVideoFrames?: number; droppedVideoFrames?: number }
  webkitDecodedFrameCount?: number
  webkitDroppedFrameCount?: number
  mozDecodedFrames?: number
  mozParsedFrames?: number
}

export function getPlaybackQuality(video: HTMLVideoElement): PlaybackQuality {
  const extendedVideo = video as ExtendedVideo
  const quality = extendedVideo.getVideoPlaybackQuality?.()
  const { webkitDecodedFrameCount, webkitDroppedFrameCount, mozDecodedFrames, mozParsedFrames } =
    extendedVideo
  // Nullish (??) chains, not ||: a REPORTED zero counter is a valid value
  // (nothing decoded/dropped yet) and must not fall through to a legacy
  // counter from a different accounting scheme.
  const decodedFrames =
    quality?.totalVideoFrames ?? webkitDecodedFrameCount ?? mozDecodedFrames ?? 0
  const droppedFrames =
    quality?.droppedVideoFrames ??
    webkitDroppedFrameCount ??
    // Mozilla legacy: dropped = parsed - decoded, computable only when BOTH
    // counters are present (zero included — undefined alone means the
    // counter is unavailable and the result stays 0).
    (mozParsedFrames !== undefined && mozDecodedFrames !== undefined
      ? mozParsedFrames - mozDecodedFrames
      : 0)
  return { decodedFrames, droppedFrames }
}
