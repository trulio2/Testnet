import IoC from '@/modules/ioc'
import { type IMarketService, type ITradingService, SERVICES } from '@/types'

export async function init() {
  IoC.getOrCreateInstance<IMarketService>(SERVICES.MARKET).start()
  IoC.getOrCreateInstance<ITradingService>(SERVICES.TRADING).start()
}
