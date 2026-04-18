import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

interface Room {
  id: string
  name: string
  description: string
  _count: { members: number }
}

interface Props {
  onJoin: (id: string) => void
}

export default function RoomCatalog({ onJoin }: Props) {
  const [search, setSearch] = useState('')
  const qc = useQueryClient()

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ['public-rooms', search],
    queryFn: () => api.get('/rooms', { params: { search } }).then(r => r.data),
  })

  const joinMutation = useMutation({
    mutationFn: (roomId: string) => api.post(`/rooms/${roomId}/join`),
    onSuccess: (_, roomId) => {
      qc.invalidateQueries({ queryKey: ['my-rooms'] })
      onJoin(roomId)
    },
  })

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Public Rooms</h1>
      <input
        placeholder="Search rooms..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-gray-700 rounded px-3 py-2 text-sm mb-4 outline-none focus:ring-1 focus:ring-blue-500"
      />
      <div className="space-y-2">
        {rooms.map(room => (
          <div key={room.id} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold"># {room.name}</p>
              <p className="text-sm text-gray-400">{room.description || 'No description'}</p>
              <p className="text-xs text-gray-500 mt-1">{room._count.members} members</p>
            </div>
            <button
              onClick={() => joinMutation.mutate(room.id)}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm"
            >
              Join
            </button>
          </div>
        ))}
        {rooms.length === 0 && <p className="text-gray-500 text-sm">No rooms found.</p>}
      </div>
    </div>
  )
}
