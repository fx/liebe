import { describe, it, expect } from 'vitest'
import { getPlaybackQuality } from '../videoQuality'

// The function only reads (optional) properties, so bare objects suffice.
function video(shape: Record<string, unknown>): HTMLVideoElement {
  return shape as unknown as HTMLVideoElement
}

describe('getPlaybackQuality', () => {
  it('prefers the standard getVideoPlaybackQuality counters', () => {
    const quality = getPlaybackQuality(
      video({
        getVideoPlaybackQuality: () => ({ totalVideoFrames: 120, droppedVideoFrames: 3 }),
        // Legacy counters present but must be ignored.
        webkitDecodedFrameCount: 999,
        webkitDroppedFrameCount: 999,
      })
    )
    expect(quality).toEqual({ decodedFrames: 120, droppedFrames: 3 })
  })

  it('keeps reported zero counters instead of falling through to legacy values', () => {
    const quality = getPlaybackQuality(
      video({
        getVideoPlaybackQuality: () => ({ totalVideoFrames: 0, droppedVideoFrames: 0 }),
        webkitDecodedFrameCount: 999,
        webkitDroppedFrameCount: 999,
        mozDecodedFrames: 999,
        mozParsedFrames: 999,
      })
    )
    expect(quality).toEqual({ decodedFrames: 0, droppedFrames: 0 })
  })

  it('falls back to webkit counters when the standard API is absent', () => {
    const quality = getPlaybackQuality(
      video({ webkitDecodedFrameCount: 60, webkitDroppedFrameCount: 2 })
    )
    expect(quality).toEqual({ decodedFrames: 60, droppedFrames: 2 })
  })

  it('keeps a reported zero webkit counter', () => {
    const quality = getPlaybackQuality(
      video({
        webkitDecodedFrameCount: 0,
        webkitDroppedFrameCount: 0,
        mozDecodedFrames: 999,
        mozParsedFrames: 999,
      })
    )
    expect(quality).toEqual({ decodedFrames: 0, droppedFrames: 0 })
  })

  it('computes mozilla dropped frames as parsed minus decoded', () => {
    const quality = getPlaybackQuality(video({ mozDecodedFrames: 50, mozParsedFrames: 55 }))
    expect(quality).toEqual({ decodedFrames: 50, droppedFrames: 5 })
  })

  it('computes mozilla dropped frames when decoded is a valid zero', () => {
    const quality = getPlaybackQuality(video({ mozDecodedFrames: 0, mozParsedFrames: 4 }))
    expect(quality).toEqual({ decodedFrames: 0, droppedFrames: 4 })
  })

  it('reports zero dropped frames when either mozilla counter is unavailable', () => {
    expect(getPlaybackQuality(video({ mozDecodedFrames: 10 }))).toEqual({
      decodedFrames: 10,
      droppedFrames: 0,
    })
    expect(getPlaybackQuality(video({ mozParsedFrames: 10 }))).toEqual({
      decodedFrames: 0,
      droppedFrames: 0,
    })
  })

  it('reports zeros when no counter source exists at all', () => {
    expect(getPlaybackQuality(video({}))).toEqual({ decodedFrames: 0, droppedFrames: 0 })
    // An empty standard quality report also falls through to zeros.
    expect(getPlaybackQuality(video({ getVideoPlaybackQuality: () => ({}) }))).toEqual({
      decodedFrames: 0,
      droppedFrames: 0,
    })
  })
})
