import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import PresenceDot from './PresenceDot'
import { useAuthStore } from '../store/auth'

interface Member {
  userId: string
  user: { id: string; username: string }
}

interface Admin {
  userId: string
}

interface Room {
  ownerId: string | null
  admins: Admin[]
  members: Member[]
}

interface UserCard {
  id: string
  username: string
  status: string
  isFriend: boolean
  isBanned: boolean
  hasPendingRequest: boolean
}

export default function MembersPanel({ roomId }: { roomId: string }) {
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const userId = useAuthStore(s => s.user?.id)

  const { data: room } = useQuery<Room>({
    queryKey: ['room', roomId],
    queryFn: () => api.get(`/rooms/${roomId}`).then(r => r.data),
  })

  if (!room) return null

  const adminIds = new Set(room.admins.map(a => a.userId))
  const isAdmin = adminIds.has(userId!)

  return (
    <div className="w-52 bg-gray-900 border-l border-gray-700 overflow-y-auto shrink-0 relative">
      <div className="p-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Members ({room.members.length})</p>
        <div className="space-y-0.5">
          {room.members.map(m => (
            <button
              key={m.userId}
              onClick={() => setSelectedUser(m.userId === selectedUser ? null : m.userId)}
              className={`flex items-center gap-2 text-sm w-full text-left px-2 py-1.5 rounded transition-colors ${m.userId === selectedUser ? 'bg-gray-700' : 'hover:bg-gray-800'}`}
            >
              <PresenceDot userId={m.userId} />
              <span className="truncate flex-1">{m.user.username}</span>
              {m.userId === room.ownerId && <span className="text-yellow-500 text-xs shrink-0" title="Owner">👑</span>}
              {adminIds.has(m.userId) && m.userId !== room.ownerId && (
                <span className="text-blue-400 text-xs font-bold shrink-0" title="Admin">A</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {selectedUser && selectedUser !== userId && (
        <UserPopover
          userId={selectedUser}
          roomId={roomId}
          isAdmin={isAdmin}
          isOwner={room.ownerId === userId}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  )
}

function UserPopover({ userId, roomId, isAdmin, isOwner, onClose }: {
  userId: string
  roomId: string
  isAdmin: boolean
  isOwner: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [msg, setMsg] = useState('')

  const { data: user } = useQuery<UserCard>({
    queryKey: ['user', userId],
    queryFn: () => api.get(`/users/${userId}`).then(r => r.data),
  })

  const addFriend = useMutation({
    mutationFn: () => api.post('/friends/requests', { username: user?.username }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['user', userId] }); setMsg('Request sent!') },
    onError: (e: any) => setMsg(e.response?.data?.error || 'Failed'),
  })

  const banFromRoom = useMutation({
    mutationFn: () => api.post(`/rooms/${roomId}/bans`, { userId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['room', roomId] }); onClose() },
  })

  const statusColors: Record<string, string> = {
    online: 'text-green-400',
    afk: 'text-yellow-400',
    offline: 'text-gray-500',
  }

  if (!user) return null

  return (
    <div className="absolute left-0 right-0 mx-2 bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-xl z-10 text-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center font-bold">
            {user.username[0].toUpperCase()}
          </div>
          <div>
            <p className="font-semibold">{user.username}</p>
            <p className={`text-xs ${statusColors[user.status] ?? 'text-gray-500'}`}>{user.status}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white">×</button>
      </div>

      <div className="space-y-1.5 mt-3">
        {!user.isFriend && !user.isBanned && !user.hasPendingRequest && (
          <button
            onClick={() => addFriend.mutate()}
            className="w-full text-left text-blue-400 hover:text-blue-300 text-xs py-1"
          >
            + Add Friend
          </button>
        )}
        {user.hasPendingRequest && (
          <p className="text-xs text-gray-500">Friend request pending</p>
        )}
        {user.isFriend && (
          <p className="text-xs text-green-500">Already friends</p>
        )}
        {msg && <p className="text-xs text-yellow-400">{msg}</p>}

        {(isAdmin || isOwner) && (
          <button
            onClick={() => banFromRoom.mutate()}
            className="w-full text-left text-red-400 hover:text-red-300 text-xs py-1"
          >
            Ban from room
          </button>
        )}
      </div>
    </div>
  )
}
