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

export default function PendingInvitations({ onAccept }: Props) {
  const qc = useQueryClient()

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
  })

  if (invitations.length === 0) return null

  return (
    <div className="border-t border-[#2a2b2e] px-3 py-2 shrink-0">
      <p className="text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-1.5">
        Invitations ({invitations.length})
      </p>
      {invitations.map(inv => (
        <div key={inv.id} className="flex items-center gap-2 text-sm px-1 py-1 rounded-lg hover:bg-[#2b2d31]">
          <span className="text-[#6b6f78] shrink-0">#</span>
          <span className="truncate flex-1 text-[#dce0e8]">{inv.room.name}</span>
          <button
            onClick={() => accept.mutate(inv.roomId)}
            className="text-[#23a55a] hover:text-green-300 shrink-0 text-xs font-semibold transition-colors"
          >
            Join
          </button>
        </div>
      ))}
    </div>
  )
}
