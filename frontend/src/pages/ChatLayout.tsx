import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
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

  // Called when tab wakes from hibernation — re-join rooms to get fresh seq
  const handleTabVisible = useCallback(() => {
    const socket = getSocket()
    // Re-emit join_room for the active room so server sends us room_seq
    // and we can detect any gap that occurred while hibernated
    if (activeRoomId) socket.emit('join_room', activeRoomId)
  }, [activeRoomId])

  useActivityHeartbeat(handleTabVisible)

  // Global socket listeners (presence + cross-room unread counting)
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

  // Navigate to chat view after activeRoomId is committed to state
  useEffect(() => {
    if (activeRoomId) navigate('/')
  }, [activeRoomId])

  function selectRoom(id: string) {
    setActiveRoomId(id)
    markRead(id, 0) // clear badge; ChatWindow will update to actual seq
  }

  return (
    <div className="flex flex-col h-screen">
      <TopBar />
      <NotificationToast />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeRoomId={activeRoomId} onSelectRoom={selectRoom} />
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={activeRoomId
              ? <ChatWindow roomId={activeRoomId} onRoomDeleted={() => setActiveRoomId(null)} />
              : <WelcomeScreen />
            } />
            <Route path="/rooms" element={<RoomCatalog onJoin={selectRoom} />} />
            <Route path="/contacts" element={<ContactsPanel onOpenDm={selectRoom} />} />
            <Route path="/sessions" element={<SessionsPanel />} />
            <Route path="/profile" element={<ProfilePanel />} />
            <Route path="/xmpp" element={<XmppAdminPanel />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function WelcomeScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
      <img src="/logo.png" alt="DAMessenger" className="w-24 h-24 opacity-30" />
      <p className="text-lg">Select a room or contact to start chatting</p>
    </div>
  )
}
