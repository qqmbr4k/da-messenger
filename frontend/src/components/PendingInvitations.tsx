import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

interface Invitation {
  id: string
  roomId: string
  room: { id: string; name: string; description: string }
  invitedBy: { id: string; username: string }
}

interface Props {
  onAccept: (roomId: string) => void
}

const FRIENDLY_ERRORS: Record<number, string> = {
  403: "You've been banned from this room.",
  404: "This invitation is no longer valid.",
}

export default function PendingInvitations({ onAccept }: Props) {
  const qc = useQueryClient()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const { data: invitations = [] } = useQuery<Invitation[]>({
    queryKey: ['room-invitations'],
    queryFn: () => api.get('/rooms/invitations/pending').then(r => r.data),
    refetchInterval: 60_000,
  })

  const accept = useMutation({
    mutationFn: (roomId: string) => api.post(`/rooms/${roomId}/invitations/accept`),
    onSuccess: (_, roomId) => {
      qc.invalidateQueries({ queryKey: ['room-invitations'] })
      qc.invalidateQueries({ queryKey: ['my-rooms'] })
      onAccept(roomId)
    },
    onError: (err: any, roomId) => {
      const status: number = err?.response?.status ?? 0
      const msg = FRIENDLY_ERRORS[status] ?? 'Could not join — please try again.'
      setErrors(prev => ({ ...prev, [roomId]: msg }))
      // Auto-dismiss stale invitations after showing the message
      if (status === 404 || status === 403) {
        setTimeout(() => setDismissed(prev => new Set([...prev, roomId])), 3000)
        qc.invalidateQueries({ queryKey: ['room-invitations'] })
      }
    },
  })

  const visible = invitations.filter(inv => !dismissed.has(inv.roomId))
  if (visible.length === 0 && Object.keys(errors).length === 0) return null

  return (
    <div className="border-t border-[#2a2b2e] px-3 py-2 shrink-0">
      <p className="text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-1.5">
        Invitations ({visible.length})
      </p>
      {visible.map(inv => (
        <div key={inv.id} className="text-sm px-1 py-1 rounded-lg">
          <div className="flex items-center gap-2 hover:bg-[#2b2d31] rounded-lg px-1">
            <span className="text-[#6b6f78] shrink-0">#</span>
            <span className="truncate flex-1 text-[#dce0e8]">{inv.room.name}</span>
            <span className="text-[#6b6f78] text-[11px] shrink-0">from {inv.invitedBy.username}</span>
            <button
              onClick={() => { setErrors(prev => { const n = { ...prev }; delete n[inv.roomId]; return n }); accept.mutate(inv.roomId) }}
              disabled={accept.isPending}
              className="text-[#23a55a] hover:text-green-300 shrink-0 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Join
            </button>
            <button
              onClick={() => setDismissed(prev => new Set([...prev, inv.roomId]))}
              className="text-[#6b6f78] hover:text-white shrink-0 text-xs leading-none"
              title="Dismiss"
            >
              ×
            </button>
          </div>
          {errors[inv.roomId] && (
            <p className="text-yellow-400 text-[11px] px-2 pt-0.5">{errors[inv.roomId]}</p>
          )}
        </div>
      ))}
    </div>
  )
}
