import type { ISessionService, SessionStatus } from '@/types'
import { sessionStore } from './session.store'

const LOCK_NAME = 'testnet-session'

// Held for as long as the tab lives; the browser releases it when the tab closes.
function holdLock() {
  return new Promise<void>(() => {})
}

// Only one tab may run the simulation: two would both fill the same orders and
// overwrite each other's saved account. Other tabs wait and take over in turn.
export default class SessionService implements ISessionService {
  private started = false

  public start(onActivate: () => void): void {
    if (this.started) return

    this.started = true

    const activate = () => {
      onActivate()
      sessionStore.getState().setStatus('active')
    }

    if (!('locks' in navigator)) {
      activate()
      return
    }

    void navigator.locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (lock) {
        activate()
        return holdLock()
      }

      sessionStore.getState().setStatus('blocked')
      void navigator.locks.request(LOCK_NAME, () => {
        activate()
        return holdLock()
      })

      return undefined
    })
  }

  public getStatus(): SessionStatus {
    return sessionStore((state) => state.status)
  }
}
