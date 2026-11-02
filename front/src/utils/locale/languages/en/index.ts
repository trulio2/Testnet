import { type ITranslations } from '@/types'

export const en: ITranslations = {
  pages: {
    home: {},
    changelog: {}
  },
  nav: {
    home: 'Home',
    changelog: 'Changelog'
  },
  components: {
    ticker: {
      symbols: 'Symbols',
      change: '24h change',
      high: '24h high',
      low: '24h low',
      volume: '24h volume'
    },
    connection: {
      connecting: 'Connecting…',
      live: 'Live',
      reconnecting: 'Reconnecting…'
    },
    chart: {
      timeframe: 'Timeframe',
      loading: 'Loading chart',
      feedNote: 'Prices from {feed} on Binance',
      buy: 'Buy',
      sell: 'Sell',
      entry: 'Entry'
    },
    orderForm: {
      title: 'Order',
      type: 'Order type',
      market: 'Market',
      limit: 'Limit',
      size: 'Size ({unit})',
      price: 'Price ({unit})',
      marketNote: 'Fills now at the best available price.',
      orderValue: 'Order value',
      buy: 'Buy / Long',
      sell: 'Sell / Short',
      placed: 'Limit order placed.',
      filled: 'Filled {qty} at {price}.',
      errors: {
        invalidQty: 'Enter a valid size.',
        invalidPrice: 'Enter a valid price.',
        belowMinNotional: 'Order value must be at least {min} {quote}.',
        insufficientMargin: 'Not enough available margin.',
        marketUnavailable: 'Market data is unavailable right now.'
      }
    },
    account: {
      title: 'Account',
      wallet: 'Wallet balance',
      unrealizedPnl: 'Unrealized PnL',
      equity: 'Equity',
      usedMargin: 'Used margin',
      available: 'Available',
      reset: 'Reset account',
      resetConfirm:
        'Reset the account? Positions, open orders and fills will be cleared.'
    },
    session: {
      title: 'Testnet is open in another tab',
      description:
        'Your account runs in one tab at a time. This tab takes over when the other one closes.'
    },
    ordersPanel: {
      positions: 'Positions',
      orders: 'Open orders',
      fills: 'Fills',
      positionsEmpty: 'No open positions.',
      ordersEmpty: 'No open orders.',
      fillsEmpty: 'No fills yet.',
      symbol: 'Symbol',
      side: 'Side',
      size: 'Size',
      entry: 'Entry',
      mark: 'Mark',
      price: 'Price',
      time: 'Time (UTC)',
      liquidity: 'Liquidity',
      fee: 'Fee (USD)',
      unrealizedPnl: 'Unrealized PnL (USD)',
      realizedPnl: 'Realized PnL (USD)',
      long: 'Long',
      short: 'Short',
      buy: 'Buy',
      sell: 'Sell',
      maker: 'Maker',
      taker: 'Taker',
      close: 'Close',
      cancel: 'Cancel'
    },
    orderBook: {
      title: 'Order book',
      price: 'Price',
      size: 'Size',
      total: 'Total',
      spread: 'Spread'
    },
    recentTrades: {
      title: 'Recent trades',
      price: 'Price',
      size: 'Size',
      time: 'Time (UTC)'
    }
  },
  error: {
    connectionError: 'Connection Error',
    retry: 'Retry',
    goToLogin: 'Go to Login'
  }
}
