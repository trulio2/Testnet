import IoC from '@/modules/ioc'
import { type ILocaleService, SERVICES } from '@/types'

const localeService = IoC.getOrCreateInstance<ILocaleService>(SERVICES.LOCALE)

export default function useLocale() {
  return {
    locale: localeService.getLocale(),
    setLocale: localeService.setLocale,
    t: localeService.getTranslation
  }
}
