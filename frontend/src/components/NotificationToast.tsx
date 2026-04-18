import { useEffect, useState } from 'react'
import { getSocket } from '../lib/socket'
import { useQueryClient } from '@tanstack/react-query'

interface Toast {
  id: number
  message: string
  type: 'info' | 'success' | 'error'
}

let toastId = 0

export default function NotificationToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const qc = useQueryClient()

  function addToast(message: string, type: Toast['type'] = 'info') {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }

  useEffect(() => {
    const socket = getSocket()

    socket.on('room_invitation', ({ roomName, invitedBy }: { roomName: string; invitedBy: string }) => {
      addToast(`${invitedBy} invited you to #${roomName}`, 'info')
      qc.invalidateQueries({ queryKey: ['room-invitations'] })
    })

    socket.on('friend_request', ({ username }: { username: string }) => {
      addToast(`${username} sent you a friend request`, 'info')
      qc.invalidateQueries({ queryKey: ['friend-requests'] })
    })

    return () => {
      socket.off('room_invitation')
      socket.off('friend_request')
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-xl shadow-2xl text-sm max-w-xs pointer-events-auto border
            ${t.type === 'error' ? 'bg-[#2d1111] border-red-800 text-red-300' : t.type === 'success' ? 'bg-[#112d1b] border-green-800 text-green-300' : 'bg-[#2b2d31] border-[#3f4248] text-[#dce0e8]'}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
