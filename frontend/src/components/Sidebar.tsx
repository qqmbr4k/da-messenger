import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import api from '../lib/api'
import PresenceDot from './PresenceDot'
import CreateRoomModal from './CreateRoomModal'
import { useUnreadStore } from '../store/unread'
import { useAuthStore } from '../store/auth'
import PendingInvitations from './PendingInvitations'

interface Room { id: string; name: string; type: string; description: string }
interface Friend { id: string; username: string }
interface FriendRequests { received: { id: string }[]; sent: { id: string }[] }

interface Props {
  activeRoomId: string | null
  onSelectRoom: (id: string) => void
}

export default function Sidebar({ activeRoomId, onSelectRoom }: Props) {
  const qc = useQueryClient()
  const location = useLocation()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const counts = useUnreadStore(s => s.counts)
  const myId = useAuthStore(s => s.user?.id)
  const username = useAuthStore(s => s.user?.username)

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

  const { data: requests } = useQuery<FriendRequests>({
    queryKey: ['friend-requests'],
    queryFn: () => api.get('/friends/requests').then(r => r.data),
    refetchInterval: 60_000,
  })
  const pendingCount = requests?.received?.length ?? 0

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

  function getDmRoom(friendId: string) {
    const name = `dm:${[myId, friendId].sort().join(':')}`
    return dmRooms.find(r => r.name === name)
  }

  const isOnSubpage = location.pathname !== '/'

  return (
    <aside className="bg-[#1e1f22] border-r border-[#1a1b1e] flex flex-col w-60 shrink-0 select-none">
      {/* Workspace header */}
      <div className="px-3 py-3 border-b border-[#2a2b2e] shrink-0">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#2b2d31] cursor-pointer transition-colors">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#5865f2] to-[#9b59f5] flex items-center justify-center shrink-0">
            <img src="/logo.png" alt="" className="w-5 h-5 object-contain" />
          </div>
          <span className="font-bold text-white text-[15px] truncate flex-1">DAMessenger</span>
          <span className="text-[#949ba4] text-xs">▾</span>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2 bg-[#2b2d31] hover:bg-[#32363d] border border-[#3f4248] rounded-lg px-3 py-1.5 cursor-text transition-colors">
          <svg className="w-3.5 h-3.5 text-[#6b6f78] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            placeholder="Search rooms..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm text-[#dce0e8] placeholder-[#6b6f78] outline-none flex-1 w-full"
          />
        </div>
      </div>

      {/* Nav links */}
      <div className="px-2 pb-2 shrink-0 space-y-0.5">
        <SidebarNavLink to="/rooms" active={location.pathname === '/rooms'} icon="🔍">
          Browse Rooms
        </SidebarNavLink>
        <SidebarNavLink to="/contacts" active={location.pathname === '/contacts'} icon="👥" badge={pendingCount}>
          Contacts
        </SidebarNavLink>
      </div>

      <div className="mx-3 h-px bg-[#2a2b2e] mb-2" />

      {/* Scrollable channel/DM list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-3 pb-2">
        {/* Public rooms */}
        <SidebarSection title="Channels" onAdd={() => setShowCreate(true)}>
          {publicRooms.map(r => (
            <RoomItem key={r.id} room={r} active={r.id === activeRoomId && !isOnSubpage} unread={counts[r.id] ?? 0} onClick={() => onSelectRoom(r.id)} />
          ))}
          {privateRooms.map(r => (
            <RoomItem key={r.id} room={r} active={r.id === activeRoomId && !isOnSubpage} unread={counts[r.id] ?? 0} onClick={() => onSelectRoom(r.id)} />
          ))}
          {publicRooms.length === 0 && privateRooms.length === 0 && (
            <p className="text-xs text-[#4f5258] px-3 py-1">
              No channels yet.{' '}
              <button onClick={() => setShowCreate(true)} className="text-[#5865f2] hover:underline">Create one</button>
            </p>
          )}
        </SidebarSection>

        {/* Direct messages */}
        <SidebarSection title="Direct Messages" onAdd={undefined}>
          {friends.map(f => {
            const dmRoom = getDmRoom(f.id)
            const unread = dmRoom ? (counts[dmRoom.id] ?? 0) : 0
            const isActive = dmRoom ? dmRoom.id === activeRoomId && !isOnSubpage : false
            return (
              <button
                key={f.id}
                onClick={() => openDm.mutate(f.id)}
                className={`flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-lg transition-colors ${
                  isActive ? 'bg-[#404249] text-white' : 'text-[#949ba4] hover:bg-[#2b2d31] hover:text-[#dce0e8]'
                }`}
              >
                <PresenceDot userId={f.id} />
                <span className={`truncate flex-1 text-sm ${unread > 0 ? 'font-semibold text-white' : ''}`}>
                  {f.username}
                </span>
                {unread > 0 && <UnreadBadge count={unread} />}
              </button>
            )
          })}
          {friends.length === 0 && (
            <p className="text-xs text-[#4f5258] px-3 py-1">
              Add contacts to start DMing
            </p>
          )}
        </SidebarSection>
      </div>

      <PendingInvitations onAccept={id => { qc.invalidateQueries({ queryKey: ['my-rooms'] }); onSelectRoom(id) }} />

      {/* Bottom nav */}
      <div className="mx-3 h-px bg-[#2a2b2e] mt-1 mb-2" />
      <div className="px-2 pb-1 space-y-0.5 shrink-0">
        <SidebarNavLink to="/profile" active={location.pathname === '/profile'} icon="⚙️">
          Profile & Settings
        </SidebarNavLink>
        <SidebarNavLink to="/sessions" active={location.pathname === '/sessions'} icon="🖥️">
          Sessions
        </SidebarNavLink>
        <SidebarNavLink to="/xmpp" active={location.pathname === '/xmpp'} icon="📡">
          XMPP Bridge
        </SidebarNavLink>
      </div>

      {/* User status bar */}
      <div className="border-t border-[#1a1b1e] px-3 py-2.5 shrink-0 bg-[#1a1b1e]">
        <div className="flex items-center gap-2.5">
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#5865f2] to-violet-600 flex items-center justify-center text-sm font-bold text-white">
              {username?.[0]?.toUpperCase()}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#23a55a] rounded-full border-2 border-[#1a1b1e]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{username}</p>
            <p className="text-[11px] text-[#23a55a]">Online</p>
          </div>
        </div>
      </div>

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

function SidebarNavLink({ to, active, icon, badge = 0, children }: {
  to: string; active: boolean; icon: string; badge?: number; children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-sm transition-colors ${
        active ? 'bg-[#404249] text-white' : 'text-[#949ba4] hover:bg-[#2b2d31] hover:text-[#dce0e8]'
      }`}
    >
      <span className="text-base">{icon}</span>
      <span className="flex-1">{children}</span>
      {badge > 0 && <UnreadBadge count={badge} />}
    </Link>
  )
}

function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="bg-[#f23f42] text-white text-[11px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold">
      {count > 99 ? '99+' : count}
    </span>
  )
}

function SidebarSection({ title, onAdd, children }: {
  title: string; onAdd?: () => void; children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <div className="flex items-center px-1 mb-0.5 group/section">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 flex-1 text-left py-1 text-[11px] font-semibold text-[#949ba4] hover:text-white uppercase tracking-wider transition-colors"
        >
          <span className="text-[9px]">{open ? '▾' : '▸'}</span>
          {title}
        </button>
        {onAdd && (
          <button
            onClick={onAdd}
            className="opacity-0 group-hover/section:opacity-100 text-[#949ba4] hover:text-white transition-all text-lg leading-none px-1"
            title={`Add ${title.toLowerCase()}`}
          >
            +
          </button>
        )}
      </div>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  )
}

function RoomItem({ room, active, unread, onClick }: {
  room: Room; active: boolean; unread: number; onClick: () => void
}) {
  const isPrivate = room.type === 'PRIVATE'
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-[#404249] text-white'
          : unread > 0
          ? 'text-white hover:bg-[#2b2d31]'
          : 'text-[#949ba4] hover:bg-[#2b2d31] hover:text-[#dce0e8]'
      }`}
    >
      <span className="text-[#6b6f78] shrink-0 text-sm">{isPrivate ? '🔒' : '#'}</span>
      <span className={`truncate flex-1 ${unread > 0 ? 'font-semibold' : ''}`}>{room.name}</span>
      {unread > 0 && <UnreadBadge count={unread} />}
    </button>
  )
}
