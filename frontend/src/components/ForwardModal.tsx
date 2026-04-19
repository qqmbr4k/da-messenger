import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { Message } from '../lib/types'

interface Room {
  id: string
  name: string
  description: string
  type: string
}

interface Props {
  message: Message
  currentRoomId: string
  onClose: () => void
  onForward: (targetRoomId: string) => Promise<void>
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function ForwardModal({ message, currentRoomId, onClose, onForward }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [forwarding, setForwarding] = useState(false)

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ['my-rooms'],
    queryFn: () => api.get('/rooms/my').then(r => r.data),
  })

  const filtered = rooms
    .filter(r => r.id !== currentRoomId)
    .filter(r => {
      const name = r.type === 'DIRECT' ? r.description : r.name
      return name.toLowerCase().includes(search.toLowerCase())
    })

  async function handleForward() {
    if (!selected) return
    setForwarding(true)
    try {
      await onForward(selected)
    } finally {
      setForwarding(false)
    }
  }

  const hasAttachments = message.attachments && message.attachments.length > 0
  const imageAttachments = message.attachments?.filter(a => a.mimeType.startsWith('image/')) ?? []
  const fileAttachments = message.attachments?.filter(a => !a.mimeType.startsWith('image/')) ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#313338] rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1f22]">
          <h2 className="text-white font-semibold text-base flex items-center gap-2">
            <svg className="w-4 h-4 text-[#5865f2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Forward Message
          </h2>
          <button onClick={onClose} className="text-[#6b6f78] hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Message preview */}
        <div className="mx-4 mt-4 rounded-lg border border-[#3f4248] bg-[#2b2d31] overflow-hidden">
          <div className="px-3 py-2.5 border-l-4 border-[#5865f2]">
            <p className="text-[12px] text-[#949ba4] mb-0.5 font-semibold">{message.author.username}</p>
            {message.content && (
              <p className="text-[13px] text-[#c8cdd5] line-clamp-2 leading-snug">{message.content}</p>
            )}
          </div>

          {/* Image attachments grid */}
          {imageAttachments.length > 0 && (
            <div className={`grid gap-0.5 ${imageAttachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} max-h-48 overflow-hidden`}>
              {imageAttachments.slice(0, 4).map((att, i) => (
                <div key={att.id} className="relative bg-[#1e1f22]">
                  <img
                    src={`/api/rooms/${currentRoomId}/files/${att.id}`}
                    alt={att.originalName}
                    className="w-full h-32 object-cover"
                  />
                  {i === 3 && imageAttachments.length > 4 && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-lg">
                      +{imageAttachments.length - 4}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* File attachments */}
          {fileAttachments.length > 0 && (
            <div className="px-3 py-2 space-y-1.5 border-t border-[#1e1f22]/60">
              {fileAttachments.map(att => (
                <div key={att.id} className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-[#5865f2]/20 rounded-lg flex items-center justify-center shrink-0 text-sm">
                    {att.mimeType.includes('pdf') ? '📕' : att.mimeType.includes('video') ? '🎥' : att.mimeType.includes('audio') ? '🎵' : '📄'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[#c8cdd5] text-[12px] font-medium truncate">{att.originalName}</p>
                    <p className="text-[#6b6f78] text-[11px]">{formatBytes(att.size)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!message.content && !hasAttachments && (
            <p className="px-3 py-2 text-[#6b6f78] text-[13px] italic">Empty message</p>
          )}
        </div>

        {hasAttachments && (
          <p className="px-4 pt-2 text-[11px] text-[#6b6f78]">
            {message.attachments.length} file{message.attachments.length !== 1 ? 's' : ''} will be included
          </p>
        )}

        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search rooms or conversations..."
            className="w-full bg-[#1e1f22] border border-[#3f4248] rounded-lg px-3 py-2 text-sm text-[#dce0e8] placeholder-[#6b6f78] outline-none focus:border-[#5865f2] transition-colors"
          />
        </div>

        {/* Room list */}
        <div className="max-h-56 overflow-y-auto px-4 pb-2">
          {filtered.length === 0 ? (
            <p className="text-[#6b6f78] text-sm text-center py-4">No rooms found</p>
          ) : (
            filtered.map(r => {
              const name = r.type === 'DIRECT' ? r.description : `# ${r.name}`
              const isDirect = r.type === 'DIRECT'
              return (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors mb-0.5 ${
                    selected === r.id
                      ? 'bg-[#5865f2]/20 border border-[#5865f2]/40'
                      : 'hover:bg-[#3f4248] border border-transparent'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold ${
                    isDirect ? 'bg-[#2b2d31] text-[#949ba4]' : 'bg-[#5865f2]/20 text-[#5865f2]'
                  }`}>
                    {isDirect ? '💬' : '#'}
                  </div>
                  <span className="text-[#dce0e8] text-sm font-medium truncate">{name}</span>
                  {selected === r.id && (
                    <svg className="w-4 h-4 text-[#5865f2] ml-auto shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-4 border-t border-[#1e1f22]">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-[#949ba4] hover:text-white hover:bg-[#3f4248] transition-colors border border-[#3f4248]"
          >
            Cancel
          </button>
          <button
            onClick={handleForward}
            disabled={!selected || forwarding}
            className="flex-1 py-2 rounded-lg text-sm font-semibold bg-[#5865f2] hover:bg-[#4752c4] text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {forwarding ? 'Forwarding…' : 'Forward'}
          </button>
        </div>
      </div>
    </div>
  )
}
