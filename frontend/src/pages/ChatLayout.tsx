import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import ChatWindow from '../components/ChatWindow'
import SearchModal from '../components/SearchModal'
import RoomCatalog from '../components/RoomCatalog'
import ContactsPanel from '../components/ContactsPanel'
import SessionsPanel from '../components/SessionsPanel'
import ProfilePanel from '../components/ProfilePanel'
import XmppAdminPanel from '../components/XmppAdminPanel'
import NotificationToast from '../components/NotificationToast'
import CallModal from '../components/CallModal'
import { getSocket } from '../lib/socket'
import { usePresenceStore } from '../store/presence'
import { useUnreadStore } from '../store/unread'
import { useAuthStore } from '../store/auth'
import { useCallStore } from '../store/call'
import { useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useActivityHeartbeat } from '../hooks/useActivityHeartbeat'
import { Message } from '../lib/types'

export default function ChatLayout() {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [jumpTarget, setJumpTarget] = useState<{ seq: number | null; msgId: string; key: number } | null>(null)
  const setStatus = usePresenceStore(s => s.setStatus)
  const { increment, markRead } = useUnreadStore()
  const userId = useAuthStore(s => s.user?.id)
  const setCall = useCallStore(s => s.set)
  const callStatus = useCallStore(s => s.status)
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()

  useDocumentTitle()

  // Re-join the active room when switching rooms (fetches room_seq for gap-fill)
  useEffect(() => {
    const socket = getSocket()
    if (!activeRoomId) return
    socket.emit('join_room', activeRoomId)
  }, [activeRoomId])

  const handleTabVisible = useCallback(() => {
    const socket = getSocket()
    if (activeRoomId) socket.emit('join_room', activeRoomId)
  }, [activeRoomId])

  useActivityHeartbeat(handleTabVisible)

  useEffect(() => {
    const socket = getSocket()

    function onPresence({ userId: uid, status }: { userId: string; status: 'online' | 'afk' | 'offline' }) {
      console.log('[presence] received:', uid, status)
      setStatus(uid, status)
    }

    function onRemovedFromRoom({ roomId }: { roomId: string }) {
      qc.invalidateQueries({ queryKey: ['my-rooms'] })
      if (activeRoomId === roomId) {
        setActiveRoomId(null)
        navigate('/')
      }
    }

    function onJoinedRoom({ roomId }: { roomId: string }) {
      qc.invalidateQueries({ queryKey: ['my-rooms'] })
      socket.emit('join_room', roomId)
    }

    function onNewDm({ id }: { id: string }) {
      qc.invalidateQueries({ queryKey: ['my-rooms'] })
      socket.emit('join_room', id)
    }

    function onMessage(msg: Message & { roomId?: string }) {
      const msgRoomId = (msg as any).roomId as string | undefined
      if (!msgRoomId) return
      const activelyViewing = location.pathname === '/' && msgRoomId === activeRoomId
      if (activelyViewing) return
      if (msg.author?.id !== userId) increment(msgRoomId)
    }

    function onMemberEvent({ roomId }: { roomId: string }) {
      qc.invalidateQueries({ queryKey: ['room', roomId] })
      qc.invalidateQueries({ queryKey: ['my-rooms'] })
    }

    function onRoomUpdated({ roomId }: { roomId: string }) {
      qc.invalidateQueries({ queryKey: ['room', roomId] })
      qc.invalidateQueries({ queryKey: ['my-rooms'] })
    }

    socket.on('presence', onPresence)
    socket.on('removed_from_room', onRemovedFromRoom)
    socket.on('joined_room', onJoinedRoom)
    socket.on('message', onMessage)
    socket.on('new_dm', onNewDm)
    socket.on('member_joined', onMemberEvent)
    socket.on('member_left', onMemberEvent)
    socket.on('member_kicked', onMemberEvent)
    socket.on('member_banned', onMemberEvent)
    socket.on('member_role_changed', onMemberEvent)
    socket.on('room_updated', onRoomUpdated)

    return () => {
      socket.off('presence', onPresence)
      socket.off('removed_from_room', onRemovedFromRoom)
      socket.off('joined_room', onJoinedRoom)
      socket.off('message', onMessage)
      socket.off('new_dm', onNewDm)
      socket.off('member_joined', onMemberEvent)
      socket.off('member_left', onMemberEvent)
      socket.off('member_kicked', onMemberEvent)
      socket.off('member_banned', onMemberEvent)
      socket.off('member_role_changed', onMemberEvent)
      socket.off('room_updated', onRoomUpdated)
    }
  }, [activeRoomId, userId, location.pathname])

  // Isolated effect so incoming call offer handling doesn't trigger full handler re-registration
  useEffect(() => {
    const socket = getSocket()
    function onCallOffer({ from, signal, isVideo, fromUsername }: { from: string; signal: RTCSessionDescriptionInit; isVideo: boolean; fromUsername?: string }) {
      if (callStatus !== 'idle') {
        socket.emit('call_busy', { to: from })
        return
      }
      setCall({ status: 'receiving', remoteUserId: from, remoteUsername: fromUsername ?? from, isVideo, incomingSignal: signal })
    }
    socket.on('call_offer', onCallOffer)
    return () => { socket.off('call_offer', onCallOffer) }
  }, [callStatus, setCall])

  function selectRoom(id: string) {
    setActiveRoomId(id)
    markRead(id, 0)
    navigate('/')
  }

  function handleSearchNavigate(roomId: string, seq: number | null, messageId: string) {
    setActiveRoomId(roomId)
    markRead(roomId, 0)
    setJumpTarget({ seq, msgId: messageId, key: Date.now() })
    navigate('/')
  }

  // ⌘K / Ctrl+K to open search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-screen bg-[#313338] overflow-hidden">
      <NotificationToast />
      <CallModal />
      {showSearch && (
        <SearchModal onClose={() => setShowSearch(false)} onNavigate={handleSearchNavigate} />
      )}
      <Sidebar activeRoomId={activeRoomId} onSelectRoom={selectRoom} onOpenSearch={() => setShowSearch(true)} />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Routes>
          <Route path="/" element={activeRoomId
            ? <ChatWindow
                key={`${activeRoomId}-${jumpTarget?.key ?? 0}`}
                roomId={activeRoomId}
                initialSeq={jumpTarget?.seq ?? undefined}
                initialMsgId={jumpTarget?.msgId ?? undefined}
                onRoomDeleted={() => { setActiveRoomId(null); setJumpTarget(null) }}
              />
            : <WelcomeScreen onBrowse={() => navigate('/rooms')} />
          } />
          <Route path="/rooms" element={<RoomCatalog onJoin={selectRoom} />} />
          <Route path="/contacts" element={<ContactsPanel onOpenDm={selectRoom} />} />
          <Route path="/sessions" element={<SessionsPanel />} />
          <Route path="/profile" element={<ProfilePanel />} />
          <Route path="/xmpp" element={<XmppAdminPanel />} />
        </Routes>
      </main>
    </div>
  )
}

function WelcomeScreen({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 bg-[#313338]">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#4a154b] to-[#7c3085] flex items-center justify-center mb-6 shadow-xl">
        <span className="text-white text-3xl font-black">DA</span>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Welcome to DAMessenger</h2>
      <p className="text-[#949ba4] text-sm mb-8 max-w-xs leading-relaxed">
        Select a room from the sidebar to start chatting, or discover rooms to join.
      </p>
      <button
        onClick={onBrowse}
        className="bg-[#007a5a] hover:bg-[#148567] text-white font-semibold px-6 py-2.5 rounded-md transition-colors text-sm"
      >
        Browse Rooms
      </button>
    </div>
  )
}
