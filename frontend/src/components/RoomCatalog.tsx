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
    <div className="flex-1 overflow-y-auto p-6 bg-[#313338]">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-white mb-1">Browse Rooms</h1>
        <p className="text-[#949ba4] text-sm mb-5">Find a room to join or explore what's happening.</p>
        <div className="relative mb-5">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b6f78]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            placeholder="Search public rooms..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#383a40] border border-[#4a4d55] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#dce0e8] placeholder-[#6b6f78] outline-none focus:border-[#5865f2] transition-colors"
          />
        </div>
        <div className="space-y-2">
          {rooms.map(room => (
            <div key={room.id} className="bg-[#2b2d31] border border-[#3f4248] rounded-xl p-4 flex items-center gap-4 hover:border-[#565b66] transition-colors">
              <div className="w-12 h-12 rounded-xl bg-[#383a40] flex items-center justify-center text-2xl shrink-0 font-bold text-[#5865f2]">
                #
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white"># {room.name}</p>
                <p className="text-sm text-[#949ba4] truncate mt-0.5">{room.description || 'No description'}</p>
                <p className="text-xs text-[#6b6f78] mt-1">{room._count.members} member{room._count.members !== 1 ? 's' : ''}</p>
              </div>
              <button
                onClick={() => joinMutation.mutate(room.id)}
                className="bg-[#5865f2] hover:bg-[#4752c4] text-white px-4 py-2 rounded-lg text-sm font-semibold shrink-0 transition-colors"
              >
                Join
              </button>
            </div>
          ))}
          {rooms.length === 0 && (
            <div className="text-center py-12 text-[#6b6f78]">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-sm">No rooms found{search ? ` for "${search}"` : ''}.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
