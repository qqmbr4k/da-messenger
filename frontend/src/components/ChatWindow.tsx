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
import ForwardModal from './ForwardModal'
import { useCallStore } from '../store/call'

type Panel = 'none' | 'files' | 'members'

interface Room {
  id: string
  name: string
  description: string
  type: string
  ownerId: string | null
  admins: { userId: string }[]
  members: { userId: string; user: { id: string; username: string } }[]
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
  initialSeq?: number
  initialMsgId?: string
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
  return diff < 5 * 60 * 1000
}

// ──────────────────────────────────────────────
// FilesPanel
// ──────────────────────────────────────────────

function FilesPanel({ roomId }: { roomId: string }) {
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
      <div className="w-80 border-l border-[#1e1f22] flex items-center justify-center text-[#6b6f78] text-sm bg-[#2b2d31]">
        Loading files...
      </div>
    )
  }

  return (
    <div className="w-80 border-l border-[#1e1f22] flex flex-col bg-[#2b2d31] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1f22] shrink-0">
        <h3 className="font-semibold text-white text-sm">Files</h3>
        <p className="text-[#6b6f78] text-xs mt-0.5">{files.length} file{files.length !== 1 ? 's' : ''}</p>
      </div>
      {files.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#6b6f78] gap-3 px-6 text-center">
          <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <p className="text-sm">No files shared yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {files.map(f => (
            <div key={f.id} className="bg-[#383a40] rounded-lg p-3 group">
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-lg bg-[#2b2d31]">
                  {f.mimeType.startsWith('image/') ? '🖼️' : f.mimeType.includes('pdf') ? '📕' : '📄'}
                </div>
                <div className="flex-1 min-w-0">
                  <a
                    href={`/api/rooms/${roomId}/files/${f.id}`}
                    className="text-[#00aff4] hover:underline text-sm font-medium truncate block"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {f.originalName}
                  </a>
                  <p className="text-[#6b6f78] text-xs mt-0.5">
                    {formatSize(f.size)} · {f.message.author.username}
                  </p>
                  {f.comment && <p className="text-[#949ba4] text-xs italic">{f.comment}</p>}
                  <p className="text-[#4f5258] text-xs">{format(new Date(f.createdAt), 'MMM d, yyyy')}</p>
                </div>
                <a
                  href={`/api/rooms/${roomId}/files/${f.id}`}
                  download={f.originalName}
                  className="opacity-0 group-hover:opacity-100 text-[#949ba4] hover:text-white transition-all"
                  title="Download"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// ChatWindow
// ──────────────────────────────────────────────

export default function ChatWindow({ roomId, onRoomDeleted, initialSeq, initialMsgId }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [panel, setPanel] = useState<Panel>('none')
  const [showManage, setShowManage] = useState(false)
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())
  const [showJumpToBottom, setShowJumpToBottom] = useState(false)
  const [showJumpToPresent, setShowJumpToPresent] = useState(false)
  const [unreadDividerSeq, setUnreadDividerSeq] = useState<number | null>(null)
  const [sendError, setSendError] = useState('')
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  useEffect(() => {
    setMessages([])
    setHasMore(true)
    setReplyTo(null)
    setUnreadDividerSeq(null)
    setPanel('none')
    if (highlightTimer.current) { clearTimeout(highlightTimer.current); highlightTimer.current = null }
    setHighlightedMsgId(null)
    localMaxSeq.current = 0
    initialLoadDone.current = false

    const lastSeen = getLastSeq(roomId)

    if (initialSeq) {
      // Load 30 messages ending at (and including) the target seq
      fetchMessages({ beforeSeq: initialSeq + 1, limit: 30 }).then(msgs => {
        setMessages(msgs)
        setHasMore(msgs.length === 30)
        if (msgs.length > 0) {
          localMaxSeq.current = Math.max(...msgs.map(m => m.seq ?? 0))
        }
        initialLoadDone.current = true
        setShowJumpToPresent(true)  // we're viewing historical, not the latest
        const targetId = initialMsgId ?? msgs.find(m => m.seq === initialSeq)?.id
        setTimeout(() => {
          if (targetId) scrollToMessage(targetId)
          else bottomRef.current?.scrollIntoView()
        }, 100)
      })
    } else {
      fetchMessages({ limit: 30 }).then(msgs => {
        setMessages(msgs)
        setHasMore(msgs.length === 30)
        if (msgs.length > 0) {
          const maxSeq = Math.max(...msgs.map(m => m.seq ?? 0))
          localMaxSeq.current = maxSeq

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
    }
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

  useEffect(() => {
    const socket = getSocket()
    socket.emit('join_room', roomId)

    function onRoomSeq({ roomId: rid, seq }: { roomId: string; seq: number }) {
      if (rid !== roomId) return
      if (seq > localMaxSeq.current && localMaxSeq.current > 0) {
        fillGap(localMaxSeq.current)
      }
    }

    function onMessage(msg: Message & { roomId?: string }) {
      const incomingRoomId = (msg as any).roomId as string | undefined
      if (incomingRoomId && incomingRoomId !== roomId) return

      const incoming = msg.seq ?? 0
      if (incoming > 0 && incoming <= localMaxSeq.current) return

      if (incoming > 0 && localMaxSeq.current > 0 && incoming > localMaxSeq.current + 1) {
        fillGap(localMaxSeq.current)
      }

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
    }

    function onMessageEdited(msg: unknown) {
      const edited = msg as Message
      setMessages(prev => prev.map(m => m.id === edited.id ? { ...m, ...edited } : m))
    }

    function onMessageDeleted({ id }: { id: string }) {
      setMessages(prev => prev.filter(m => m.id !== id))
    }

    function onReactionUpdated({ messageId, reactions }: { messageId: string; reactions: Reaction[]; roomId: string }) {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m))
    }

    function onTyping({ userId: uid, username }: { userId: string; username: string }) {
      if (uid === userId) return
      setTypingUsers(prev => new Set([...prev, username]))
      setTimeout(() => setTypingUsers(prev => { const s = new Set(prev); s.delete(username); return s }), 3000)
    }

    function onAttachmentAdded({ messageId, attachment }: { messageId: string; attachment: Attachment }) {
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m
        if (m.attachments?.some(a => a.id === attachment.id)) return m
        return { ...m, attachments: [...(m.attachments ?? []), attachment] }
      }))
      qc.invalidateQueries({ queryKey: ['room-files', roomId] })
    }

    function makeSystemMsg(text: string): Message {
      return {
        id: `sys-${Date.now()}-${Math.random()}`,
        content: text,
        createdAt: new Date().toISOString(),
        author: { id: 'system', username: 'system' },
        reactions: [],
        attachments: [],
        system: true,
      } as any
    }

    function onMemberJoined({ roomId: rid, username }: { roomId: string; userId: string; username: string }) {
      if (rid !== roomId) return
      setMessages(prev => [...prev, makeSystemMsg(`${username} joined the room`)])
    }

    function onMemberLeft({ roomId: rid, username }: { roomId: string; userId: string; username: string }) {
      if (rid !== roomId) return
      setMessages(prev => [...prev, makeSystemMsg(`${username} left the room`)])
    }

    function onMemberKicked({ roomId: rid, username }: { roomId: string; userId: string; username: string }) {
      if (rid !== roomId) return
      setMessages(prev => [...prev, makeSystemMsg(`${username} was removed from the room`)])
    }

    function onMemberBanned({ roomId: rid, username }: { roomId: string; userId: string; username: string }) {
      if (rid !== roomId) return
      setMessages(prev => [...prev, makeSystemMsg(`${username} was banned`)])
    }

    function onRoomUpdated({ roomId: rid }: { roomId: string }) {
      if (rid !== roomId) return
      qc.invalidateQueries({ queryKey: ['room', roomId] })
      setMessages(prev => [...prev, makeSystemMsg('Room settings were updated')])
    }

    socket.on('room_seq', onRoomSeq)
    socket.on('message', onMessage)
    socket.on('message_edited', onMessageEdited)
    socket.on('message_deleted', onMessageDeleted)
    socket.on('reaction_updated', onReactionUpdated)
    socket.on('typing', onTyping)
    socket.on('attachment_added', onAttachmentAdded)
    socket.on('member_joined', onMemberJoined)
    socket.on('member_left', onMemberLeft)
    socket.on('member_kicked', onMemberKicked)
    socket.on('member_banned', onMemberBanned)
    socket.on('room_updated', onRoomUpdated)

    return () => {
      socket.off('room_seq', onRoomSeq)
      socket.off('message', onMessage)
      socket.off('message_edited', onMessageEdited)
      socket.off('message_deleted', onMessageDeleted)
      socket.off('reaction_updated', onReactionUpdated)
      socket.off('typing', onTyping)
      socket.off('attachment_added', onAttachmentAdded)
      socket.off('member_joined', onMemberJoined)
      socket.off('member_left', onMemberLeft)
      socket.off('member_kicked', onMemberKicked)
      socket.off('member_banned', onMemberBanned)
      socket.off('room_updated', onRoomUpdated)
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
      loadOlderMessages()
    }
  }

  function loadOlderMessages() {
    const el = scrollRef.current
    if (!el || !hasMore || loadingMore) return
    const oldestSeq = messages[0]?.seq ?? undefined
    if (!oldestSeq) return
    setLoadingMore(true)
    const prevHeight = el.scrollHeight
    fetchMessages({ beforeSeq: oldestSeq, limit: 30 }).then(older => {
      setMessages(prev => [...older, ...prev])
      setHasMore(older.length === 30)
      setLoadingMore(false)
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - prevHeight })
    })
  }

  function handleTyping() {
    const socket = getSocket()
    if (typingTimer.current) clearTimeout(typingTimer.current)
    socket.emit('typing', { roomId })
    typingTimer.current = setTimeout(() => { typingTimer.current = null }, 2000)
  }

  async function handleSend(content: string, files: File[], comments: string[] = []) {
    if (content.length > 3072) {
      setSendError('Message is too long (max 3 KB)')
      return
    }
    setSendError('')
    const msg = await api.post(`/rooms/${roomId}/messages`, {
      content,
      replyToId: replyTo?.id || null,
    }).then(r => r.data as Message)

    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev
      const withReactions = { ...msg, reactions: msg.reactions ?? [], attachments: msg.attachments ?? [] }
      return [...prev, withReactions]
    })

    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx]
      const form = new FormData()
      form.append('file', file)
      form.append('messageId', msg.id)
      if (comments[idx]) form.append('comment', comments[idx])
      const { data: att } = await api.post(`/rooms/${roomId}/files`, form)
      setMessages(prev => prev.map(m => {
        if (m.id !== msg.id) return m
        if (m.attachments?.some(a => a.id === att.id)) return m
        return { ...m, attachments: [...(m.attachments ?? []), att] }
      }))
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

  function scrollToMessage(messageId: string) {
    const el = scrollRef.current?.querySelector(`[data-message-id="${messageId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
      setHighlightedMsgId(messageId)
      highlightTimer.current = setTimeout(() => setHighlightedMsgId(null), 1500)
    } else {
      setSendError('Original message is not loaded — scroll up to find it')
      setTimeout(() => setSendError(''), 3000)
    }
  }

  async function handleForward(targetRoomId: string) {
    if (!forwardMsg) return
    await api.post(`/rooms/${roomId}/messages/${forwardMsg.id}/forward`, { targetRoomId })
    setForwardMsg(null)
    setSendError('')
    // Brief success feedback reusing the error slot with a neutral colour class swap handled by green text below
    const msg = 'Message forwarded'
    setSendError(msg)
    setTimeout(() => setSendError(prev => prev === msg ? '' : prev), 2000)
  }

  function togglePanel(p: Panel) {
    setPanel(prev => prev === p ? 'none' : p)
  }

  const setCall = useCallStore(s => s.set)

  const isOwner = room?.ownerId === userId
  const isAdmin = room?.admins?.some(a => a.userId === userId) ?? false
  const isDirect = room?.type === 'DIRECT'
  const roomDisplayName = isDirect ? room?.description : room?.name
  const dmPeer = isDirect ? room?.members?.find(m => m.userId !== userId) : undefined

  function startVoiceCall() {
    if (!dmPeer) return
    setCall({ status: 'calling', remoteUserId: dmPeer.userId, remoteUsername: dmPeer.user.username, isVideo: false })
  }

  function startVideoCall() {
    if (!dmPeer) return
    setCall({ status: 'calling', remoteUserId: dmPeer.userId, remoteUsername: dmPeer.user.username, isVideo: true })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#313338]">
      {/* Header */}
      <div className="bg-[#313338] border-b border-[#1e1f22] px-4 h-[49px] flex items-center shrink-0 shadow-sm gap-3">
        {/* Channel name */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isDirect ? (
            <svg className="w-5 h-5 text-[#949ba4] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          ) : (
            <span className="text-[#949ba4] text-xl font-light shrink-0 leading-none">#</span>
          )}
          <span className="font-bold text-white text-[15px] truncate">{roomDisplayName}</span>
          {room?.description && !isDirect && (
            <>
              <div className="w-px h-4 bg-[#3f4248] shrink-0" />
              <span className="text-[#949ba4] text-sm truncate hidden lg:block">{room.description}</span>
            </>
          )}
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          {isDirect && (
            <>
              <HeaderIconButton onClick={startVoiceCall} title="Voice Call" data-testid="voice-call-btn" disabled={!dmPeer}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </HeaderIconButton>
              <HeaderIconButton onClick={startVideoCall} title="Video Call" data-testid="video-call-btn" disabled={!dmPeer}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </HeaderIconButton>
              <div className="w-px h-5 bg-[#3f4248] mx-1" />
            </>
          )}
          {!isDirect && (
            <HeaderIconButton
              active={panel === 'members'}
              onClick={() => togglePanel('members')}
              title="Members"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </HeaderIconButton>
          )}
          <HeaderIconButton
            active={panel === 'files'}
            onClick={() => togglePanel('files')}
            title="Files"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </HeaderIconButton>
          {!isDirect && (
            <>
              <div className="w-px h-5 bg-[#3f4248] mx-1" />
              <button
                onClick={() => setShowManage(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm text-[#949ba4] hover:text-white hover:bg-[#3f4248] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main content area with optional side panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex flex-col flex-1 overflow-hidden relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto py-4 space-y-0"
          >
            {hasMore && (
              <div className="flex justify-center py-3">
                <button
                  onClick={loadOlderMessages}
                  disabled={loadingMore}
                  className="text-xs text-[#5865f2] hover:text-[#7289da] disabled:opacity-50 px-4 py-1.5 rounded-full border border-[#5865f2]/30 hover:border-[#5865f2] transition-colors"
                >
                  {loadingMore ? 'Loading…' : '↑ Load older messages'}
                </button>
              </div>
            )}
            {!hasMore && messages.length > 0 && (
              <div className="px-4 py-6 mb-2">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#5865f2] to-violet-600 flex items-center justify-center text-3xl mb-4 shadow-lg">
                  {isDirect ? '💬' : <span className="text-white font-bold text-2xl">#</span>}
                </div>
                <p className="font-extrabold text-white text-2xl leading-tight">
                  {isDirect ? room?.description : `# ${room?.name}`}
                </p>
                <p className="text-[#949ba4] text-sm mt-1.5">
                  {isDirect
                    ? 'This is the beginning of your direct message history.'
                    : `This is the very beginning of the #${room?.name} room.${room?.description ? ` ${room.description}` : ''}`}
                </p>
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
                  {(msg as any).system ? (
                    <div className="flex items-center gap-3 px-4 my-1.5">
                      <div className="flex-1 h-px bg-[#3f4248]/50" />
                      <span className="text-xs text-[#6b6f78] italic bg-[#313338] px-2 shrink-0">{msg.content}</span>
                      <div className="flex-1 h-px bg-[#3f4248]/50" />
                    </div>
                  ) : (
                    <MessageItem
                      message={msg}
                      roomId={roomId}
                      isAdmin={isAdmin}
                      isGrouped={grouped}
                      onReply={() => setReplyTo(msg)}
                      onForward={() => setForwardMsg(msg)}
                      onDeleted={id => setMessages(prev => prev.filter(m => m.id !== id))}
                      onEdited={updated => setMessages(prev => prev.map(m => m.id === updated.id ? updated : m))}
                      onReactionUpdate={handleReactionUpdate}
                      onScrollToReply={scrollToMessage}
                      highlighted={highlightedMsgId === msg.id}
                    />
                  )}
                </div>
              )
            })}

            {typingUsers.size > 0 && (
              <div className="flex items-center gap-2 px-4 py-1 text-[13px] text-[#949ba4]">
                <span className="flex gap-0.5 items-center">
                  <span className="w-1.5 h-1.5 bg-[#949ba4] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-[#949ba4] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-[#949ba4] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                <span className="italic">
                  {[...typingUsers].join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
                </span>
              </div>
            )}
            <div ref={bottomRef} className="h-4" />
          </div>

          {showJumpToPresent && (
            <button
              onClick={() => {
                setShowJumpToPresent(false)
                fetchMessages({ limit: 30 }).then(msgs => {
                  setMessages(msgs)
                  setHasMore(msgs.length === 30)
                  if (msgs.length > 0) localMaxSeq.current = Math.max(...msgs.map(m => m.seq ?? 0))
                  setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
                })
              }}
              className="absolute bottom-32 right-4 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-semibold rounded-full px-3 py-1.5 shadow-lg transition-colors flex items-center gap-1.5 z-10"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 15l-7-7-7 7" />
              </svg>
              Jump to present
            </button>
          )}

          {showJumpToBottom && (
            <button
              data-testid="jump-to-bottom"
              onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="absolute bottom-24 right-4 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-semibold rounded-full px-3 py-1.5 shadow-lg transition-colors flex items-center gap-1.5 z-10"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
              Jump to latest
            </button>
          )}

          {/* Reply bar */}
          {replyTo && (
            <div className="bg-[#2b2d31] border-t border-[#1e1f22] px-4 py-2 flex items-center justify-between text-sm shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 text-[#5865f2] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                <span className="text-[#949ba4] truncate">
                  Replying to <span className="text-white font-semibold">{replyTo.author.username}</span>
                  <span className="text-[#6b6f78] ml-1">— {replyTo.content.slice(0, 80)}</span>
                </span>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-[#6b6f78] hover:text-white ml-2 shrink-0 leading-none p-1 rounded hover:bg-[#3f4248] transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {sendError && <p className={`text-xs px-4 pb-1 ${sendError === 'Message forwarded' ? 'text-green-400' : 'text-red-400'}`}>{sendError}</p>}
          <MessageInput key={roomId} onSend={handleSend} roomId={roomId} onTyping={handleTyping} members={room?.members?.map(m => m.user) ?? []} />
        </div>

        {/* Side panel */}
        {panel === 'files' && <FilesPanel roomId={roomId} />}
        {panel === 'members' && !isDirect && <MembersPanel roomId={roomId} />}
      </div>

      {forwardMsg && (
        <ForwardModal
          message={forwardMsg}
          currentRoomId={roomId}
          onClose={() => setForwardMsg(null)}
          onForward={handleForward}
        />
      )}

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

function HeaderIconButton({
  children, title, active, onClick, 'data-testid': testId, disabled,
}: {
  children: React.ReactNode; title: string; active?: boolean; onClick: () => void; 'data-testid'?: string; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      data-testid={testId}
      disabled={disabled}
      className={`w-9 h-9 flex items-center justify-center rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? 'text-white bg-[#3f4248]'
          : 'text-[#949ba4] hover:text-white hover:bg-[#3f4248]'
      }`}
    >
      {children}
    </button>
  )
}
