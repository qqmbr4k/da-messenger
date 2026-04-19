import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../lib/api'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      await api.post('/auth/register', { email, username, password })
      navigate('/login')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const fields = [
    { label: 'Email', type: 'email', value: email, onChange: setEmail },
    { label: 'Username', type: 'text', value: username, onChange: setUsername },
    { label: 'Password', type: 'password', value: password, onChange: setPassword },
    { label: 'Confirm Password', type: 'password', value: confirm, onChange: setConfirm },
  ]

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#313338]">
      <div className="w-full max-w-sm">
        <div className="bg-[#2b2d31] border border-[#3f4248] rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-7">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#4a154b] to-[#7c3085] flex items-center justify-center mb-4 shadow-lg">
              <span className="text-white text-2xl font-black">DA</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Create an account</h1>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {fields.map(f => (
              <div key={f.label}>
                <label className="block text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-1.5">{f.label}</label>
                <input
                  type={f.type}
                  value={f.value}
                  onChange={e => f.onChange(e.target.value)}
                  required
                  className="w-full bg-[#383a40] border border-[#4a4d55] rounded-lg px-3 py-2.5 text-[#dce0e8] outline-none focus:border-[#5865f2] transition-colors"
                />
              </div>
            ))}
            {error && <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#5865f2] hover:bg-[#4752c4] py-2.5 rounded-lg font-semibold text-white disabled:opacity-50 transition-colors mt-2"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-[#6b6f78]">
            Already have an account?{' '}
            <Link to="/login" className="text-[#5865f2] hover:underline font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
