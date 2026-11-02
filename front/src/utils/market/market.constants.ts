import type { Currency, SymbolConfig, SymbolId, Timeframe } from '@/types'

export const DEFAULT_SYMBOL: SymbolId = 'BTCUSD'
export const MINUTE_CANDLES_PAGE_SIZE = 1000
export const CURRENCIES: Currency[] = ['USD', 'BRL']
export const MAX_DEPOSIT = 1_000_000
export const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 25, 50]

export const SYMBOLS: Record<SymbolId, SymbolConfig> = {
  BTCUSD: {
    id: 'BTCUSD',
    label: 'BTC/USD',
    base: 'BTC',
    quote: 'USD',
    feedSymbol: 'BTCUSDT',
    feedLabel: 'BTC/USDT',
    tickSize: 0.01,
    priceDecimals: 2,
    qtyDecimals: 5,
    minNotional: 5
  },
  USDBRL: {
    id: 'USDBRL',
    label: 'USD/BRL',
    base: 'USD',
    quote: 'BRL',
    feedSymbol: 'USDTBRL',
    feedLabel: 'USDT/BRL',
    tickSize: 0.0001,
    priceDecimals: 4,
    qtyDecimals: 1,
    minNotional: 10
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
