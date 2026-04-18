import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UnreadStore {
  // Unread badge count per room
  counts: Record<string, number>
  // Last seq we've acknowledged reading (mirrors server-side UserRoomWatermark)
  lastSeenSeq: Record<string, number>
  increment: (roomId: string) => void
  markRead: (roomId: string, seq: number) => void
  getLastSeq: (roomId: string) => number
}

export const useUnreadStore = create<UnreadStore>()(
  persist(
    (set, get) => ({
      counts: {},
      lastSeenSeq: {},
      increment: (roomId) =>
        set(s => ({ counts: { ...s.counts, [roomId]: (s.counts[roomId] ?? 0) + 1 } })),
      markRead: (roomId, seq) =>
        set(s => ({
          counts: { ...s.counts, [roomId]: 0 },
          lastSeenSeq: { ...s.lastSeenSeq, [roomId]: Math.max(seq, s.lastSeenSeq[roomId] ?? 0) },
        })),
      getLastSeq: (roomId) => get().lastSeenSeq[roomId] ?? 0,
    }),
    { name: 'unread' }
  )
)
