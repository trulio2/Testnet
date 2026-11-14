import type { Currency, SymbolConfig, SymbolId, Timeframe } from '@/types'

export const DEFAULT_SYMBOL: SymbolId = 'BTCUSD'
export const MINUTE_CANDLES_PAGE_SIZE = 1000
export const CURRENCIES: Currency[] = ['USD', 'BRL']
export const CURRENCY_SIGNS: Record<Currency, string> = { USD: '$', BRL: 'R$' }
export const MAX_DEPOSIT = 1_000_000
export const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 25, 50]
export const MIN_MAKER_FEE_RATE = -0.01
export const MAX_FEE_RATE = 0.05

export const SYMBOLS: Record<SymbolId, SymbolConfig> = {
  BTCUSD: {
    id: 'BTCUSD',
    label: 'BTC/USD',
    base: 'BTC',
    quote: 'USD',
    feed: 'spot',
    feedSymbol: 'BTCUSDT',
    feedLabel: 'BTC/USDT',
    tickSize: 0.01,
    priceDecimals: 2,
    qtyDecimals: 5,
    minNotional: 5,
    bookSteps: [0.01, 0.1, 0.5, 1, 2.5, 5, 10, 25]
  },
  USDBRL: {
    id: 'USDBRL',
    label: 'USD/BRL',
    base: 'USD',
    quote: 'BRL',
    feed: 'spot',
    feedSymbol: 'USDTBRL',
    feedLabel: 'USDT/BRL',
    tickSize: 0.0001,
    priceDecimals: 4,
    qtyDecimals: 1,
    minNotional: 10,
    bookSteps: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05]
  },
  NVDAUSD: {
    id: 'NVDAUSD',
    label: 'NVDA/USD',
    base: 'NVDA',
    quote: 'USD',
    feed: 'futures',
    feedSymbol: 'NVDAUSDT',
    feedLabel: 'NVDA/USDT',
    tickSize: 0.01,
    priceDecimals: 2,
    qtyDecimals: 2,
    minNotional: 5,
    bookSteps: [0.01, 0.05, 0.1, 0.5, 1, 5]
  },
  TSLAUSD: {
    id: 'TSLAUSD',
    label: 'TSLA/USD',
    base: 'TSLA',
    quote: 'USD',
    feed: 'futures',
    feedSymbol: 'TSLAUSDT',
    feedLabel: 'TSLA/USDT',
    tickSize: 0.01,
    priceDecimals: 2,
    qtyDecimals: 2,
    minNotional: 5,
    bookSteps: [0.01, 0.05, 0.1, 0.5, 1, 5]
  },
  AAPLUSD: {
    id: 'AAPLUSD',
    label: 'AAPL/USD',
    base: 'AAPL',
    quote: 'USD',
    feed: 'futures',
    feedSymbol: 'AAPLUSDT',
    feedLabel: 'AAPL/USDT',
    tickSize: 0.01,
    priceDecimals: 2,
    qtyDecimals: 2,
    minNotional: 5,
    bookSteps: [0.01, 0.05, 0.1, 0.5, 1, 5]
  },
  MSFTUSD: {
    id: 'MSFTUSD',
    label: 'MSFT/USD',
    base: 'MSFT',
    quote: 'USD',
    feed: 'futures',
    feedSymbol: 'MSFTUSDT',
    feedLabel: 'MSFT/USDT',
    tickSize: 0.01,
    priceDecimals: 2,
    qtyDecimals: 2,
    minNotional: 5,
    bookSteps: [0.01, 0.05, 0.1, 0.5, 1, 5]
  },
  GOOGLUSD: {
    id: 'GOOGLUSD',
    label: 'GOOGL/USD',
    base: 'GOOGL',
    quote: 'USD',
    feed: 'futures',
    feedSymbol: 'GOOGLUSDT',
    feedLabel: 'GOOGL/USDT',
    tickSize: 0.01,
    priceDecimals: 2,
    qtyDecimals: 2,
    minNotional: 5,
    bookSteps: [0.01, 0.05, 0.1, 0.5, 1, 5]
  },
  SPYUSD: {
    id: 'SPYUSD',
    label: 'SPY/USD',
    base: 'SPY',
    quote: 'USD',
    feed: 'futures',
    feedSymbol: 'SPYUSDT',
    feedLabel: 'SPY/USDT',
    tickSize: 0.01,
    priceDecimals: 2,
    qtyDecimals: 2,
    minNotional: 5,
    bookSteps: [0.01, 0.1, 0.5, 1, 2.5, 5, 10]
  },
  SPCXUSD: {
    id: 'SPCXUSD',
    label: 'SPCX/USD',
    base: 'SPCX',
    quote: 'USD',
    feed: 'futures',
    feedSymbol: 'SPCXUSDT',
    feedLabel: 'SPCX/USDT',
    tickSize: 0.01,
    priceDecimals: 2,
    qtyDecimals: 2,
    minNotional: 5,
    bookSteps: [0.01, 0.05, 0.1, 0.5, 1, 5]
  },
  XAUUSD: {
    id: 'XAUUSD',
    label: 'XAU/USD',
    base: 'XAU',
    quote: 'USD',
    feed: 'futures',
    feedSymbol: 'XAUUSDT',
    feedLabel: 'XAU/USDT',
    tickSize: 0.01,
    priceDecimals: 2,
    qtyDecimals: 3,
    minNotional: 5,
    bookSteps: [0.01, 0.1, 0.5, 1, 2.5, 5, 10]
  }
}

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400
}
