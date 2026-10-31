export type Locale = 'en' | 'pt'

interface IPages {
  home: {
    home: string
  }
  changelog: {}
}

interface INav {
  home: string
  changelog: string
}

interface IComponents {}

interface IError {
  connectionError: string
  retry: string
  goToLogin: string
}

export interface ITranslations {
  pages: IPages
  nav: INav
  components: IComponents
  error: IError
}

export interface ILocaleService {
  getLocale(): Locale
  setLocale(newLocale: Locale): void
  getTranslation(key: string, values?: Record<string, unknown>): string
}

export interface LocaleState {
  locale: Locale
  setLocale(locale: Locale): void
}
