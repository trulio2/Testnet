import IoC from '@/modules/ioc'
import { type ISessionService, SERVICES } from '@/types'

const sessionService = IoC.getOrCreateInstance<ISessionService>(
  SERVICES.SESSION
)

export default function useSessionStatus() {
  return sessionService.getStatus()
}
