import { useEffect, useRef } from 'react'
import { getSocket } from '../lib/socket'

/**
 * Sends a 'heartbeat' socket event when the user has been active within
 * the last 1.5 seconds. Handles:
 *   - Tab hibernation: Page Visibility API stops heartbeats when hidden,
 *     and re-syncs when the tab becomes visible again.
 *   - Cursor throttle: only emits if the cursor moved in the last 1.5s,
 *     not on every mousemove — avoids flooding the server.
 */
export function useActivityHeartbeat(onVisible?: () => void) {
  const lastMoveRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const socket = getSocket()

    function onMove() {
      lastMoveRef.current = Date.now()
    }

    function tick() {
      // Only send heartbeat if cursor moved in the last 1.5 seconds
      // AND the tab is currently visible (not hibernated)
      if (document.visibilityState === 'visible' && Date.now() - lastMoveRef.current < 1500) {
        socket.emit('heartbeat')
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // Tab woke up — re-sync immediately and notify caller
        socket.emit('heartbeat')
        onVisible?.()
      }
      // No "gone offline" signal on hidden: the tab may be hibernated
      // and JS is frozen so we can't send anything anyway.
      // The server detects offline only via socket disconnect.
    }

    // Throttle: check every 1s whether cursor moved recently
    intervalRef.current = setInterval(tick, 1000)

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('keydown', onMove, { passive: true })
    window.addEventListener('touchstart', onMove, { passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('keydown', onMove)
      window.removeEventListener('touchstart', onMove)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [onVisible])
}
