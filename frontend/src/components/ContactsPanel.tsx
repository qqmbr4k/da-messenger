import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import PresenceDot from './PresenceDot'

interface Friend { id: string; username: string }
interface FriendRequest {
  id: string
  message: string
  requester: { id: string; username: string }
  recipient: { id: string; username: string }
}

interface Props {
  onOpenDm: (roomId: string) => void
}

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-500',
  'from-pink-500 to-rose-600',
  'from-violet-500 to-purple-600',
  'from-cyan-500 to-blue-500',
]

export default function ContactsPanel({ onOpenDm }: Props) {
  const [reqUsername, setReqUsername] = useState('')
  const [reqMsg, setReqMsg] = useState('')
  const [error, setError] = useState('')
  const [dmError, setDmError] = useState('')
  const qc = useQueryClient()

  const { data: friends = [] } = useQuery<Friend[]>({
    queryKey: ['friends'],
    queryFn: () => api.get('/friends').then(r => r.data),
  })
  const { data: requests } = useQuery<{ received: FriendRequest[]; sent: FriendRequest[] }>({
    queryKey: ['friend-requests'],
    queryFn: () => api.get('/friends/requests').then(r => r.data),
  })

  async function sendRequest() {
    setError('')
    try {
      await api.post('/friends/requests', { username: reqUsername, message: reqMsg })
      setReqUsername('')
      setReqMsg('')
      qc.invalidateQueries({ queryKey: ['friend-requests'] })
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed')
    }
  }

  async function accept(id: string) {
    await api.post(`/friends/requests/${id}/accept`)
    qc.invalidateQueries({ queryKey: ['friends'] })
    qc.invalidateQueries({ queryKey: ['friend-requests'] })
  }

  async function decline(id: string) {
    await api.post(`/friends/requests/${id}/decline`)
    qc.invalidateQueries({ queryKey: ['friend-requests'] })
  }

  async function removeFriend(uid: string) {
    await api.delete(`/friends/${uid}`)
    qc.invalidateQueries({ queryKey: ['friends'] })
  }

  const openDm = useMutation({
    mutationFn: (userId: string) => api.post('/directs/open', { userId }).then(r => r.data),
    onSuccess: (room) => {
      setDmError('')
      qc.invalidateQueries({ queryKey: ['my-rooms'] })
      onOpenDm(room.id)
    },
    onError: (err: any) => {
      setDmError(err?.response?.data?.error || err?.message || 'Failed to open DM')
    },
  })

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#313338]">
      <div className="max-w-2xl space-y-8">
        {/* Add Friend */}
        <section>
          <h2 className="text-xl font-bold text-white mb-1">Add a Friend</h2>
          <p className="text-[#949ba4] text-sm mb-4">You can add a friend using their username.</p>
          <div className="bg-[#2b2d31] border border-[#3f4248] rounded-xl p-4">
            <div className="flex gap-2">
              <input
                placeholder="Enter a username"
                value={reqUsername}
                onChange={e => setReqUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendRequest()}
                className="bg-[#383a40] border border-[#4a4d55] rounded-lg px-3 py-2 text-sm flex-1 outline-none focus:border-[#5865f2] text-[#dce0e8] placeholder-[#6b6f78] transition-colors"
              />
              <input
                placeholder="Note (optional)"
                value={reqMsg}
                onChange={e => setReqMsg(e.target.value)}
                className="bg-[#383a40] border border-[#4a4d55] rounded-lg px-3 py-2 text-sm flex-1 outline-none focus:border-[#5865f2] text-[#dce0e8] placeholder-[#6b6f78] transition-colors"
              />
              <button
                onClick={sendRequest}
                disabled={!reqUsername.trim()}
                className="bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-semibold transition-colors text-white"
              >
                Send Request
              </button>
            </div>
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          </div>
        </section>

        {/* Incoming Requests */}
        {(requests?.received?.length ?? 0) > 0 && (
          <section>
            <h2 className="text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-3">
              Pending — {requests!.received.length}
            </h2>
            <div className="space-y-2">
              {requests!.received.map(r => {
                const idx = r.requester.username.charCodeAt(0) % AVATAR_GRADIENTS.length
                return (
                  <div key={r.id} className="bg-[#2b2d31] border border-[#3f4248] rounded-xl p-4 flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[idx]} flex items-center justify-center text-sm font-bold text-white shrink-0`}>
                      {r.requester.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white">{r.requester.username}</p>
                      {r.message && <p className="text-sm text-[#949ba4] truncate">{r.message}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => accept(r.id)} className="bg-[#23a55a] hover:bg-[#1a8c48] text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors">Accept</button>
                      <button onClick={() => decline(r.id)} className="bg-[#383a40] hover:bg-[#4a4d55] text-[#dce0e8] text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors">Decline</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Friends list */}
        <section>
          <h2 className="text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-3">
            All Friends — {friends.length}
          </h2>
          {dmError && <p className="text-red-400 text-sm mb-2">{dmError}</p>}
          <div className="space-y-1">
            {friends.map(f => {
              const idx = f.username.charCodeAt(0) % AVATAR_GRADIENTS.length
              return (
                <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#2b2d31] transition-colors group">
                  <div className="relative shrink-0">
                    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[idx]} flex items-center justify-center text-sm font-bold text-white`}>
                      {f.username[0].toUpperCase()}
                    </div>
                    <PresenceDot userId={f.id} className="absolute -bottom-0.5 -right-0.5" borderColor="#313338" />
                  </div>
                  <span className="flex-1 text-[#dce0e8] font-medium">{f.username}</span>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openDm.mutate(f.id)}
                      className="text-xs bg-[#5865f2] hover:bg-[#4752c4] text-white px-3 py-1.5 rounded-lg font-semibold transition-colors"
                    >
                      Message
                    </button>
                    <button
                      onClick={() => removeFriend(f.id)}
                      className="text-xs text-[#949ba4] hover:text-red-400 px-2 py-1.5 rounded-lg hover:bg-[#383a40] transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )
            })}
            {friends.length === 0 && (
              <div className="text-center py-12 text-[#6b6f78]">
                <p className="text-4xl mb-3">👥</p>
                <p className="text-sm">No friends yet. Add one above!</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
