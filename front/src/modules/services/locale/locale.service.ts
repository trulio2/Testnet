import type { ILocaleService, Locale } from '@/types'
import { interpolate, locales, resolve } from '@/utils'
import { localeStore } from './locale.store'

export default class LocaleService implements ILocaleService {
  constructor() {}

  public getLocale(): Locale {
    return localeStore((state) => state.locale)
  }

  public setLocale(newLocale: Locale): void {
    const { setLocale } = localeStore.getState()

    setLocale(newLocale)
  }

  public getTranslation(key: string, values?: Record<string, unknown>): string {
    const message = resolve(locales[localeStore.getState().locale], key)

    if (!message) return key

    return interpolate(message, values)
  }
}
