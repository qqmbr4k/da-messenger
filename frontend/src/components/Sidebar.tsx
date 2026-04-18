import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import PresenceDot from './PresenceDot'
import CreateRoomModal from './CreateRoomModal'
import { useUnreadStore } from '../store/unread'
import PendingInvitations from './PendingInvitations'

interface Room { id: string; name: string; type: string; description: string }
interface Friend { id: string; username: string }

interface Props {
  activeRoomId: string | null
  onSelectRoom: (id: string) => void
}

export default function Sidebar({ activeRoomId, onSelectRoom }: Props) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const counts = useUnreadStore(s => s.counts)

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ['my-rooms'],
    queryFn: () => api.get('/rooms/my').then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: friends = [] } = useQuery<Friend[]>({
    queryKey: ['friends'],
    queryFn: () => api.get('/friends').then(r => r.data),
    refetchInterval: 30_000,
  })

  const openDm = useMutation({
    mutationFn: (userId: string) => api.post('/directs/open', { userId }).then(r => r.data),
    onSuccess: (room) => {
      qc.invalidateQueries({ queryKey: ['my-rooms'] })
      onSelectRoom(room.id)
    },
  })

  const q = search.toLowerCase()
  const publicRooms = rooms.filter(r => r.type === 'PUBLIC' && (!q || r.name.toLowerCase().includes(q)))
  const privateRooms = rooms.filter(r => r.type === 'PRIVATE' && (!q || r.name.toLowerCase().includes(q)))
  const dmRooms = rooms.filter(r => r.type === 'DIRECT')

  // Find DM room for a friend
  function getDmRoom(friendId: string) {
    return dmRooms.find(r => r.name.includes(friendId))
  }

  return (
    <aside className={`bg-gray-900 border-r border-gray-700 flex flex-col transition-all duration-200 ${collapsed && activeRoomId ? 'w-12' : 'w-64'} shrink-0`}>
      {/* Logo area */}
      {!collapsed && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
          <img src="/logo.png" alt="logo" className="w-7 h-7 object-contain" />
          <span className="text-sm font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">DAMessenger</span>
          <button
            onClick={() => setCollapsed(true)}
            className="ml-auto text-gray-600 hover:text-gray-400 text-xs"
            title="Collapse"
          >◀</button>
        </div>
      )}
      {collapsed && activeRoomId && (
        <button
          onClick={() => setCollapsed(false)}
          className="p-3 text-gray-500 hover:text-gray-300 text-xs self-center"
          title="Expand"
        >▶</button>
      )}

      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          <input
            placeholder="Search rooms..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 rounded px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />

          <SidebarSection title="Public Rooms">
            {publicRooms.map(r => (
              <RoomItem key={r.id} room={r} active={r.id === activeRoomId} unread={counts[r.id] ?? 0} onClick={() => onSelectRoom(r.id)} />
            ))}
            {publicRooms.length === 0 && <p className="text-xs text-gray-600 px-2">None joined yet</p>}
          </SidebarSection>

          <SidebarSection title="Private Rooms">
            {privateRooms.map(r => (
              <RoomItem key={r.id} room={r} active={r.id === activeRoomId} unread={counts[r.id] ?? 0} onClick={() => onSelectRoom(r.id)} />
            ))}
            {privateRooms.length === 0 && <p className="text-xs text-gray-600 px-2">None</p>}
          </SidebarSection>

          <SidebarSection title="Contacts">
            {friends.map(f => {
              const dmRoom = getDmRoom(f.id)
              const unread = dmRoom ? (counts[dmRoom.id] ?? 0) : 0
              return (
                <button
                  key={f.id}
                  onClick={() => openDm.mutate(f.id)}
                  className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-gray-700 text-sm"
                >
                  <PresenceDot userId={f.id} />
                  <span className="truncate flex-1">{f.username}</span>
                  {unread > 0 && <Badge count={unread} />}
                </button>
              )
            })}
            {friends.length === 0 && <p className="text-xs text-gray-600 px-2">No contacts yet</p>}
          </SidebarSection>

          <button
            onClick={() => setShowCreate(true)}
            className="w-full text-sm text-blue-400 hover:text-blue-300 border border-blue-900 hover:border-blue-700 rounded py-1.5 mt-1 transition-colors"
          >
            + Create Room
          </button>
        </div>
      )}

      {!collapsed && <PendingInvitations onAccept={id => { qc.invalidateQueries({ queryKey: ['my-rooms'] }); onSelectRoom(id) }} />}

      {showCreate && (
        <CreateRoomModal
          onClose={() => setShowCreate(false)}
          onCreate={room => {
            qc.invalidateQueries({ queryKey: ['my-rooms'] })
            onSelectRoom(room.id)
            setShowCreate(false)
          }}
        />
      )}
    </aside>
  )
}

function Badge({ count }: { count: number }) {
  return (
    <span className="bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold">
      {count > 99 ? '99+' : count}
    </span>
  )
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="text-xs text-gray-500 uppercase tracking-wide w-full text-left flex items-center justify-between px-1 mb-1 hover:text-gray-400"
      >
        {title} <span className="text-gray-600">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  )
}

function RoomItem({ room, active, unread, onClick }: { room: Room; active: boolean; unread: number; onClick: () => void }) {
  const isDirect = room.type === 'DIRECT'
  const displayName = isDirect ? room.description.replace(' & ', ' ↔ ') : room.name
  const icon = isDirect ? '💬' : '#'
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${active ? 'bg-blue-700 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
    >
      <span className="text-gray-500 shrink-0 text-xs">{icon}</span>
      <span className="truncate flex-1">{displayName}</span>
      {unread > 0 && <Badge count={unread} />}
    </button>
  )
}
