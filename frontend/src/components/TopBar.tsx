import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import api from '../lib/api'
import { disconnectSocket } from '../lib/socket'

export default function TopBar() {
  const { user, setUser } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    await api.post('/auth/logout').catch(() => {})
    disconnectSocket()
    setUser(null)
    navigate('/login')
  }

  return (
    <header className="bg-[#1e1f22] border-b border-[#1a1b1e] px-4 h-11 flex items-center justify-between shrink-0">
      <div className="flex-1" />
      <div className="flex items-center gap-3 text-sm">
        <span className="text-[#6b6f78] text-xs">{user?.username}</span>
        <button
          onClick={handleLogout}
          className="text-[#6b6f78] hover:text-red-400 transition-colors text-xs border border-[#3f4248] hover:border-red-800 rounded-md px-2.5 py-1"
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
