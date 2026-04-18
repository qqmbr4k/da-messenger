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
    <div className="flex-1 overflow-y-auto bg-[#2b2d31] relative">
      <div className="p-4">
        <p className="text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-3">
          Members — {room.members.length}
        </p>
        <div className="space-y-0.5">
          {room.members.map(m => (
            <button
              key={m.userId}
              onClick={() => setSelectedUser(m.userId === selectedUser ? null : m.userId)}
              className={`flex items-center gap-3 text-sm w-full text-left px-3 py-2 rounded-lg transition-colors ${
                m.userId === selectedUser ? 'bg-[#404249] text-white' : 'text-[#dce0e8] hover:bg-[#383a40]'
              }`}
            >
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#5865f2] to-violet-600 flex items-center justify-center text-xs font-bold text-white">
                  {m.user.username[0].toUpperCase()}
                </div>
                <PresenceDot userId={m.userId} className="absolute -bottom-0.5 -right-0.5" />
              </div>
              <span className="truncate flex-1 font-medium">{m.user.username}</span>
              {m.userId === room.ownerId && (
                <span title="Owner" className="text-yellow-400 text-xs shrink-0">👑</span>
              )}
              {adminIds.has(m.userId) && m.userId !== room.ownerId && (
                <span title="Admin" className="text-[#5865f2] text-[11px] font-bold shrink-0 border border-[#5865f2]/40 rounded px-1">MOD</span>
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
    <div className="absolute left-4 right-4 bg-[#111214] border border-[#3f4248] rounded-xl p-4 shadow-2xl z-10 text-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#5865f2] to-violet-600 flex items-center justify-center text-lg font-bold text-white">
            {user.username[0].toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-white">{user.username}</p>
            <p className={`text-xs mt-0.5 ${statusColors[user.status] ?? 'text-[#6b6f78]'}`}>{user.status}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-[#6b6f78] hover:text-white text-xl leading-none">×</button>
      </div>

      <div className="space-y-1.5">
        {!user.isFriend && !user.isBanned && !user.hasPendingRequest && (
          <button
            onClick={() => addFriend.mutate()}
            className="w-full text-left bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            + Add Friend
          </button>
        )}
        {user.hasPendingRequest && <p className="text-xs text-[#6b6f78]">Friend request pending</p>}
        {user.isFriend && <p className="text-xs text-[#23a55a]">✓ Friends</p>}
        {msg && <p className="text-xs text-yellow-400">{msg}</p>}

        {(isAdmin || isOwner) && (
          <button
            onClick={() => banFromRoom.mutate()}
            className="w-full text-left text-red-400 hover:text-red-300 text-xs py-1 transition-colors"
          >
            🚫 Ban from room
          </button>
        )}
      </div>
    </div>
  )
}
