import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [stage, setStage] = useState<'email' | 'reset'>('email')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const { data } = await api.post('/auth/forgot-password', { email })
      if (data.resetToken) {
        setResetToken(data.resetToken)
        setMsg(`Reset token: ${data.resetToken}`)
        setStage('reset')
      } else {
        setMsg(data.message)
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed')
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    try {
      await api.post('/auth/reset-password', { resetToken, newPassword })
      setDone(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-lg w-full max-w-sm shadow-xl">
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="DAMessenger" className="w-16 h-16 object-contain mb-2" />
          <h1 className="text-2xl font-bold">Reset Password</h1>
        </div>

        {done ? (
          <div className="text-center space-y-3">
            <p className="text-green-400">Password reset successfully!</p>
            <Link to="/login" className="text-blue-400 hover:underline block">Sign in</Link>
          </div>
        ) : stage === 'email' ? (
          <form onSubmit={handleForgot} className="space-y-4">
            <p className="text-sm text-gray-400">Enter your email to get a reset token.</p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full bg-gray-700 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {msg && <p className="text-yellow-300 text-xs break-all bg-gray-700 rounded p-2">{msg}</p>}
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-semibold text-sm">
              Get Reset Token
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <p className="text-xs text-gray-400 break-all bg-gray-700 rounded p-2">Token: {resetToken}</p>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password"
              required
              className="w-full bg-gray-700 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              required
              className="w-full bg-gray-700 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-semibold text-sm">
              Reset Password
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-gray-400">
          <Link to="/login" className="text-blue-400 hover:underline">Back to Sign In</Link>
        </p>
      </div>
    </div>
  )
}
