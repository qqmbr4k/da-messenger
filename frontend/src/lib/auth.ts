import { useNavigate } from 'react-router-dom'
import api from './api'
import { disconnectSocket } from './socket'

export async function signOut(setUser: (u: null) => void, navigate: ReturnType<typeof useNavigate>) {
  try {
    await api.post('/auth/logout')
  } catch {
    // best-effort; proceed with local cleanup regardless
  }
  disconnectSocket()
  setUser(null)
  navigate('/login')
}
