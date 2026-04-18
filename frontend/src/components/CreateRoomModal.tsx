import { useState } from 'react'
import api from '../lib/api'

interface Props {
  onClose: () => void
  onCreate: (room: { id: string; name: string }) => void
}

export default function CreateRoomModal({ onClose, onCreate }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const { data } = await api.post('/rooms', { name, description, type })
      onCreate(data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create room')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#313338] border border-[#3f4248] rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-white mb-1">Create a Channel</h2>
        <p className="text-[#949ba4] text-sm mb-5">Channels are where your team communicates.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-1.5">Channel Name</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6f78]">#</span>
              <input
                placeholder="e.g. general"
                value={name}
                onChange={e => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                required
                className="w-full bg-[#383a40] border border-[#4a4d55] rounded-lg pl-8 pr-3 py-2.5 text-sm text-[#dce0e8] placeholder-[#6b6f78] outline-none focus:border-[#5865f2] transition-colors"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-1.5">Description <span className="text-[#4f5258] normal-case font-normal">(optional)</span></label>
            <textarea
              placeholder="What's this channel about?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-[#383a40] border border-[#4a4d55] rounded-lg px-3 py-2.5 text-sm text-[#dce0e8] placeholder-[#6b6f78] outline-none focus:border-[#5865f2] resize-none h-20 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#949ba4] uppercase tracking-wider mb-2">Privacy</label>
            <div className="space-y-2">
              {([['PUBLIC', '# Public', 'Anyone can find and join'], ['PRIVATE', '🔒 Private', 'Only invited people can join']] as const).map(([val, label, hint]) => (
                <label key={val} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${type === val ? 'border-[#5865f2]/60 bg-[#5865f2]/10' : 'border-[#3f4248] hover:border-[#565b66]'}`}>
                  <input type="radio" checked={type === val} onChange={() => setType(val)} className="accent-[#5865f2]" />
                  <div>
                    <p className="text-sm font-medium text-white">{label}</p>
                    <p className="text-xs text-[#6b6f78]">{hint}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[#949ba4] hover:text-white rounded-lg hover:bg-[#383a40] transition-colors">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm bg-[#5865f2] hover:bg-[#4752c4] text-white font-semibold rounded-lg transition-colors">
              Create Channel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
