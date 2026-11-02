export type SessionStatus = 'pending' | 'active' | 'blocked'

export interface ISessionService {
  start(onActivate: () => void): void
  getStatus(): SessionStatus
}

export interface SessionState {
  status: SessionStatus
  setStatus(status: SessionStatus): void
}
