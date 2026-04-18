import { useEffect } from 'react'
import { useUnreadStore } from '../store/unread'

export function useDocumentTitle() {
  const counts = useUnreadStore(s => s.counts)
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)

  useEffect(() => {
    document.title = total > 0 ? `(${total}) DAMessenger` : 'DAMessenger'
  }, [total])
}
