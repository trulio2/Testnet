// Imported by file, not through the services barrel: the barrel also exports
// hooks that call IoC at module load, which would make this a circular import.
import ChangelogRepository from '@/modules/services/changelog/changelog.repository'
import ChangelogService from '@/modules/services/changelog/changelog.service'
import LocaleService from '@/modules/services/locale/locale.service'
import MarketRepository from '@/modules/services/market/market.repository'
import MarketService from '@/modules/services/market/market.service'
import SessionService from '@/modules/services/session/session.service'
import TradingService from '@/modules/services/trading/trading.service'
import {
  type IChangelogRepository,
  type IMarketRepository,
  type IMarketService,
  REPOSITORIES,
  SERVICES
} from '@/types'

class IoC {
  private instances: Record<string, unknown> = {}

  public getOrCreateInstance<T>(name: string): T {
    const instance = this.instances[name]

    if (instance) return instance as T

    let newInstance: unknown

    switch (name) {
      case SERVICES.CHANGELOG:
        newInstance = new ChangelogService(
          this.getOrCreateInstance<IChangelogRepository>(REPOSITORIES.CHANGELOG)
        )
        break
      case REPOSITORIES.CHANGELOG:
        newInstance = new ChangelogRepository()
        break

      case SERVICES.LOCALE:
        newInstance = new LocaleService()
        break

      case SERVICES.MARKET:
        newInstance = new MarketService(
          this.getOrCreateInstance<IMarketRepository>(REPOSITORIES.MARKET)
        )
        break
      case REPOSITORIES.MARKET:
        newInstance = new MarketRepository()
        break

      case SERVICES.SESSION:
        newInstance = new SessionService()
        break

      case SERVICES.TRADING:
        newInstance = new TradingService(
          this.getOrCreateInstance<IMarketService>(SERVICES.MARKET)
        )
        break
      default:
        break
    }

    this.instances[name] = newInstance

    return newInstance as T
  }

  public cleanUp(name: string): void {
    delete this.instances[name]
  }
}

export default new IoC()
