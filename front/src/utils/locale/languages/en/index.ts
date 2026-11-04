import { type ITranslations } from '@/types'

export const en: ITranslations = {
  pages: {
    home: {},
    wallet: {
      title: 'Wallet',
      description:
        'Simulated funds for testing. USD backs BTC/USD and BRL backs USD/BRL. USD bought or sold on USD/BRL spot uses this same USD balance.',
      reset: 'Reset account',
      resetConfirm:
        'Reset the account? Balances return to their starting amounts, and positions, spot holdings, open orders, fills and funds history are cleared.'
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
      liquidation: 'Liq.',
      spot: 'Spot'
    },
    orderForm: {
      title: 'Order',
      type: 'Order type',
      market: 'Market',
      limit: 'Limit',
      size: 'Size ({unit})',
      price: 'Price ({unit})',
      marketNote: 'Fills now at the best available price.',
      mode: 'Mode',
      spot: 'Spot',
      canSpend: 'Can spend ({asset})',
      spotBalance: '{asset} balance',
      canSell: 'Can sell ({asset})',
      buySpot: 'Buy',
      sellSpot: 'Sell',
      orderValue: 'Order value',
      margin: 'Margin',
      buyingPower: 'Buying power',
      fees: 'Maker / taker fee',
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
        insufficientFunds:
          'Not enough available {quote}. Add funds in your wallet.',
        insufficientSpotBalance: 'You can only sell up to {available} {base}.',
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
    indicators: {
      title: 'Indicators',
      show: 'Show',
      hide: 'Hide',
      showAll: 'Show all',
      hideAll: 'Hide all',
      showList: 'Show list ({count})',
      hideList: 'Hide list',
      settings: 'Settings',
      remove: 'Remove',
      defaults: 'Defaults',
      cancel: 'Cancel',
      ok: 'Ok',
      names: {
        movingAverage: 'Moving Average',
        ichimoku: 'Ichimoku Cloud',
        pivots: 'Pivots'
      },
      tabs: { inputs: 'Inputs', style: 'Style' },
      methods: { sma: 'Simple', ema: 'Exponential', wma: 'Weighted' },
      sources: {
        close: 'close',
        open: 'open',
        high: 'high',
        low: 'low',
        hl2: 'hl2',
        hlc3: 'hlc3',
        ohlc4: 'ohlc4'
      },
      pivotTypes: {
        traditional: 'Traditional',
        fibonacci: 'Fibonacci',
        woodie: 'Woodie',
        classic: 'Classic',
        dm: 'DM',
        camarilla: 'Camarilla'
      },
      pivotTimeframes: {
        auto: 'Auto',
        day: 'Daily',
        week: 'Weekly',
        month: 'Monthly',
        year: 'Yearly'
      },
      positions: { left: 'Left', right: 'Right' },
      fields: {
        method: 'Type',
        length: 'Length',
        source: 'Source',
        offset: 'Offset',
        color: 'Color',
        lineWidth: 'Line width',
        conversionPeriods: 'Conversion Line Periods',
        basePeriods: 'Base Line Periods',
        laggingPeriods: 'Lagging Span 2 Periods',
        displacement: 'Displacement',
        conversionLine: 'Conversion Line',
        baseLine: 'Base Line',
        laggingSpan: 'Lagging Span',
        leadingSpanA: 'Leading Span A',
        leadingSpanB: 'Leading Span B',
        cloudUp: 'Cloud, span A above',
        cloudDown: 'Cloud, span B above',
        type: 'Type',
        pivotsTimeframe: 'Pivots Timeframe',
        pivotsBack: 'Number of Pivots Back',
        labels: 'Labels',
        showLabels: 'Show Labels',
        showPrices: 'Show Prices',
        labelsPosition: 'Labels Position',
        levels: 'Levels'
      }
    },
    feeSettings: {
      title: 'Trading fees',
      note: 'Match the fees of another platform. Taker applies to market orders, limit orders that cross the book and liquidations; maker applies to limit orders that rest first. A negative maker fee is a rebate. Changes apply to future fills, and resetting the account keeps them.',
      maker: 'Maker fee (%)',
      taker: 'Taker fee (%)',
      save: 'Save',
      defaults: 'Defaults',
      saved: '{symbol} fees saved.',
      restored: '{symbol} fees restored to the defaults.',
      invalid:
        'Maker fee must be between {minMaker}% and {max}%, and taker fee between 0% and {max}%.'
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
      spotBuy: 'Spot buy',
      spotSell: 'Spot sell',
      empty: 'No entries yet.'
    },
    liquidation: {
      message:
        'Your {side} {symbol} position of {qty} was liquidated at {price} {quote}. Your open {quote} orders were cancelled.',
      dismiss: 'Dismiss'
    },
    simulation: {
      title: 'While you were away',
      running: 'Checking what the market did…',
      checkedUpTo: 'Checked up to {time} UTC',
      failed:
        'Could not load market data. Trading stays paused and this will try again shortly.',
      retry: 'Retry',
      nothingHappened: 'No orders filled and nothing was liquidated.',
      fill: '{market} {side} of {qty} {base} on {symbol} filled at {price} {quote}.',
      cancelled: 'Open orders cancelled: {count}.',
      estimated:
        'Timing estimated: detailed market data is no longer available.',
      close: 'Close'
    },
    session: {
      title: 'Testnet is open in another tab',
      description:
        'Your account runs in one tab at a time. This tab takes over when the other one closes.'
    },
    spotBalance: {
      title: 'Spot {asset}',
      boughtOn: 'Bought on {symbol}',
      available: 'Available to sell',
      avgCost: 'Average cost',
      value: 'Value',
      unrealizedPnl: 'Unrealized PnL'
    },
    ordersPanel: {
      spot: 'Spot',
      spotEmpty: 'No spot holdings.',
      margin: 'Margin',
      market: 'Market',
      balance: 'Balance',
      available: 'Available',
      avgCost: 'Avg. cost',
      value: 'Value',
      sellAll: 'Sell all',
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
      spread: 'Spread',
      widenSpread: 'Increase spread',
      narrowSpread: 'Decrease spread'
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
