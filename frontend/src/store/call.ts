import { create } from 'zustand'

export type CallStatus = 'idle' | 'calling' | 'receiving' | 'connecting' | 'connected'

interface CallStore {
  status: CallStatus
  remoteUserId: string | null
  remoteUsername: string | null
  isVideo: boolean
  incomingSignal: RTCSessionDescriptionInit | null
  set: (patch: Partial<Omit<CallStore, 'set' | 'reset'>>) => void
  reset: () => void
}

export const useCallStore = create<CallStore>(set => ({
  status: 'idle',
  remoteUserId: null,
  remoteUsername: null,
  isVideo: false,
  incomingSignal: null,
  set: patch => set(patch),
  reset: () => set({ status: 'idle', remoteUserId: null, remoteUsername: null, isVideo: false, incomingSignal: null }),
}))
