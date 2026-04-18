import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { useAuthStore } from '../store/auth'
import { disconnectSocket } from '../lib/socket'

function InputField({ type = 'text', placeholder, value, onChange, required }: {
  type?: string; placeholder: string; value: string; onChange: (v: string) => void; required?: boolean
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      required={required}
      className="w-full bg-[#383a40] border border-[#4a4d55] rounded-lg px-3 py-2.5 text-sm text-[#dce0e8] placeholder-[#6b6f78] outline-none focus:border-[#5865f2] transition-colors"
    />
  )
}

export default function ProfilePanel() {
  const { user, setUser } = useAuthStore()
  const navigate = useNavigate()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [deletePw, setDeletePw] = useState('')
  const [deleteMsg, setDeleteMsg] = useState('')

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg('')
    if (newPw !== confirmPw) { setPwMsg('Passwords do not match'); return }
    try {
      await api.put('/auth/password', { currentPassword: currentPw, newPassword: newPw })
      setPwMsg('Password changed successfully!')
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (err: any) {
      setPwMsg(err.response?.data?.error || 'Failed')
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault()
    if (!confirm('This will permanently delete your account and all your rooms. Continue?')) return
    try {
      await api.delete('/auth/account', { data: { password: deletePw } })
      disconnectSocket()
      setUser(null)
      navigate('/login')
    } catch (err: any) {
      setDeleteMsg(err.response?.data?.error || 'Failed')
    }
  }

  const initials = user?.username?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#313338]">
      <div className="max-w-md space-y-6">
        {/* Profile header */}
        <div className="bg-[#2b2d31] border border-[#3f4248] rounded-xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#5865f2] to-violet-600 flex items-center justify-center text-2xl font-bold text-white">
              {initials}
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{user?.username}</h1>
              <p className="text-[#949ba4] text-sm">{user?.email}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 bg-[#23a55a] rounded-full" />
                <span className="text-[#23a55a] text-xs font-medium">Online</span>
              </div>
            </div>
          </div>
        </div>

        {/* Change password */}
        <section className="bg-[#2b2d31] border border-[#3f4248] rounded-xl p-5">
          <h2 className="font-bold text-white mb-4">Change Password</h2>
          <form onSubmit={changePassword} className="space-y-3">
            <InputField type="password" placeholder="Current password" value={currentPw} onChange={setCurrentPw} required />
            <InputField type="password" placeholder="New password" value={newPw} onChange={setNewPw} required />
            <InputField type="password" placeholder="Confirm new password" value={confirmPw} onChange={setConfirmPw} required />
            {pwMsg && (
              <p className={`text-sm ${pwMsg.includes('!') ? 'text-[#23a55a]' : 'text-red-400'}`}>{pwMsg}</p>
            )}
            <button type="submit" className="bg-[#5865f2] hover:bg-[#4752c4] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
              Update Password
            </button>
          </form>
        </section>

        {/* Danger zone */}
        <section className="bg-[#2b2d31] border border-red-900/40 rounded-xl p-5">
          <h2 className="font-bold text-red-400 mb-1">Danger Zone</h2>
          <p className="text-[#949ba4] text-sm mb-4">Deleting your account is permanent and cannot be undone.</p>
          <form onSubmit={deleteAccount} className="space-y-3">
            <InputField type="password" placeholder="Confirm your password to delete account" value={deletePw} onChange={setDeletePw} required />
            {deleteMsg && <p className="text-red-400 text-sm">{deleteMsg}</p>}
            <button type="submit" className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
              Delete Account
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
