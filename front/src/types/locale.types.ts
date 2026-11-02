export type Locale = 'en' | 'pt'

interface IPages {
  home: {}
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
    buy: string
    sell: string
    entry: string
  }
  orderForm: {
    title: string
    type: string
    market: string
    limit: string
    size: string
    price: string
    marketNote: string
    orderValue: string
    buy: string
    sell: string
    placed: string
    filled: string
    errors: {
      invalidQty: string
      invalidPrice: string
      belowMinNotional: string
      insufficientMargin: string
      marketUnavailable: string
    }
  }
  account: {
    title: string
    wallet: string
    unrealizedPnl: string
    equity: string
    usedMargin: string
    available: string
    reset: string
    resetConfirm: string
  }
  session: {
    title: string
    description: string
  }
  ordersPanel: {
    positions: string
    orders: string
    fills: string
    positionsEmpty: string
    ordersEmpty: string
    fillsEmpty: string
    symbol: string
    side: string
    size: string
    entry: string
    mark: string
    price: string
    time: string
    liquidity: string
    fee: string
    unrealizedPnl: string
    realizedPnl: string
    long: string
    short: string
    buy: string
    sell: string
    maker: string
    taker: string
    close: string
    cancel: string
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
