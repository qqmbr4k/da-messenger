import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import ChatWindow from '../components/ChatWindow'
import RoomCatalog from '../components/RoomCatalog'
import ContactsPanel from '../components/ContactsPanel'
import SessionsPanel from '../components/SessionsPanel'
import ProfilePanel from '../components/ProfilePanel'
import XmppAdminPanel from '../components/XmppAdminPanel'
import NotificationToast from '../components/NotificationToast'
import { getSocket } from '../lib/socket'
import { usePresenceStore } from '../store/presence'
import { useUnreadStore } from '../store/unread'
import { useAuthStore } from '../store/auth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useActivityHeartbeat } from '../hooks/useActivityHeartbeat'
import { Message } from '../lib/types'

export default function ChatLayout() {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const setStatus = usePresenceStore(s => s.setStatus)
  const { increment, markRead } = useUnreadStore()
  const userId = useAuthStore(s => s.user?.id)
  const navigate = useNavigate()

  useDocumentTitle()

  const handleTabVisible = useCallback(() => {
    const socket = getSocket()
    if (activeRoomId) socket.emit('join_room', activeRoomId)
  }, [activeRoomId])

  useActivityHeartbeat(handleTabVisible)

  useEffect(() => {
    const socket = getSocket()

    socket.on('presence', ({ userId: uid, status }: { userId: string; status: 'online' | 'afk' | 'offline' }) => {
      setStatus(uid, status)
    })

    socket.on('message', (msg: Message & { roomId?: string }) => {
      const msgRoomId = (msg as any).roomId as string | undefined
      if (!msgRoomId || msgRoomId === activeRoomId) return
      if (msg.author?.id !== userId) increment(msgRoomId)
    })

    return () => {
      socket.off('presence')
      socket.off('message')
    }
  }, [activeRoomId, userId])

  useEffect(() => {
    if (activeRoomId) navigate('/')
  }, [activeRoomId])

  function selectRoom(id: string) {
    setActiveRoomId(id)
    markRead(id, 0)
  }

  return (
    <div className="flex h-screen bg-[#313338] overflow-hidden">
      <NotificationToast />
      <Sidebar activeRoomId={activeRoomId} onSelectRoom={selectRoom} />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Routes>
          <Route path="/" element={activeRoomId
            ? <ChatWindow roomId={activeRoomId} onRoomDeleted={() => setActiveRoomId(null)} />
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
      <img src="/logo.png" alt="DAMessenger" className="w-20 h-20 opacity-20 mb-6" />
      <h2 className="text-2xl font-bold text-white mb-2">Welcome to DAMessenger</h2>
      <p className="text-[#949ba4] text-base mb-8 max-w-sm">
        Select a channel from the sidebar to start chatting, or browse available rooms.
      </p>
      <button
        onClick={onBrowse}
        className="bg-[#5865f2] hover:bg-[#4752c4] text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
      >
        Browse Channels
      </button>
    </div>
  )
}
