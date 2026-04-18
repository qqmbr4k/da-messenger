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
    <div className="border-t border-gray-700 p-2">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1 px-1">
        Invitations ({invitations.length})
      </p>
      {invitations.map(inv => (
        <div key={inv.id} className="flex items-center gap-1 text-xs px-1 py-1">
          <span className="truncate flex-1 text-gray-300">#{inv.room.name}</span>
          <button
            onClick={() => accept.mutate(inv.roomId)}
            className="text-green-400 hover:text-green-300 shrink-0"
          >
            Join
          </button>
        </div>
      ))}
    </div>
  )
}
