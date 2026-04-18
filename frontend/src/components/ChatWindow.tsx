import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import api from '../lib/api'
import { getSocket } from '../lib/socket'
import { useAuthStore } from '../store/auth'
import { useUnreadStore } from '../store/unread'
import { Message, Reaction } from '../lib/types'
import MessageItem from './MessageItem'
import MessageInput from './MessageInput'
import MembersPanel from './MembersPanel'
import ManageRoomModal from './ManageRoomModal'

type Tab = 'chat' | 'files' | 'members'

interface Room {
  id: string
  name: string
  description: string
  type: string
  ownerId: string | null
  admins: { userId: string }[]
}

interface Attachment {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  comment: string
  createdAt: string
  message: { id: string; author: { id: string; username: string } }
}

interface Props {
  roomId: string
  onRoomDeleted: () => void
}

function formatDividerDate(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMMM d, yyyy')
}

function isGroupable(prev: Message, curr: Message): boolean {
  if (prev.author.id !== curr.author.id) return false
  if (curr.replyToId) return false
  const diff = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime()
  return diff < 5 * 60 * 1000 // within 5 minutes
}

// ──────────────────────────────────────────────
// FilesTab
// ──────────────────────────────────────────────

function FilesTab({ roomId }: { roomId: string }) {
  const { data: files = [], isLoading } = useQuery<Attachment[]>({
    queryKey: ['room-files', roomId],
    queryFn: () => api.get(`/rooms/${roomId}/files`).then(r => r.data),
  })

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#6b6f78] text-sm">
        Loading files...
      </div>
    )
  }
  if (files.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#6b6f78] gap-3">
        <span className="text-5xl">📂</span>
        <p className="text-sm">No files uploaded yet</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="space-y-2 max-w-2xl">
        {files.map(f => (
          <div key={f.id} className="bg-[#2b2d31] border border-[#3f4248] rounded-xl p-4 flex items-center gap-4 hover:bg-[#32363d] transition-colors">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl bg-[#383a40]">
              {f.mimeType.startsWith('image/') ? '🖼️' : f.mimeType.includes('pdf') ? '📕' : f.mimeType.includes('zip') || f.mimeType.includes('tar') ? '📦' : '📄'}
            </div>
            <div className="flex-1 min-w-0">
              <a
                href={`/api/rooms/${roomId}/files/${f.id}`}
                className="text-[#00aff4] hover:underline text-sm font-semibold truncate block"
                target="_blank"
                rel="noreferrer"
              >
                {f.originalName}
              </a>
              <p className="text-[#6b6f78] text-xs mt-1">
                {formatSize(f.size)} · Uploaded by <span className="text-[#949ba4]">{f.message.author.username}</span> · {format(new Date(f.createdAt), 'MMM d, yyyy')}
              </p>
              {f.comment && <p className="text-[#949ba4] text-xs mt-0.5 italic">{f.comment}</p>}
            </div>
            <a
              href={`/api/rooms/${roomId}/files/${f.id}`}
              download={f.originalName}
              className="text-xs text-[#949ba4] hover:text-white border border-[#3f4248] hover:border-[#5865f2] rounded-lg px-3 py-1.5 transition-colors shrink-0 font-medium"
              title="Download"
            >
              ↓ Download
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// ChatWindow
// ──────────────────────────────────────────────

export default function ChatWindow({ roomId, onRoomDeleted }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [tab, setTab] = useState<Tab>('chat')
  const [showManage, setShowManage] = useState(false)
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())
  const [showJumpToBottom, setShowJumpToBottom] = useState(false)
  const [unreadDividerSeq, setUnreadDividerSeq] = useState<number | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localMaxSeq = useRef<number>(0)
  const initialLoadDone = useRef(false)

  const qc = useQueryClient()
  const userId = useAuthStore(s => s.user?.id)
  const { markRead, increment, getLastSeq } = useUnreadStore()

  const { data: room } = useQuery<Room>({
    queryKey: ['room', roomId],
    queryFn: () => api.get(`/rooms/${roomId}`).then(r => r.data),
  })

  const fetchMessages = useCallback(async (opts: {
    beforeSeq?: number
    afterSeq?: number
    limit?: number
  } = {}) => {
    const params: Record<string, string> = { limit: String(opts.limit ?? 50) }
    if (opts.beforeSeq !== undefined) params.beforeSeq = String(opts.beforeSeq)
    if (opts.afterSeq !== undefined) params.afterSeq = String(opts.afterSeq)
    const { data } = await api.get(`/rooms/${roomId}/messages`, { params })
    return data as Message[]
  }, [roomId])

  const postWatermark = useCallback((seq: number) => {
    api.post(`/rooms/${roomId}/messages/watermark`, { seq }).catch(() => {})
  }, [roomId])

  // Reset tab to 'chat' when switching rooms (avoids showing blank content
  // if previous room had 'members' tab active and new room is a DM)
  useEffect(() => {
    setTab('chat')
  }, [roomId])

  // Initial load
  useEffect(() => {
    setMessages([])
    setHasMore(true)
    setReplyTo(null)
    setUnreadDividerSeq(null)
    localMaxSeq.current = 0
    initialLoadDone.current = false

    const lastSeen = getLastSeq(roomId)

    fetchMessages({ limit: 50 }).then(msgs => {
      setMessages(msgs)
      setHasMore(msgs.length === 50)
      if (msgs.length > 0) {
        const maxSeq = Math.max(...msgs.map(m => m.seq ?? 0))
        localMaxSeq.current = maxSeq

        // Show unread divider if there are unread messages
        if (lastSeen > 0 && lastSeen < maxSeq) {
          const firstUnread = msgs.find(m => (m.seq ?? 0) > lastSeen)
          if (firstUnread) setUnreadDividerSeq(firstUnread.seq ?? null)
        }

        markRead(roomId, maxSeq)
        postWatermark(maxSeq)
      }
      initialLoadDone.current = true
      setTimeout(() => bottomRef.current?.scrollIntoView(), 50)
    })
  }, [roomId])

  const fillGap = useCallback(async (fromSeq: number) => {
    const missed = await fetchMessages({ afterSeq: fromSeq, limit: 100 })
    if (missed.length > 0) {
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id))
        const newOnes = missed.filter(m => !existingIds.has(m.id))
        return [...prev, ...newOnes].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
      })
      const maxSeq = Math.max(...missed.map(m => m.seq ?? 0))
      localMaxSeq.current = maxSeq
    }
  }, [fetchMessages])

  // Socket subscription
  useEffect(() => {
    const socket = getSocket()
    socket.emit('join_room', roomId)

    socket.on('room_seq', ({ roomId: rid, seq }: { roomId: string; seq: number }) => {
      if (rid !== roomId) return
      if (seq > localMaxSeq.current && localMaxSeq.current > 0) {
        fillGap(localMaxSeq.current)
      }
    })

    socket.on('message', (msg: Message & { roomId?: string }) => {
      const incomingRoomId = (msg as any).roomId as string | undefined
      if (incomingRoomId && incomingRoomId !== roomId) return

      const incoming = msg.seq ?? 0
      if (incoming > 0 && incoming <= localMaxSeq.current) return

      if (incoming > 0 && localMaxSeq.current > 0 && incoming > localMaxSeq.current + 1) {
        fillGap(localMaxSeq.current)
      }

      // Ensure reactions array exists on incoming messages
      const msgWithReactions = { ...msg, reactions: msg.reactions ?? [] }

      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev
        return [...prev, msgWithReactions]
      })

      localMaxSeq.current = Math.max(localMaxSeq.current, incoming)

      if (atBottomRef.current) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        if (incoming > 0) {
          markRead(roomId, incoming)
          postWatermark(incoming)
        }
      } else {
        if (msg.author?.id !== userId) increment(roomId)
      }
    })

    socket.on('message_edited', (msg: unknown) => {
      const edited = msg as Message
      setMessages(prev => prev.map(m => m.id === edited.id ? { ...m, ...edited } : m))
    })

    socket.on('message_deleted', ({ id }: { id: string }) => {
      setMessages(prev => prev.filter(m => m.id !== id))
    })

    socket.on('reaction_updated', ({ messageId, reactions }: { messageId: string; reactions: Reaction[]; roomId: string }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m))
    })

    socket.on('typing', ({ userId: uid, username }: { userId: string; username: string }) => {
      if (uid === userId) return
      setTypingUsers(prev => new Set([...prev, username]))
      setTimeout(() => setTypingUsers(prev => { const s = new Set(prev); s.delete(username); return s }), 3000)
    })

    return () => {
      socket.emit('leave_room', roomId)
      socket.off('room_seq')
      socket.off('message')
      socket.off('message_edited')
      socket.off('message_deleted')
      socket.off('reaction_updated')
      socket.off('typing')
    }
  }, [roomId, userId])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    atBottomRef.current = distFromBottom < 100
    setShowJumpToBottom(!atBottomRef.current && distFromBottom > 300)

    if (atBottomRef.current && localMaxSeq.current > 0) {
      markRead(roomId, localMaxSeq.current)
      postWatermark(localMaxSeq.current)
      setUnreadDividerSeq(null)
    }

    if (el.scrollTop < 150 && hasMore && !loadingMore) {
      const oldestSeq = messages[0]?.seq ?? undefined
      if (!oldestSeq) return
      setLoadingMore(true)
      const prevHeight = el.scrollHeight
      fetchMessages({ beforeSeq: oldestSeq, limit: 50 }).then(older => {
        setMessages(prev => [...older, ...prev])
        setHasMore(older.length === 50)
        setLoadingMore(false)
        requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - prevHeight })
      })
    }
  }

  function handleTyping() {
    const socket = getSocket()
    if (typingTimer.current) clearTimeout(typingTimer.current)
    socket.emit('typing', { roomId })
    typingTimer.current = setTimeout(() => { typingTimer.current = null }, 2000)
  }

  async function handleSend(content: string, files: File[]) {
    const msg = await api.post(`/rooms/${roomId}/messages`, {
      content,
      replyToId: replyTo?.id || null,
    }).then(r => r.data as Message)

    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      form.append('messageId', msg.id)
      const { data: att } = await api.post(`/rooms/${roomId}/files`, form)
      setMessages(prev => prev.map(m => m.id === msg.id
        ? { ...m, attachments: [...m.attachments, att] }
        : m
      ))
      qc.invalidateQueries({ queryKey: ['room-files', roomId] })
    }

    setReplyTo(null)
    if (atBottomRef.current) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  function handleReactionUpdate(messageId: string, reactions: Reaction[]) {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m))
  }

  const isOwner = room?.ownerId === userId
  const isAdmin = room?.admins?.some(a => a.userId === userId) ?? false
  const isDirect = room?.type === 'DIRECT'
  const tabs: Tab[] = isDirect ? ['chat', 'files'] : ['chat', 'files', 'members']

  const roomDisplayName = isDirect ? room?.description : `# ${room?.name}`

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#313338]">
      {/* Header */}
      <div className="bg-[#313338] border-b border-[#1e1f22] px-4 shrink-0 shadow-sm">
        <div className="flex items-center justify-between pt-2.5 pb-0 min-h-[44px]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-bold text-white text-[15px] truncate">{roomDisplayName}</span>
            {room?.description && !isDirect && (
              <>
                <span className="text-[#6b6f78] text-sm">|</span>
                <span className="text-[#949ba4] text-sm hidden md:block truncate">{room.description}</span>
              </>
            )}
          </div>
          {!isDirect && (
            <button
              onClick={() => setShowManage(true)}
              className="text-xs text-[#949ba4] hover:text-white border border-[#3f4248] hover:border-[#5865f2] rounded-md px-2.5 py-1 shrink-0 ml-2 transition-colors"
            >
              Settings
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-1 -mx-1">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm capitalize font-medium transition-colors border-b-2 ${
                tab === t
                  ? 'text-white border-[#5865f2]'
                  : 'text-[#949ba4] border-transparent hover:text-[#c8cdd5] hover:border-[#4f5258]'
              }`}
            >
              {t === 'chat' ? '💬 Chat' : t === 'files' ? '📎 Files' : '👥 Members'}
            </button>
          ))}
        </div>
      </div>

      {/* Chat tab */}
      {tab === 'chat' && (
        <div className="flex flex-col flex-1 overflow-hidden relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto py-4 space-y-0"
          >
            {loadingMore && (
              <div className="text-center text-xs text-[#6b6f78] py-3">Loading older messages...</div>
            )}
            {!hasMore && messages.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-5 mb-2">
                <div className="text-4xl">
                  {isDirect ? '💬' : '#'}
                </div>
                <div>
                  <p className="font-bold text-white text-xl">
                    {isDirect ? room?.description : room?.name}
                  </p>
                  <p className="text-[#949ba4] text-sm mt-0.5">
                    {isDirect ? 'This is the beginning of your conversation.' : `This is the beginning of the #${room?.name} channel.`}
                  </p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => {
              const prev = i > 0 ? messages[i - 1] : null
              const prevDate = prev ? new Date(prev.createdAt) : null
              const currDate = new Date(msg.createdAt)
              const showDateDivider = !prevDate || !isSameDay(prevDate, currDate)
              const grouped = !showDateDivider && prev ? isGroupable(prev, msg) : false
              const isUnreadDivider = unreadDividerSeq !== null && msg.seq === unreadDividerSeq

              return (
                <div key={msg.id}>
                  {showDateDivider && (
                    <div className="flex items-center gap-3 px-4 my-4">
                      <div className="flex-1 h-px bg-[#3f4248]" />
                      <span className="text-xs text-[#949ba4] font-medium bg-[#313338] px-2">
                        {formatDividerDate(currDate)}
                      </span>
                      <div className="flex-1 h-px bg-[#3f4248]" />
                    </div>
                  )}
                  {isUnreadDivider && (
                    <div className="flex items-center gap-3 px-4 my-2">
                      <div className="flex-1 h-px bg-[#f23f42]" />
                      <span className="text-xs text-[#f23f42] font-semibold bg-[#313338] px-2 shrink-0">New messages</span>
                      <div className="flex-1 h-px bg-[#f23f42]" />
                    </div>
                  )}
                  <MessageItem
                    message={msg}
                    roomId={roomId}
                    isAdmin={isAdmin}
                    isGrouped={grouped}
                    onReply={() => setReplyTo(msg)}
                    onDeleted={id => setMessages(prev => prev.filter(m => m.id !== id))}
                    onEdited={updated => setMessages(prev => prev.map(m => m.id === updated.id ? updated : m))}
                    onReactionUpdate={handleReactionUpdate}
                  />
                </div>
              )
            })}

            {typingUsers.size > 0 && (
              <div className="flex items-center gap-2 px-4 py-1 text-[13px] text-[#949ba4] italic">
                <span className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 bg-[#949ba4] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-[#949ba4] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-[#949ba4] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                {[...typingUsers].join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
              </div>
            )}
            <div ref={bottomRef} className="h-4" />
          </div>

          {/* Jump to bottom button */}
          {showJumpToBottom && (
            <button
              onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="absolute bottom-24 right-4 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-semibold rounded-full px-3 py-1.5 shadow-lg transition-colors flex items-center gap-1.5 z-10"
            >
              <span>↓</span> Jump to present
            </button>
          )}

          {/* Reply bar */}
          {replyTo && (
            <div className="bg-[#2b2d31] border-t border-[#1e1f22] px-4 py-2 flex items-center justify-between text-sm shrink-0">
              <span className="truncate text-[#949ba4]">
                Replying to <span className="text-white font-semibold">{replyTo.author.username}</span>
                <span className="text-[#6b6f78] ml-1">— {replyTo.content.slice(0, 80)}</span>
              </span>
              <button onClick={() => setReplyTo(null)} className="text-[#6b6f78] hover:text-white ml-2 shrink-0 text-lg leading-none">×</button>
            </div>
          )}

          <MessageInput key={roomId} onSend={handleSend} roomId={roomId} onTyping={handleTyping} />
        </div>
      )}

      {tab === 'files' && <FilesTab roomId={roomId} />}
      {tab === 'members' && !isDirect && <MembersPanel roomId={roomId} />}

      {showManage && room && (
        <ManageRoomModal
          room={room}
          isOwner={isOwner}
          onClose={() => setShowManage(false)}
          onDeleted={() => {
            setShowManage(false)
            qc.invalidateQueries({ queryKey: ['my-rooms'] })
            onRoomDeleted()
          }}
        />
      )}
    </div>
  )
}
