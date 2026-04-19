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

const TAB_ICONS: Record<Tab, string> = {
  members: '👥',
  admins: '🛡️',
  banned: '🚫',
  invitations: '✉️',
  settings: '⚙️',
}

function inputClass() {
  return 'w-full bg-[#383a40] border border-[#4a4d55] rounded-lg px-3 py-2 text-sm text-[#dce0e8] placeholder-[#6b6f78] outline-none focus:border-[#5865f2] transition-colors'
}

export default function ManageRoomModal({ room, isOwner, onClose, onDeleted }: Props) {
  const [tab, setTab] = useState<Tab>('members')
  const qc = useQueryClient()

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div data-testid="manage-room-modal" className="bg-[#313338] border border-[#3f4248] rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3f4248]">
          <div>
            <h2 className="font-bold text-white">Room Settings</h2>
            <p className="text-[#949ba4] text-sm">#{room.name}</p>
          </div>
          <button onClick={onClose} className="text-[#6b6f78] hover:text-white text-2xl leading-none transition-colors">×</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Tab sidebar */}
          <div className="w-44 border-r border-[#3f4248] p-3 space-y-0.5 shrink-0">
            {(['members', 'admins', 'banned', 'invitations', 'settings'] as Tab[]).map(t => (
              <button
                key={t}
                data-testid={`tab-${t}`}
                onClick={() => setTab(t)}
                className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-sm capitalize transition-colors ${
                  tab === t ? 'bg-[#404249] text-white' : 'text-[#949ba4] hover:bg-[#2b2d31] hover:text-[#dce0e8]'
                }`}
              >
                <span>{TAB_ICONS[t]}</span>
                {t}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            {tab === 'members' && <MembersTab room={room} isOwner={isOwner} onRefresh={() => qc.invalidateQueries({ queryKey: ['room', room.id] })} />}
            {tab === 'admins' && <AdminsTab room={room} isOwner={isOwner} onRefresh={() => qc.invalidateQueries({ queryKey: ['room', room.id] })} />}
            {tab === 'banned' && <BannedTab room={room} />}
            {tab === 'invitations' && <InvitationsTab room={room} />}
            {tab === 'settings' && <SettingsTab room={room} isOwner={isOwner} onDeleted={onDeleted} onRefresh={() => { qc.invalidateQueries({ queryKey: ['room', room.id] }); qc.invalidateQueries({ queryKey: ['my-rooms'] }) }} />}
          </div>
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
    staleTime: 0,
  })
  const adminIds = new Set((data?.admins || []).map((a: any) => a.userId))

  async function kick(uid: string) { await api.delete(`/rooms/${room.id}/members/${uid}`); onRefresh() }
  async function ban(uid: string) { await api.post(`/rooms/${room.id}/bans`, { userId: uid }); onRefresh() }
  async function makeAdmin(uid: string) { await api.post(`/rooms/${room.id}/admins`, { userId: uid }); onRefresh() }

  const canAct = (memberId: string) =>
    memberId !== room.ownerId && memberId !== userId &&
    (isOwner || (adminIds.has(userId!) && !adminIds.has(memberId)))

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-3">
        {(data?.members || []).length} Members
      </p>
      {(data?.members || []).map((m: any) => (
        <div key={m.userId} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#2b2d31] transition-colors">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#5865f2] to-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {m.user.username[0].toUpperCase()}
          </div>
          <span className="flex-1 text-sm text-[#dce0e8]">{m.user.username}</span>
          <span className="text-xs text-[#6b6f78]">
            {m.userId === room.ownerId ? '👑 Owner' : adminIds.has(m.userId) ? '🛡️ Admin' : 'Member'}
          </span>
          <div className="flex gap-1">
            {isOwner && m.userId !== userId && m.userId !== room.ownerId && !adminIds.has(m.userId) && (
              <button onClick={() => makeAdmin(m.userId)} className="text-xs text-[#5865f2] hover:underline px-1">+Admin</button>
            )}
            {canAct(m.userId) && (
              <button
                onClick={() => kick(m.userId)}
                title="Remove from room — user can rejoin"
                className="text-xs text-[#f0a032] hover:underline px-1"
              >
                Kick
              </button>
            )}
            {canAct(m.userId) && (
              <button
                onClick={() => ban(m.userId)}
                title="Ban — user cannot rejoin unless unbanned"
                className="text-xs text-red-400 hover:underline px-1"
              >
                Ban
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function AdminsTab({ room, isOwner, onRefresh }: { room: Room; isOwner: boolean; onRefresh: () => void }) {
  const { data } = useQuery<any>({
    queryKey: ['room', room.id],
    queryFn: () => api.get(`/rooms/${room.id}`).then(r => r.data),
    staleTime: 0,
  })

  async function removeAdmin(uid: string) { await api.delete(`/rooms/${room.id}/admins/${uid}`); onRefresh() }

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-3">Admins</p>
      {(data?.admins || []).map((a: any) => (
        <div key={a.userId} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#2b2d31]">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#5865f2] to-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {a.user.username[0].toUpperCase()}
          </div>
          <span className="flex-1 text-sm text-[#dce0e8]">{a.user.username}</span>
          {a.userId === room.ownerId && <span className="text-xs text-[#6b6f78]">Owner</span>}
          {isOwner && a.userId !== room.ownerId && (
            <button onClick={() => removeAdmin(a.userId)} className="text-xs text-red-400 hover:underline">Remove</button>
          )}
        </div>
      ))}
      {(data?.admins || []).length === 0 && <p className="text-[#6b6f78] text-sm">No admins yet.</p>}
    </div>
  )
}

function BannedTab({ room }: { room: Room }) {
  const { data = [], refetch } = useQuery<any[]>({
    queryKey: ['room-bans', room.id],
    queryFn: () => api.get(`/rooms/${room.id}/bans`).then(r => r.data),
    staleTime: 0,
  })

  async function unban(uid: string) { await api.delete(`/rooms/${room.id}/bans/${uid}`); refetch() }

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-3">Banned Users</p>
      {data.map(b => (
        <div key={b.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#2b2d31]">
          <div className="w-8 h-8 rounded-full bg-[#383a40] flex items-center justify-center text-xs text-[#949ba4] shrink-0">
            {b.user.username[0].toUpperCase()}
          </div>
          <span className="flex-1 text-sm text-[#dce0e8]">{b.user.username}</span>
          <span className="text-xs text-[#6b6f78]">by {b.bannedBy.username}</span>
          <button onClick={() => unban(b.userId)} className="text-xs text-[#23a55a] hover:underline">Unban</button>
        </div>
      ))}
      {data.length === 0 && <p className="text-[#6b6f78] text-sm">No banned users.</p>}
    </div>
  )
}

function InvitationsTab({ room }: { room: Room }) {
  const [username, setUsername] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function invite() {
    if (!username.trim()) return
    setError(''); setMsg('')
    try {
      await api.post(`/rooms/${room.id}/invitations`, { username: username.trim() })
      setMsg(`Invitation sent to ${username.trim()}!`)
      setUsername('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to send invitation')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider">Invite by Username</p>
      <div className="flex gap-2">
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && invite()}
          placeholder="Enter a username..."
          className={inputClass()}
        />
        <button onClick={invite} className="bg-[#5865f2] hover:bg-[#4752c4] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap">
          Send Invite
        </button>
      </div>
      {msg && <p className="text-[#23a55a] text-sm">{msg}</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  )
}

function SettingsTab({ room, isOwner, onDeleted, onRefresh }: {
  room: Room; isOwner: boolean; onDeleted: () => void; onRefresh: () => void
}) {
  const [name, setName] = useState(room.name)
  const [desc, setDesc] = useState(room.description)
  const [type, setType] = useState(room.type)
  const [msg, setMsg] = useState('')

  async function save() {
    await api.put(`/rooms/${room.id}`, { name, description: desc, type })
    setMsg('Changes saved!')
    onRefresh()
  }

  async function deleteRoom() {
    if (!confirm('Delete this room? All messages and files will be permanently lost.')) return
    await api.delete(`/rooms/${room.id}`)
    onDeleted()
  }

  async function leaveRoom() {
    if (!confirm('Leave this room?')) return
    await api.post(`/rooms/${room.id}/leave`)
    onDeleted()
  }

  if (!isOwner) return (
    <div className="space-y-4">
      <p className="text-[#949ba4] text-sm">Only the room owner can change settings.</p>
      <div className="border-t border-[#3f4248] pt-4">
        <p className="text-[#949ba4] text-sm mb-3">You can leave this room at any time.</p>
        <button onClick={leaveRoom} className="bg-[#383a40] hover:bg-[#4a4d55] text-[#dce0e8] px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
          Leave Room
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 max-w-sm">
      <div>
        <label className="block text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-1.5">Room Name</label>
        <input value={name} onChange={e => setName(e.target.value)} className={inputClass()} />
      </div>
      <div>
        <label className="block text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-1.5">Description</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} className={`${inputClass()} resize-none h-20`} />
      </div>
      <div>
        <label className="block text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-2">Privacy</label>
        <div className="flex gap-4">
          {(['PUBLIC', 'PRIVATE'] as const).map(t => (
            <label key={t} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={type === t} onChange={() => setType(t)} className="accent-[#5865f2]" />
              <span className="text-sm text-[#dce0e8]">{t === 'PUBLIC' ? '# Public' : '🔒 Private'}</span>
            </label>
          ))}
        </div>
      </div>
      {msg && <p className="text-[#23a55a] text-sm">{msg}</p>}
      <div className="flex gap-3 pt-2">
        <button onClick={save} className="bg-[#5865f2] hover:bg-[#4752c4] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
          Save Changes
        </button>
      </div>
      <div className="border-t border-red-900/30 pt-4">
        <p className="text-[#949ba4] text-sm mb-3">Danger zone — this action cannot be undone.</p>
        <button onClick={deleteRoom} className="bg-red-900/40 hover:bg-red-700 border border-red-900/60 text-red-400 hover:text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
          Delete Room
        </button>
      </div>
    </div>
  )
}
