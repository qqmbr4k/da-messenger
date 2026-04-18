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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-semibold mb-4">Create Room</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            placeholder="Room name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full bg-gray-700 rounded px-3 py-2 text-sm outline-none"
          />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full bg-gray-700 rounded px-3 py-2 text-sm outline-none resize-none h-20"
          />
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={type === 'PUBLIC'} onChange={() => setType('PUBLIC')} />
              Public
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={type === 'PRIVATE'} onChange={() => setType('PRIVATE')} />
              Private
            </label>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 rounded">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}
