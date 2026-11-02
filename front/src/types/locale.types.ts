export type Locale = 'en' | 'pt'

interface IPages {
  home: {}
  wallet: {
    title: string
    description: string
    reset: string
    resetConfirm: string
  }
  changelog: {}
}

interface INav {
  home: string
  wallet: string
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
    liquidation: string
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
    margin: string
    buyingPower: string
    leverage: string
    leverageRejected: string
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
    addFunds: string
  }
  walletBalance: {
    usedFor: string
  }
  depositForm: {
    title: string
    currency: string
    amount: string
    submit: string
    added: string
    invalidAmount: string
  }
  fundsHistory: {
    title: string
    filter: string
    all: string
    time: string
    type: string
    market: string
    currency: string
    amount: string
    balance: string
    initial: string
    deposit: string
    trade: string
    liquidation: string
    lossCovered: string
    empty: string
  }
  liquidation: {
    message: string
    dismiss: string
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
    liquidationPrice: string
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
    liquidation: string
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
