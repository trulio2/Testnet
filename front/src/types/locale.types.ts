export type Locale = 'en' | 'pt'

interface IPages {
  home: {
    orderPanelTitle: string
    orderPanelNote: string
  }
  changelog: {}
}

interface INav {
  home: string
  changelog: string
}

interface IComponents {
  ticker: {
    symbols: string
    change: string
    high: string
    low: string
    volume: string
  }
  connection: {
    connecting: string
    live: string
    reconnecting: string
  }
  chart: {
    timeframe: string
    loading: string
    feedNote: string
  }
  orderBook: {
    title: string
    price: string
    size: string
    total: string
    spread: string
  }
  recentTrades: {
    title: string
    price: string
    size: string
    time: string
  }
}

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
