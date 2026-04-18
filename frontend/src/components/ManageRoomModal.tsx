import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuthStore } from '../store/auth'

interface Room { id: string; name: string; description: string; type: string; ownerId: string | null }
interface Props {
  room: Room
  isOwner: boolean
  onClose: () => void
  onDeleted: () => void
}

type Tab = 'members' | 'admins' | 'banned' | 'invitations' | 'settings'

export default function ManageRoomModal({ room, isOwner, onClose, onDeleted }: Props) {
  const [tab, setTab] = useState<Tab>('members')
  const qc = useQueryClient()

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="font-semibold">Manage Room: #{room.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">×</button>
        </div>
        <div className="flex gap-1 px-6 py-2 border-b border-gray-700 text-sm">
          {(['members', 'admins', 'banned', 'invitations', 'settings'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded capitalize ${tab === t ? 'bg-blue-700' : 'hover:bg-gray-700'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'members' && <MembersTab room={room} isOwner={isOwner} onRefresh={() => qc.invalidateQueries({ queryKey: ['room', room.id] })} />}
          {tab === 'admins' && <AdminsTab room={room} isOwner={isOwner} onRefresh={() => qc.invalidateQueries({ queryKey: ['room', room.id] })} />}
          {tab === 'banned' && <BannedTab room={room} />}
          {tab === 'invitations' && <InvitationsTab room={room} />}
          {tab === 'settings' && <SettingsTab room={room} isOwner={isOwner} onDeleted={onDeleted} onRefresh={() => qc.invalidateQueries({ queryKey: ['room', room.id] })} />}
        </div>
      </div>
    </div>
  )
}

function MembersTab({ room, isOwner, onRefresh }: { room: Room; isOwner: boolean; onRefresh: () => void }) {
  const userId = useAuthStore(s => s.user?.id)
  const { data } = useQuery<any>({
    queryKey: ['room', room.id],
    queryFn: () => api.get(`/rooms/${room.id}`).then(r => r.data),
  })
  const adminIds = new Set((data?.admins || []).map((a: any) => a.userId))

  async function ban(uid: string) {
    await api.post(`/rooms/${room.id}/bans`, { userId: uid })
    onRefresh()
  }
  async function makeAdmin(uid: string) {
    await api.post(`/rooms/${room.id}/admins`, { userId: uid })
    onRefresh()
  }

  return (
    <table className="w-full text-sm">
      <thead><tr className="text-gray-500 text-left"><th className="pb-2">Username</th><th>Role</th><th>Actions</th></tr></thead>
      <tbody>
        {(data?.members || []).map((m: any) => (
          <tr key={m.userId} className="border-t border-gray-700">
            <td className="py-2">{m.user.username}</td>
            <td>{m.userId === room.ownerId ? 'Owner' : adminIds.has(m.userId) ? 'Admin' : 'Member'}</td>
            <td className="flex gap-2 py-2">
              {isOwner && m.userId !== userId && m.userId !== room.ownerId && (
                <>
                  {!adminIds.has(m.userId) && (
                    <button onClick={() => makeAdmin(m.userId)} className="text-xs text-blue-400 hover:underline">Make admin</button>
                  )}
                  <button onClick={() => ban(m.userId)} className="text-xs text-red-400 hover:underline">Ban</button>
                </>
              )}
              {!isOwner && adminIds.has(userId!) && m.userId !== room.ownerId && m.userId !== userId && (
                <button onClick={() => ban(m.userId)} className="text-xs text-red-400 hover:underline">Ban</button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AdminsTab({ room, isOwner, onRefresh }: { room: Room; isOwner: boolean; onRefresh: () => void }) {
  const { data } = useQuery<any>({
    queryKey: ['room', room.id],
    queryFn: () => api.get(`/rooms/${room.id}`).then(r => r.data),
  })

  async function removeAdmin(uid: string) {
    await api.delete(`/rooms/${room.id}/admins/${uid}`)
    onRefresh()
  }

  return (
    <div className="space-y-2 text-sm">
      {(data?.admins || []).map((a: any) => (
        <div key={a.userId} className="flex items-center justify-between border-t border-gray-700 pt-2">
          <span>{a.user.username}{a.userId === room.ownerId ? ' (owner)' : ''}</span>
          {isOwner && a.userId !== room.ownerId && (
            <button onClick={() => removeAdmin(a.userId)} className="text-xs text-red-400 hover:underline">Remove admin</button>
          )}
        </div>
      ))}
    </div>
  )
}

function BannedTab({ room }: { room: Room }) {
  const { data = [], refetch } = useQuery<any[]>({
    queryKey: ['room-bans', room.id],
    queryFn: () => api.get(`/rooms/${room.id}/bans`).then(r => r.data),
  })

  async function unban(uid: string) {
    await api.delete(`/rooms/${room.id}/bans/${uid}`)
    refetch()
  }

  return (
    <table className="w-full text-sm">
      <thead><tr className="text-gray-500 text-left"><th className="pb-2">Username</th><th>Banned by</th><th>Actions</th></tr></thead>
      <tbody>
        {data.map(b => (
          <tr key={b.id} className="border-t border-gray-700">
            <td className="py-2">{b.user.username}</td>
            <td>{b.bannedBy.username}</td>
            <td><button onClick={() => unban(b.userId)} className="text-xs text-green-400 hover:underline">Unban</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function InvitationsTab({ room }: { room: Room }) {
  const [username, setUsername] = useState('')
  const [msg, setMsg] = useState('')

  async function invite() {
    await api.post(`/rooms/${room.id}/invitations`, { username })
    setMsg('Invited!')
    setUsername('')
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">Invite user by username</p>
      <div className="flex gap-2">
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Username"
          className="bg-gray-700 rounded px-3 py-1 text-sm flex-1 outline-none"
        />
        <button onClick={invite} className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm">Send invite</button>
      </div>
      {msg && <p className="text-green-400 text-sm">{msg}</p>}
    </div>
  )
}

function SettingsTab({ room, isOwner, onDeleted, onRefresh }: { room: Room; isOwner: boolean; onDeleted: () => void; onRefresh: () => void }) {
  const [name, setName] = useState(room.name)
  const [desc, setDesc] = useState(room.description)
  const [type, setType] = useState(room.type)
  const [msg, setMsg] = useState('')

  async function save() {
    await api.put(`/rooms/${room.id}`, { name, description: desc, type })
    setMsg('Saved!')
    onRefresh()
  }

  async function deleteRoom() {
    if (!confirm('Delete this room? All messages and files will be lost.')) return
    await api.delete(`/rooms/${room.id}`)
    onDeleted()
  }

  if (!isOwner) return <p className="text-gray-400 text-sm">Only the owner can change settings.</p>

  return (
    <div className="space-y-4 text-sm max-w-sm">
      <div>
        <label className="block mb-1">Room name</label>
        <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-700 rounded px-3 py-2 outline-none" />
      </div>
      <div>
        <label className="block mb-1">Description</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full bg-gray-700 rounded px-3 py-2 outline-none resize-none h-20" />
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2">
          <input type="radio" checked={type === 'PUBLIC'} onChange={() => setType('PUBLIC')} /> Public
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={type === 'PRIVATE'} onChange={() => setType('PRIVATE')} /> Private
        </label>
      </div>
      {msg && <p className="text-green-400">{msg}</p>}
      <div className="flex gap-3">
        <button onClick={save} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">Save changes</button>
        <button onClick={deleteRoom} className="bg-red-700 hover:bg-red-600 px-4 py-2 rounded">Delete room</button>
      </div>
    </div>
  )
}
