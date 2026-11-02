import type { SymbolConfig, SymbolId, Timeframe } from '@/types'

export const DEFAULT_SYMBOL: SymbolId = 'BTCUSD'

export const SYMBOLS: Record<SymbolId, SymbolConfig> = {
  BTCUSD: {
    id: 'BTCUSD',
    label: 'BTC/USD',
    feedSymbol: 'BTCUSDT',
    feedLabel: 'BTC/USDT',
    tickSize: 0.01,
    priceDecimals: 2,
    qtyDecimals: 5
  },
  USDBRL: {
    id: 'USDBRL',
    label: 'USD/BRL',
    feedSymbol: 'USDTBRL',
    feedLabel: 'USDT/BRL',
    tickSize: 0.0001,
    priceDecimals: 4,
    qtyDecimals: 1
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
