import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../lib/api'
import { useAuthStore } from '../store/auth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const setUser = useAuthStore(s => s.setUser)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      setUser(data)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#313338]">
      <div className="w-full max-w-sm">
        <div className="bg-[#2b2d31] border border-[#3f4248] rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-7">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#4a154b] to-[#7c3085] flex items-center justify-center mb-4 shadow-lg">
              <span className="text-white text-2xl font-black">DA</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Welcome back</h1>
            <p className="text-[#949ba4] text-sm mt-1">Sign in to DAMessenger</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full bg-[#383a40] border border-[#4a4d55] rounded-lg px-3 py-2.5 text-[#dce0e8] outline-none focus:border-[#5865f2] transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-[#383a40] border border-[#4a4d55] rounded-lg px-3 py-2.5 text-[#dce0e8] outline-none focus:border-[#5865f2] transition-colors"
              />
            </div>
            {error && <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#5865f2] hover:bg-[#4752c4] py-2.5 rounded-lg font-semibold text-white disabled:opacity-50 transition-colors mt-2"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-[#6b6f78]">
            <Link to="/forgot-password" className="text-[#949ba4] hover:text-white transition-colors">Forgot password?</Link>
          </p>
          <p className="mt-2 text-center text-sm text-[#6b6f78]">
            No account?{' '}
            <Link to="/register" className="text-[#5865f2] hover:underline font-medium">Register</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
