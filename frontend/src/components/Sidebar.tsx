import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const counts = useUnreadStore(s => s.counts)
  const myId = useAuthStore(s => s.user?.id)
  const username = useAuthStore(s => s.user?.username)
  const setUser = useAuthStore(s => s.setUser)

  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      setUser(null)
      qc.clear()
      navigate('/login')
    },
  })

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ['my-rooms'],
    queryFn: () => api.get('/rooms/my').then(r => r.data),
    refetchInterval: 10_000,
    staleTime: 0,
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
    <aside className="bg-[#19171d] border-r border-black/30 flex flex-col w-[260px] shrink-0 select-none">
      {/* Workspace header */}
      <div className="px-4 py-3 border-b border-black/20 shrink-0">
        <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-white/10 transition-colors group">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-[#4a154b] to-[#7c3085] flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-white text-[11px] font-extrabold">DA</span>
          </div>
          <span className="font-bold text-white text-[15px] truncate flex-1 text-left">DAMessenger</span>
          <svg className="w-3.5 h-3.5 text-white/60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Search bar */}
      <div className="px-3 pt-2.5 pb-1.5 shrink-0">
        <div className="flex items-center gap-2 w-full bg-white/10 hover:bg-white/15 rounded px-2.5 py-1.5 transition-colors">
          <svg className="w-3.5 h-3.5 text-white/50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            placeholder="Search rooms..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm text-white/80 placeholder-white/40 outline-none flex-1 w-full"
          />
        </div>
      </div>

      {/* Nav links */}
      <div className="px-2 pb-1 shrink-0 space-y-px">
        <SidebarNavLink to="/rooms" active={location.pathname === '/rooms'} icon={<IconCompass />}>
          Browse Rooms
        </SidebarNavLink>
        <SidebarNavLink to="/contacts" active={location.pathname === '/contacts'} icon={<IconPeople />} badge={pendingCount}>
          Contacts
        </SidebarNavLink>
      </div>

      <div className="mx-3 h-px bg-white/10 my-1" />

      {/* Scrollable room/DM list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 pb-2 scrollbar-thin scrollbar-thumb-white/10">
        {/* Channels / Rooms */}
        <SidebarSection title="Rooms" onAdd={() => setShowCreate(true)}>
          {publicRooms.map(r => (
            <RoomItem key={r.id} room={r} active={r.id === activeRoomId && !isOnSubpage} unread={counts[r.id] ?? 0} onClick={() => onSelectRoom(r.id)} />
          ))}
          {privateRooms.map(r => (
            <RoomItem key={r.id} room={r} active={r.id === activeRoomId && !isOnSubpage} unread={counts[r.id] ?? 0} onClick={() => onSelectRoom(r.id)} />
          ))}
          {publicRooms.length === 0 && privateRooms.length === 0 && (
            <p className="text-xs text-white/30 px-3 py-1">
              No rooms yet.{' '}
              <button onClick={() => setShowCreate(true)} className="text-[#4fc3f7] hover:underline">Create one</button>
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
                className={`flex items-center gap-2.5 w-full text-left px-2 py-1.5 rounded-md transition-colors group/dm ${
                  isActive ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white/90'
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                  {f.username[0].toUpperCase()}
                </div>
                <PresenceDot userId={f.id} borderColor="#19171d" />
                <span className={`truncate flex-1 text-sm ${unread > 0 ? 'font-semibold text-white' : ''}`}>
                  {f.username}
                </span>
                {unread > 0 && <UnreadBadge count={unread} />}
              </button>
            )
          })}
          {friends.length === 0 && (
            <p className="text-xs text-white/30 px-3 py-1">
              Add contacts to start DMing
            </p>
          )}
        </SidebarSection>
      </div>

      <PendingInvitations onAccept={id => { qc.invalidateQueries({ queryKey: ['my-rooms'] }); onSelectRoom(id) }} />

      {/* Bottom nav */}
      <div className="mx-3 h-px bg-white/10 mt-1" />
      <div className="px-2 py-1 space-y-px shrink-0">
        <SidebarNavLink to="/profile" active={location.pathname === '/profile'} icon={<IconSettings />}>
          Preferences
        </SidebarNavLink>
        <SidebarNavLink to="/sessions" active={location.pathname === '/sessions'} icon={<IconMonitor />}>
          Sessions
        </SidebarNavLink>
        <SidebarNavLink to="/xmpp" active={location.pathname === '/xmpp'} icon={<IconPlugin />}>
          XMPP Bridge
        </SidebarNavLink>
      </div>

      {/* User status bar */}
      <div className="border-t border-black/20 px-3 py-2 shrink-0 bg-[#19171d]">
        <div className="flex items-center gap-2">
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm font-bold text-white">
              {username?.[0]?.toUpperCase()}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#2bac76] rounded-full border-2 border-[#19171d]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">{username}</p>
            <p className="text-[11px] text-white/40">Active</p>
          </div>
          <div className="flex items-center gap-0.5">
            <button title="Mute" className="w-7 h-7 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors">
              <IconMic />
            </button>
            <button
              title="Log out"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="w-7 h-7 flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
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
  to: string; active: boolean; icon: React.ReactNode; badge?: number; children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-sm transition-colors ${
        active ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white/90'
      }`}
    >
      <span className="w-4 h-4 flex items-center justify-center shrink-0 opacity-80">{icon}</span>
      <span className="flex-1">{children}</span>
      {badge > 0 && <UnreadBadge count={badge} />}
    </Link>
  )
}

function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="bg-[#e01e5a] text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold">
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
      <div className="flex items-center px-1 py-0.5 group/section">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 flex-1 text-left py-0.5 text-[11px] font-bold text-white/50 hover:text-white/80 uppercase tracking-wider transition-colors"
        >
          <svg className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5l8 7-8 7V5z" />
          </svg>
          {title}
        </button>
        {onAdd && (
          <button
            onClick={onAdd}
            className="opacity-0 group-hover/section:opacity-100 text-white/50 hover:text-white transition-all w-5 h-5 flex items-center justify-center rounded hover:bg-white/10"
            title={`Add ${title.toLowerCase()}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>
      {open && <div className="space-y-px">{children}</div>}
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
      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors group/room ${
        active
          ? 'bg-white/15 text-white'
          : unread > 0
          ? 'text-white hover:bg-white/10'
          : 'text-white/55 hover:bg-white/10 hover:text-white/90'
      }`}
    >
      {isPrivate ? (
        <svg className="w-3.5 h-3.5 shrink-0 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ) : (
        <span className="text-white/40 shrink-0 text-base font-light leading-none">#</span>
      )}
      <span className={`truncate flex-1 ${unread > 0 ? 'font-semibold' : ''}`}>{room.name}</span>
      {unread > 0 && <UnreadBadge count={unread} />}
    </button>
  )
}

function IconCompass() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2-5 5 2-2 5-5-2z" />
    </svg>
  )
}

function IconPeople() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function IconMonitor() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

function IconPlugin() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
    </svg>
  )
}

function IconMic() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M9 11V7a3 3 0 016 0v4a3 3 0 11-6 0z" />
    </svg>
  )
}
