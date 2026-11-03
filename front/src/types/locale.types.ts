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
    fees: string
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
  indicators: {
    title: string
    show: string
    hide: string
    showAll: string
    hideAll: string
    showList: string
    hideList: string
    settings: string
    remove: string
    defaults: string
    cancel: string
    ok: string
    names: Record<'movingAverage' | 'ichimoku' | 'pivots', string>
    tabs: Record<'inputs' | 'style', string>
    methods: Record<'sma' | 'ema' | 'wma', string>
    sources: Record<
      'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4',
      string
    >
    pivotTypes: Record<
      'traditional' | 'fibonacci' | 'woodie' | 'classic' | 'dm' | 'camarilla',
      string
    >
    pivotTimeframes: Record<'auto' | 'day' | 'week' | 'month' | 'year', string>
    positions: Record<'left' | 'right', string>
    fields: {
      method: string
      length: string
      source: string
      offset: string
      color: string
      lineWidth: string
      conversionPeriods: string
      basePeriods: string
      laggingPeriods: string
      displacement: string
      conversionLine: string
      baseLine: string
      laggingSpan: string
      leadingSpanA: string
      leadingSpanB: string
      cloudUp: string
      cloudDown: string
      type: string
      pivotsTimeframe: string
      pivotsBack: string
      labels: string
      showLabels: string
      showPrices: string
      labelsPosition: string
      levels: string
    }
  }
  feeSettings: {
    title: string
    note: string
    maker: string
    taker: string
    save: string
    defaults: string
    saved: string
    restored: string
    invalid: string
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
    widenSpread: string
    narrowSpread: string
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
