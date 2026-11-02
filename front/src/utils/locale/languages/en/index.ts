import { type ITranslations } from '@/types'

export const en: ITranslations = {
  pages: {
    home: {},
    wallet: {
      title: 'Wallet',
      description:
        'Simulated funds for testing. USD backs BTC/USD and BRL backs USD/BRL.',
      reset: 'Reset account',
      resetConfirm:
        'Reset the account? Balances return to their starting amounts, and positions, open orders, fills and funds history are cleared.'
    },
    changelog: {}
  },
  nav: {
    home: 'Home',
    wallet: 'Wallet',
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
      entry: 'Entry',
      liquidation: 'Liq.'
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
      margin: 'Margin',
      buyingPower: 'Buying power',
      leverage: 'Leverage',
      leverageRejected:
        'Not enough available {quote} for {leverage}x. Add funds or reduce your position.',
      buy: 'Buy / Long',
      sell: 'Sell / Short',
      placed: 'Limit order placed.',
      filled: 'Filled {qty} at {price}.',
      errors: {
        invalidQty: 'Enter a valid size.',
        invalidPrice: 'Enter a valid price.',
        belowMinNotional: 'Order value must be at least {min} {quote}.',
        insufficientMargin:
          'Not enough available {quote}. Add funds in your wallet or raise your leverage.',
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
      addFunds: 'Add funds'
    },
    walletBalance: {
      usedFor: 'Used for {symbols}'
    },
    depositForm: {
      title: 'Add funds',
      currency: 'Currency',
      amount: 'Amount ({currency})',
      submit: 'Add funds',
      added: 'Added {amount} {currency}.',
      invalidAmount: 'Enter an amount between {min} and {max}.'
    },
    fundsHistory: {
      title: 'Funds history',
      filter: 'Filter by currency',
      all: 'All',
      time: 'Time (UTC)',
      type: 'Type',
      market: 'Market',
      currency: 'Currency',
      amount: 'Amount',
      balance: 'Balance',
      initial: 'Starting balance',
      deposit: 'Deposit',
      trade: 'Trade',
      liquidation: 'Liquidation',
      lossCovered: 'Loss covered',
      empty: 'No entries yet.'
    },
    liquidation: {
      message:
        'Your {side} {symbol} position of {qty} was liquidated at {price} {quote}. Your open {quote} orders were cancelled.',
      dismiss: 'Dismiss'
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
      liquidationPrice: 'Liq. price',
      price: 'Price',
      time: 'Time (UTC)',
      liquidity: 'Liquidity',
      fee: 'Fee',
      unrealizedPnl: 'Unrealized PnL',
      realizedPnl: 'Realized PnL',
      long: 'Long',
      short: 'Short',
      buy: 'Buy',
      sell: 'Sell',
      maker: 'Maker',
      taker: 'Taker',
      liquidation: 'Liquidation',
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
