import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { getSocket } from '../lib/socket'
import { useAuthStore } from '../store/auth'
import { useUnreadStore } from '../store/unread'
import { Message } from '../lib/types'
import MessageItem from './MessageItem'
import MessageInput from './MessageInput'
import MembersPanel from './MembersPanel'
import ManageRoomModal from './ManageRoomModal'

interface Room {
  id: string
  name: string
  description: string
  type: string
  ownerId: string | null
  admins: { userId: string }[]
}

interface Props {
  roomId: string
  onRoomDeleted: () => void
}

export default function ChatWindow({ roomId, onRoomDeleted }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Highest seq we currently have in local state
  const localMaxSeq = useRef<number>(0)

  const qc = useQueryClient()
  const userId = useAuthStore(s => s.user?.id)
  const { markRead, increment } = useUnreadStore()

  const { data: room } = useQuery<Room>({
    queryKey: ['room', roomId],
    queryFn: () => api.get(`/rooms/${roomId}`).then(r => r.data),
  })

  // Fetch messages using seq-based pagination
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

  // Post watermark to server (fire-and-forget)
  const postWatermark = useCallback((seq: number) => {
    api.post(`/rooms/${roomId}/messages/watermark`, { seq }).catch(() => {})
  }, [roomId])

  // Initial load
  useEffect(() => {
    setMessages([])
    setHasMore(true)
    setReplyTo(null)
    localMaxSeq.current = 0

    fetchMessages({ limit: 50 }).then(msgs => {
      setMessages(msgs)
      setHasMore(msgs.length === 50)
      if (msgs.length > 0) {
        const maxSeq = Math.max(...msgs.map(m => m.seq ?? 0))
        localMaxSeq.current = maxSeq
        markRead(roomId, maxSeq)
        postWatermark(maxSeq)
      }
      setTimeout(() => bottomRef.current?.scrollIntoView(), 50)
    })
  }, [roomId])

  // Gap fill: fetch messages we missed between lastSeen and current server seq
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

    // Server tells us the current room seq on join — detect if we're behind
    socket.on('room_seq', ({ roomId: rid, seq }: { roomId: string; seq: number }) => {
      if (rid !== roomId) return
      if (seq > localMaxSeq.current && localMaxSeq.current > 0) {
        // We're missing messages — fill the gap via REST
        fillGap(localMaxSeq.current)
      }
    })

    socket.on('message', (msg: Message & { roomId?: string }) => {
      const incomingRoomId = (msg as any).roomId as string | undefined
      if (incomingRoomId && incomingRoomId !== roomId) return

      const incoming = msg.seq ?? 0
      if (incoming > 0 && incoming <= localMaxSeq.current) return // duplicate

      // Gap: incoming seq is not contiguous — fill before appending
      if (incoming > 0 && localMaxSeq.current > 0 && incoming > localMaxSeq.current + 1) {
        fillGap(localMaxSeq.current)
      }

      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev
        return [...prev, msg]
      })

      localMaxSeq.current = Math.max(localMaxSeq.current, incoming)

      if (atBottomRef.current) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        // Mark read immediately when user is at bottom
        if (incoming > 0) {
          markRead(roomId, incoming)
          postWatermark(incoming)
        }
      } else {
        // User scrolled up — show unread badge instead
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
      socket.off('typing')
    }
  }, [roomId, userId])

  // Mark read when user scrolls back to bottom
  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100

    if (atBottomRef.current && localMaxSeq.current > 0) {
      markRead(roomId, localMaxSeq.current)
      postWatermark(localMaxSeq.current)
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
    }

    setReplyTo(null)
    if (atBottomRef.current) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  const isOwner = room?.ownerId === userId
  const isAdmin = room?.admins?.some(a => a.userId === userId) ?? false

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between shrink-0 min-h-[48px]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold truncate">
              {room?.type === 'DIRECT' ? '💬' : '#'}{' '}
              {room?.type === 'DIRECT' ? room.description : room?.name}
            </span>
            {room?.description && room.type !== 'DIRECT' && (
              <span className="text-gray-400 text-sm hidden md:block truncate">{room.description}</span>
            )}
          </div>
          {room?.type !== 'DIRECT' && (
            <button
              onClick={() => setShowManage(true)}
              className="text-xs text-gray-400 hover:text-gray-200 border border-gray-600 rounded px-2 py-1 shrink-0 ml-2"
            >
              Manage
            </button>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {loadingMore && <div className="text-center text-xs text-gray-500 py-2">Loading older messages...</div>}
          {!hasMore && messages.length > 0 && (
            <div className="text-center text-xs text-gray-600 py-3">— Beginning of conversation —</div>
          )}
          {messages.map(msg => (
            <MessageItem
              key={msg.id}
              message={msg}
              roomId={roomId}
              isAdmin={isAdmin}
              onReply={() => setReplyTo(msg)}
              onDeleted={id => setMessages(prev => prev.filter(m => m.id !== id))}
              onEdited={updated => setMessages(prev => prev.map(m => m.id === updated.id ? updated : m))}
            />
          ))}
          {typingUsers.size > 0 && (
            <div className="text-xs text-gray-500 px-4 py-1 italic">
              {[...typingUsers].join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {replyTo && (
          <div className="bg-gray-700 border-t border-gray-600 px-4 py-1.5 flex items-center justify-between text-sm shrink-0">
            <span className="truncate">
              Replying to <b>{replyTo.author.username}</b>:{' '}
              <span className="text-gray-300">{replyTo.content.slice(0, 80)}</span>
            </span>
            <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-white ml-2 shrink-0">×</button>
          </div>
        )}

        <MessageInput onSend={handleSend} roomId={roomId} onTyping={handleTyping} />
      </div>

      {room?.type !== 'DIRECT' && <MembersPanel roomId={roomId} />}

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
