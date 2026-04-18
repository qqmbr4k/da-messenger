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

export default function ContactsPanel({ onOpenDm }: Props) {
  const [reqUsername, setReqUsername] = useState('')
  const [reqMsg, setReqMsg] = useState('')
  const [error, setError] = useState('')
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
      qc.invalidateQueries({ queryKey: ['my-rooms'] })
      onOpenDm(room.id)
    },
  })

  return (
    <div className="p-6 max-w-xl space-y-8">
      <section>
        <h2 className="font-semibold mb-3">Add Friend</h2>
        <div className="flex gap-2">
          <input
            placeholder="Username"
            value={reqUsername}
            onChange={e => setReqUsername(e.target.value)}
            className="bg-gray-700 rounded px-3 py-2 text-sm flex-1 outline-none"
          />
          <input
            placeholder="Message (optional)"
            value={reqMsg}
            onChange={e => setReqMsg(e.target.value)}
            className="bg-gray-700 rounded px-3 py-2 text-sm flex-1 outline-none"
          />
          <button onClick={sendRequest} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm">Send</button>
        </div>
        {error && <p className="text-red-400 text-sm mt-1">{error}</p>}
      </section>

      {(requests?.received?.length ?? 0) > 0 && (
        <section>
          <h2 className="font-semibold mb-3">Incoming Requests</h2>
          <div className="space-y-2">
            {requests!.received.map(r => (
              <div key={r.id} className="bg-gray-800 rounded p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{r.requester.username}</p>
                  {r.message && <p className="text-sm text-gray-400">{r.message}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => accept(r.id)} className="text-sm text-green-400 hover:underline">Accept</button>
                  <button onClick={() => decline(r.id)} className="text-sm text-red-400 hover:underline">Decline</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-semibold mb-3">Friends ({friends.length})</h2>
        <div className="space-y-1">
          {friends.map(f => (
            <div key={f.id} className="flex items-center gap-3 bg-gray-800 rounded p-2">
              <PresenceDot userId={f.id} />
              <span className="flex-1 text-sm">{f.username}</span>
              <button onClick={() => openDm.mutate(f.id)} className="text-xs text-blue-400 hover:underline">Message</button>
              <button onClick={() => removeFriend(f.id)} className="text-xs text-red-400 hover:underline">Remove</button>
            </div>
          ))}
          {friends.length === 0 && <p className="text-gray-500 text-sm">No friends yet.</p>}
        </div>
      </section>
    </div>
  )
}
