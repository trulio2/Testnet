import { create } from 'zustand'
import type { SessionState, SessionStatus } from '@/types'

export const sessionStore = create<SessionState>()((set) => ({
  status: 'pending',
  setStatus(status: SessionStatus) {
    set({ status })
  }
}))
