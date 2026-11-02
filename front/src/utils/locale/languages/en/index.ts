import { type ITranslations } from '@/types'

export const en: ITranslations = {
  pages: {
    home: {
      orderPanelTitle: 'Order',
      orderPanelNote: 'Order entry arrives with the trading simulation.'
    },
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
      feedNote: 'Prices from {feed} on Binance'
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
