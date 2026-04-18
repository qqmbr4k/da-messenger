import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ChatLayout from './pages/ChatLayout'
import { useEffect } from 'react'
import api from './lib/api'
import { connectSocket, disconnectSocket } from './lib/socket'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const { user, setUser } = useAuthStore()

  useEffect(() => {
    if (!user) return
    connectSocket()
    return () => disconnectSocket()
  }, [user?.id])

  useEffect(() => {
    api.get('/auth/me').then(r => setUser(r.data)).catch(() => setUser(null))
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/*" element={<PrivateRoute><ChatLayout /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
