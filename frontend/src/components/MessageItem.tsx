import { useState } from 'react'
import { format } from 'date-fns'
import api from '../lib/api'
import { useAuthStore } from '../store/auth'
import { Message, Reaction } from '../lib/types'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉']

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-500',
  'from-pink-500 to-rose-600',
  'from-violet-500 to-purple-600',
  'from-cyan-500 to-blue-500',
  'from-yellow-500 to-orange-500',
  'from-teal-500 to-green-600',
]

interface Props {
  message: Message
  roomId: string
  isAdmin?: boolean
  isGrouped?: boolean
  onReply: () => void
  onForward: () => void
  onDeleted: (id: string) => void
  onEdited: (msg: Message) => void
  onReactionUpdate: (messageId: string, reactions: Reaction[]) => void
  onScrollToReply?: (replyToId: string) => void
  highlighted?: boolean
}

function renderMarkdown(text: string, currentUsername?: string | null): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const segments = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g)
  let key = 0
  for (const seg of segments) {
    if (seg.startsWith('```') && seg.endsWith('```')) {
      const code = seg.slice(3, -3).replace(/^\n/, '')
      parts.push(
        <pre key={key++} className="bg-[#0d1117] border border-[#30363d] rounded-md p-3 my-1.5 overflow-x-auto text-[#e6edf3] font-mono text-xs leading-relaxed">
          <code>{code}</code>
        </pre>
      )
    } else if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 2) {
      parts.push(
        <code key={key++} className="bg-[#383a40] text-[#e8912d] rounded px-1.5 py-0.5 font-mono text-[13px]">
          {seg.slice(1, -1)}
        </code>
      )
    } else {
      const inlineParts = seg.split(/(\*\*[^*\n]+\*\*|__[^_\n]+__|_[^_\n]+_|\*[^*\n]+\*|~~[^~\n]+~~|@[a-zA-Z0-9_]+)/g)
      for (const chunk of inlineParts) {
        if ((chunk.startsWith('**') && chunk.endsWith('**')) || (chunk.startsWith('__') && chunk.endsWith('__'))) {
          parts.push(<strong key={key++} className="font-semibold text-white">{chunk.slice(2, -2)}</strong>)
        } else if ((chunk.startsWith('_') && chunk.endsWith('_')) || (chunk.startsWith('*') && chunk.endsWith('*'))) {
          parts.push(<em key={key++}>{chunk.slice(1, -1)}</em>)
        } else if (chunk.startsWith('~~') && chunk.endsWith('~~')) {
          parts.push(<s key={key++} className="opacity-60">{chunk.slice(2, -2)}</s>)
        } else if (/^@[a-zA-Z0-9_]+$/.test(chunk)) {
          const username = chunk.slice(1)
          const isSelf = currentUsername && username.toLowerCase() === currentUsername.toLowerCase()
          parts.push(
            <span
              key={key++}
              className={`inline rounded px-1 py-0.5 text-[14px] font-semibold cursor-default ${
                isSelf
                  ? 'bg-[#5865f2]/30 text-[#8fa3ff]'
                  : 'bg-[#3f4248] text-[#00aff4]'
              }`}
            >
              {chunk}
            </span>
          )
        } else {
          parts.push(<span key={key++}>{chunk}</span>)
        }
      }
    }
  }
  return parts
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function groupReactions(reactions: Reaction[]) {
  const map = new Map<string, { count: number; users: string[]; userIds: string[] }>()
  for (const r of reactions) {
    if (!map.has(r.emoji)) map.set(r.emoji, { count: 0, users: [], userIds: [] })
    const g = map.get(r.emoji)!
    g.count++
    g.users.push(r.user.username)
    g.userIds.push(r.userId)
  }
  return Array.from(map.entries()).map(([emoji, g]) => ({ emoji, ...g }))
}

export default function MessageItem({
  message: msg, roomId, isAdmin, isGrouped, onReply, onForward, onDeleted, onEdited, onReactionUpdate, onScrollToReply, highlighted,
}: Props) {
  const user = useAuthStore(s => s.user)
  const userId = user?.id
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(msg.content)
  const [showReactionPicker, setShowReactionPicker] = useState(false)

  const isOwn = msg.author.id === userId
  const canDelete = isOwn || isAdmin
  const canEdit = isOwn

  async function handleDelete() {
    await api.delete(`/rooms/${roomId}/messages/${msg.id}`)
    onDeleted(msg.id)
  }

  async function handleEdit() {
    const { data } = await api.patch(`/rooms/${roomId}/messages/${msg.id}`, { content: editContent })
    onEdited(data)
    setEditing(false)
  }

  async function handleReaction(emoji: string) {
    setShowReactionPicker(false)
    const { data } = await api.post(`/rooms/${roomId}/messages/${msg.id}/reactions`, { emoji })
    onReactionUpdate(msg.id, data.reactions)
  }

  const reactions = msg.reactions ?? []
  const reactionGroups = groupReactions(reactions)
  const timestamp = format(new Date(msg.createdAt), 'HH:mm')
  const fullTimestamp = format(new Date(msg.createdAt), 'PPpp')
  const colorIdx = msg.author.username.charCodeAt(0) % AVATAR_GRADIENTS.length

  return (
    <div data-message-id={msg.id} className={`group relative flex gap-3 px-4 py-0.5 rounded-lg mx-1 transition-colors duration-700 ${highlighted ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]'}`}>
      {/* Left column: avatar or time gutter */}
      <div className="w-10 shrink-0 flex flex-col items-center pt-1">
        {isGrouped ? (
          <span className="text-[11px] text-[#4f5258] opacity-0 group-hover:opacity-100 transition-opacity w-10 text-right select-none leading-none pt-1">
            {timestamp}
          </span>
        ) : (
          <div
            className={`w-10 h-10 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[colorIdx]} flex items-center justify-center text-[15px] font-bold select-none shadow-sm`}
          >
            {msg.author.username[0].toUpperCase()}
          </div>
        )}
      </div>

      {/* Message body */}
      <div className="flex-1 min-w-0 py-0.5">
        {!isGrouped && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-bold text-[15px] text-white leading-tight">{msg.author.username}</span>
            <span title={fullTimestamp} className="text-[12px] text-[#6b6f78] cursor-default">
              {timestamp}
            </span>
            {msg.editedAt && <span className="text-[11px] text-[#6b6f78] italic">(edited)</span>}
          </div>
        )}

        {/* Forwarded-from banner */}
        {msg.forwardedFrom && (
          <div className="flex items-center gap-1.5 mb-1 text-[12px] text-[#949ba4]">
            <svg className="w-3.5 h-3.5 text-[#5865f2] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Forwarded from <span className="font-semibold text-[#c8cdd5]">{msg.forwardedFrom.author.username}</span></span>
          </div>
        )}

        {/* Reply quote */}
        {msg.replyTo && !msg.replyTo.deletedAt && (
          <div
            className="flex gap-2 items-start mb-1.5 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => onScrollToReply?.(msg.replyTo!.id)}
          >
            <div className="w-0.5 bg-[#4f5460] rounded-full self-stretch shrink-0 mt-1" />
            <div className="text-[13px] text-[#949ba4] leading-snug min-w-0">
              <span className="font-semibold text-[#c8cdd5] mr-1.5">{msg.replyTo.author.username}</span>
              <span className="truncate">{msg.replyTo.content.slice(0, 120)}</span>
            </div>
          </div>
        )}

        {/* Editing */}
        {editing ? (
          <div className="mt-1">
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              className="w-full bg-[#383a40] border border-[#565b66] rounded-lg px-3 py-2 text-[15px] resize-none outline-none focus:border-[#5865f2] text-[#dce0e8] transition-colors"
              rows={3}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit() }
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <div className="flex gap-2 mt-1.5 text-[13px]">
              <button onClick={handleEdit} className="text-green-400 hover:text-green-300 font-semibold">Save</button>
              <span className="text-[#4f5258]">·</span>
              <button onClick={() => setEditing(false)} className="text-[#949ba4] hover:text-white">Cancel</button>
              <span className="text-[#4f5258] text-xs self-center">Esc to cancel</span>
            </div>
          </div>
        ) : (
          <div className="text-[15px] text-[#dce0e8] whitespace-pre-wrap break-words leading-[1.6]">
            {renderMarkdown(msg.content, user?.username)}
          </div>
        )}

        {/* Attachments */}
        {msg.attachments.map(att => (
          <div key={att.id} className="mt-2 max-w-md">
            {att.mimeType.startsWith('image/') ? (
              <a href={`/api/rooms/${roomId}/files/${att.id}`} target="_blank" rel="noreferrer" className="block">
                <img
                  src={`/api/rooms/${roomId}/files/${att.id}`}
                  alt={att.originalName}
                  className="max-w-full max-h-80 rounded-xl border border-[#3f4248] cursor-zoom-in object-contain"
                />
              </a>
            ) : (
              <div className="flex items-center gap-3 bg-[#2b2d31] border border-[#3f4248] rounded-xl p-3">
                <div className="w-10 h-10 bg-[#5865f2] rounded-lg flex items-center justify-center shrink-0 text-xl">
                  📄
                </div>
                <div className="min-w-0 flex-1">
                  <a
                    href={`/api/rooms/${roomId}/files/${att.id}`}
                    className="text-[#00aff4] hover:underline text-sm font-semibold block truncate"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {att.originalName}
                  </a>
                  <p className="text-[#6b6f78] text-xs mt-0.5">{formatBytes(att.size)}</p>
                </div>
                <a
                  href={`/api/rooms/${roomId}/files/${att.id}`}
                  download={att.originalName}
                  className="text-xs text-[#949ba4] hover:text-white border border-[#3f4248] hover:border-[#5865f2] rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
                  title="Download"
                >
                  ↓
                </a>
              </div>
            )}
            {att.comment && <p className="text-[#949ba4] text-xs mt-1 italic">{att.comment}</p>}
          </div>
        ))}

        {/* Reaction chips */}
        {(reactionGroups.length > 0 || showReactionPicker) && (
          <div className="flex flex-wrap gap-1 mt-2 items-center">
            {reactionGroups.map(g => {
              const reacted = g.userIds.includes(userId ?? '')
              return (
                <button
                  key={g.emoji}
                  onClick={() => handleReaction(g.emoji)}
                  title={g.users.join(', ')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm border transition-all ${
                    reacted
                      ? 'bg-[#5865f2]/20 border-[#5865f2]/60 text-white'
                      : 'bg-[#2b2d31] border-[#3f4248] text-[#949ba4] hover:border-[#5865f2]/40 hover:text-white'
                  }`}
                >
                  {g.emoji} <span className="text-xs font-medium ml-0.5">{g.count}</span>
                </button>
              )
            })}
            {showReactionPicker && (
              <div className="flex gap-0.5 bg-[#2b2d31] border border-[#3f4248] rounded-full px-2 py-1 shadow-xl">
                {QUICK_REACTIONS.map(e => (
                  <button key={e} onClick={() => handleReaction(e)} className="text-lg hover:scale-125 transition-transform px-0.5">
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating hover toolbar */}
      <div className="absolute right-3 -top-5 hidden group-hover:flex items-center bg-[#111214] border border-[#3f4248] rounded-lg shadow-2xl px-1 py-1 z-20 gap-0.5">
        {QUICK_REACTIONS.slice(0, 3).map(e => (
          <button
            key={e}
            onClick={() => handleReaction(e)}
            className="text-base hover:scale-125 transition-transform w-8 h-7 flex items-center justify-center rounded hover:bg-[#3f4248]"
          >
            {e}
          </button>
        ))}
        <button
          onClick={() => setShowReactionPicker(v => !v)}
          title="Add reaction"
          className="w-8 h-7 flex items-center justify-center text-[#949ba4] hover:text-white rounded hover:bg-[#3f4248]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        <div className="w-px h-4 bg-[#3f4248] mx-0.5" />
        <button onClick={onReply} title="Reply" className="w-8 h-7 flex items-center justify-center text-[#949ba4] hover:text-white rounded hover:bg-[#3f4248]">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>
        <button onClick={onForward} title="Forward message" className="w-8 h-7 flex items-center justify-center text-[#949ba4] hover:text-white rounded hover:bg-[#3f4248]">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        {canEdit && (
          <button onClick={() => setEditing(true)} title="Edit message" className="w-8 h-7 flex items-center justify-center text-[#949ba4] hover:text-white rounded hover:bg-[#3f4248]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
        {canDelete && (
          <button onClick={handleDelete} title="Delete message" className="w-8 h-7 flex items-center justify-center text-[#949ba4] hover:text-red-400 rounded hover:bg-[#3f4248]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
