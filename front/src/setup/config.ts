import IoC from '@/modules/ioc'
import { type IMarketService, SERVICES } from '@/types'

export async function init() {
  IoC.getOrCreateInstance<IMarketService>(SERVICES.MARKET).start()
}
