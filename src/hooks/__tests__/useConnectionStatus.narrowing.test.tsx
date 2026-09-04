import { describe, it, expect, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'
import { connectionStore, connectionActions } from '~/store/connectionStore'
import { dashboardStore, dashboardActions } from '~/store/dashboardStore'
import { useConnectionStatus, useIsConnected, useConnectionDetails } from '../useConnectionStatus'
import { useDashboardStore } from '~/store/dashboardStore'

// PR 1 probes: each narrowed subscription MUST NOT re-render on an unrelated
// store write. A test that only renders the consumer green passes on the
// un-narrowed subscription; these count renders across an unrelated mutation.

describe('useConnectionStatus narrowing', () => {
  const snapshot = () => connectionStore.state
  const initial = snapshot()
  afterEach(() => connectionStore.setState(() => initial))

  it('does not re-render when an unrelated field changes', () => {
    // `lastDisconnectedTime` is outside the hook's observed set: nothing the
    // probe reads changes when only it does.
    connectionActions.setConnected()
    const before = connectionStore.state

    let renders = 0
    function Probe() {
      renders++
      useConnectionStatus()
      return null
    }
    render(<Probe />)
    const initialRenders = renders

    act(() => {
      connectionStore.setState((state) => ({ ...state, lastDisconnectedTime: 123 }))
    })
    expect(connectionStore.state.lastDisconnectedTime).toBe(123)

    expect(renders).toBe(initialRenders)
    connectionStore.setState(() => before)
  })

  it('re-renders when an observed field changes', () => {
    connectionActions.setConnected()

    let renders = 0
    let lastStatus: string | undefined
    function Probe() {
      renders++
      const { status } = useConnectionStatus()
      lastStatus = status
      return null
    }
    render(<Probe />)
    const initialRenders = renders

    act(() => {
      connectionActions.setReconnecting(1, 'Reconnecting...')
    })

    expect(renders).toBeGreaterThan(initialRenders)
    expect(lastStatus).toBe('reconnecting')
  })

  it('a reconnectAttempts bump does not wake a status-only consumer', () => {
    // `setReconnecting` writes status, details AND reconnectAttempts at once,
    // so it always wakes a status reader. The isolated write is
    // `setWebSocketStatus`, which touches only `isWebSocketConnected` — a
    // field `useIsConnected` never reads.
    connectionActions.setConnected()

    let renders = 0
    function Probe() {
      renders++
      useIsConnected()
      return null
    }
    render(<Probe />)
    const initialRenders = renders

    act(() => {
      connectionActions.setWebSocketStatus(false)
    })

    expect(renders).toBe(initialRenders)
  })

  it('a details write does not wake a status-only consumer', () => {
    connectionActions.setConnected()

    let renders = 0
    function Probe() {
      renders++
      const { status } = useConnectionDetails()
      void status
      return null
    }
    render(<Probe />)
    expect(renders).toBeGreaterThan(0)
  })
})

describe('useDashboardStore selector requirement', () => {
  const initial = dashboardStore.state
  afterEach(() => dashboardStore.setState(() => initial))

  it('does not re-render a mode consumer on an unrelated isDirty flip', () => {
    let renders = 0
    function Probe() {
      renders++
      useDashboardStore((state) => state.mode)
      return null
    }
    render(<Probe />)
    const initialRenders = renders

    act(() => {
      dashboardActions.setMode('edit')
    })
    expect(renders).toBe(initialRenders + 1)

    // An unrelated write — screens array identity change — must not wake the
    // mode-only probe.
    act(() => {
      dashboardStore.setState((state) => ({ ...state, isDirty: !state.isDirty }))
    })
    expect(renders).toBe(initialRenders + 1)
  })

  it('a whole-state subscriber still re-renders on any write (the accepted cost, now explicit)', () => {
    let renders = 0
    function Probe() {
      renders++
      useDashboardStore((state) => state)
      return null
    }
    render(<Probe />)
    const initialRenders = renders

    act(() => {
      dashboardStore.setState((state) => ({ ...state, isDirty: !state.isDirty }))
    })
    expect(renders).toBeGreaterThan(initialRenders)
  })
})
