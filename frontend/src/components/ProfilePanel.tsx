import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { useAuthStore } from '../store/auth'
import { disconnectSocket } from '../lib/socket'

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
      setPwMsg('Password changed!')
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

  return (
    <div className="p-6 max-w-md space-y-8">
      <div>
        <h1 className="text-xl font-semibold mb-2">Profile</h1>
        <p className="text-gray-400 text-sm">Username: <span className="text-white">{user?.username}</span></p>
        <p className="text-gray-400 text-sm">Email: <span className="text-white">{user?.email}</span></p>
      </div>

      <section>
        <h2 className="font-semibold mb-3">Change Password</h2>
        <form onSubmit={changePassword} className="space-y-3">
          <input type="password" placeholder="Current password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required
            className="w-full bg-gray-700 rounded px-3 py-2 text-sm outline-none" />
          <input type="password" placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} required
            className="w-full bg-gray-700 rounded px-3 py-2 text-sm outline-none" />
          <input type="password" placeholder="Confirm new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required
            className="w-full bg-gray-700 rounded px-3 py-2 text-sm outline-none" />
          {pwMsg && <p className={pwMsg.includes('!') ? 'text-green-400' : 'text-red-400'} >{pwMsg}</p>}
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm">Update Password</button>
        </form>
      </section>

      <section>
        <h2 className="font-semibold mb-3 text-red-400">Delete Account</h2>
        <form onSubmit={deleteAccount} className="space-y-3">
          <input type="password" placeholder="Confirm your password" value={deletePw} onChange={e => setDeletePw(e.target.value)} required
            className="w-full bg-gray-700 rounded px-3 py-2 text-sm outline-none" />
          {deleteMsg && <p className="text-red-400 text-sm">{deleteMsg}</p>}
          <button type="submit" className="bg-red-700 hover:bg-red-600 px-4 py-2 rounded text-sm">Delete Account</button>
        </form>
      </section>
    </div>
  )
}
