import {
  ChangelogRepository,
  ChangelogService
} from '@/modules/services/changelog'
import { type IChangelogRepository, REPOSITORIES, SERVICES } from '@/types'

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
