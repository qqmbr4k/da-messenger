import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import api from '../lib/api'
import { disconnectSocket } from '../lib/socket'

interface FriendRequests {
  received: { id: string }[]
  sent: { id: string }[]
}

export default function TopBar() {
  const { user, setUser } = useAuthStore()
  const navigate = useNavigate()

  const { data: requests } = useQuery<FriendRequests>({
    queryKey: ['friend-requests'],
    queryFn: () => api.get('/friends/requests').then(r => r.data),
    refetchInterval: 60_000,
  })
  const pendingCount = requests?.received?.length ?? 0

  async function handleLogout() {
    await api.post('/auth/logout').catch(() => {})
    disconnectSocket()
    setUser(null)
    navigate('/login')
  }

  return (
    <header className="bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center gap-4 shrink-0 h-12">
      <Link to="/" className="flex items-center gap-2 shrink-0">
        <img src="/logo.png" alt="DAMessenger" className="h-7 w-7 object-contain" />
        <span className="font-bold text-sm bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent hidden sm:block">
          DAMessenger
        </span>
      </Link>

      <nav className="flex gap-1 text-sm flex-1">
        <NavLink to="/rooms">Public Rooms</NavLink>
        <NavLink to="/contacts" badge={pendingCount}>Contacts</NavLink>
        <NavLink to="/sessions">Sessions</NavLink>
        <NavLink to="/profile">Profile</NavLink>
        <NavLink to="/xmpp">XMPP</NavLink>
      </nav>

      <div className="flex items-center gap-3 text-sm shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-xs font-bold">
            {user?.username?.[0]?.toUpperCase()}
          </span>
          <span className="text-gray-300 hidden sm:block">{user?.username}</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-gray-400 hover:text-red-400 transition-colors text-xs border border-gray-700 hover:border-red-700 rounded px-2 py-1"
        >
          Sign out
        </button>
      </div>
    </header>
  )
}

function NavLink({ to, children, badge = 0 }: { to: string; children: React.ReactNode; badge?: number }) {
  return (
    <Link
      to={to}
      className="relative px-3 py-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
    >
      {children}
      {badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 font-bold">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  )
}
