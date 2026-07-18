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
  const decodedFrames =
    quality?.totalVideoFrames ||
    extendedVideo.webkitDecodedFrameCount ||
    extendedVideo.mozDecodedFrames ||
    0
  const droppedFrames =
    quality?.droppedVideoFrames ||
    extendedVideo.webkitDroppedFrameCount ||
    (extendedVideo.mozParsedFrames && extendedVideo.mozDecodedFrames
      ? extendedVideo.mozParsedFrames - extendedVideo.mozDecodedFrames
      : 0) ||
    0
  return { decodedFrames, droppedFrames }
}
