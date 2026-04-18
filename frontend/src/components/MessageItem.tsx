import { useState } from 'react'
import { format } from 'date-fns'
import api from '../lib/api'
import { useAuthStore } from '../store/auth'
import { Message } from '../lib/types'

interface Props {
  message: Message
  roomId: string
  isAdmin?: boolean
  onReply: () => void
  onDeleted: (id: string) => void
  onEdited: (msg: Message) => void
}

export default function MessageItem({ message: msg, roomId, isAdmin, onReply, onDeleted, onEdited }: Props) {
  const userId = useAuthStore(s => s.user?.id)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(msg.content)

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

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className="group flex gap-2 hover:bg-gray-800/40 rounded px-2 py-1">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 select-none">
        {msg.author.username[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-sm text-white">{msg.author.username}</span>
          <span className="text-xs text-gray-500">{format(new Date(msg.createdAt), 'HH:mm')}</span>
          {msg.editedAt && <span className="text-xs text-gray-600 italic">edited</span>}
        </div>

        {msg.replyTo && !msg.replyTo.deletedAt && (
          <div className="border-l-2 border-blue-700 pl-2 text-sm text-gray-400 mb-1 bg-gray-800/50 rounded-r py-0.5">
            <span className="font-semibold text-blue-400">{msg.replyTo.author.username}:</span>{' '}
            {msg.replyTo.content.slice(0, 100)}
          </div>
        )}

        {editing ? (
          <div className="flex gap-2 mt-1">
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              className="flex-1 bg-gray-700 rounded px-2 py-1 text-sm resize-none outline-none focus:ring-1 focus:ring-blue-500"
              rows={2}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit() }
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <div className="flex flex-col gap-1">
              <button onClick={handleEdit} className="text-xs text-green-400 hover:text-green-300 px-1">Save</button>
              <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-300 px-1">Cancel</button>
            </div>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words text-gray-200">{msg.content}</p>
        )}

        {msg.attachments.map(att => (
          <div key={att.id} className="mt-1.5 border border-gray-700 bg-gray-800/60 rounded-lg p-2 text-sm max-w-sm">
            {att.mimeType.startsWith('image/') ? (
              <a href={`/api/rooms/${roomId}/files/${att.id}`} target="_blank" rel="noreferrer">
                <img
                  src={`/api/rooms/${roomId}/files/${att.id}`}
                  alt={att.originalName}
                  className="max-w-full max-h-64 rounded object-contain"
                />
              </a>
            ) : (
              <a
                href={`/api/rooms/${roomId}/files/${att.id}`}
                className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
              >
                <span className="text-lg">📎</span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{att.originalName}</p>
                  <p className="text-gray-500 text-xs">{formatBytes(att.size)}</p>
                </div>
              </a>
            )}
            {att.comment && <p className="text-gray-400 text-xs mt-1">{att.comment}</p>}
          </div>
        ))}
      </div>

      <div className="hidden group-hover:flex items-start gap-0.5 shrink-0 pt-1">
        <button onClick={onReply} title="Reply" className="text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-700 text-sm">↩</button>
        {canEdit && (
          <button onClick={() => setEditing(true)} title="Edit" className="text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-700 text-sm">✎</button>
        )}
        {canDelete && (
          <button onClick={handleDelete} title="Delete" className="text-red-500 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-gray-700 text-sm">🗑</button>
        )}
      </div>
    </div>
  )
}
