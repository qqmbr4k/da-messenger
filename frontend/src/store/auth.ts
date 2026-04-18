import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  username: string
}

interface AuthStore {
  user: User | null
  setUser: (u: User | null) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    set => ({
      user: null,
      setUser: user => set({ user }),
    }),
    { name: 'auth' }
  )
)
