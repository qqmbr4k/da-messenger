import { create } from 'zustand'

type Status = 'online' | 'afk' | 'offline'

interface PresenceStore {
  statuses: Record<string, Status>
  setStatus: (userId: string, status: Status) => void
}

export const usePresenceStore = create<PresenceStore>(set => ({
  statuses: {},
  setStatus: (userId, status) =>
    set(s => ({ statuses: { ...s.statuses, [userId]: status } })),
}))
