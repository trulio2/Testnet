import type {
  Candle,
  CandleInterval,
  FetchCandlesOptions,
  SymbolId,
  Trade
} from '@/types'

export type PricePoint = [time: number, price: number]

const INTERVAL_MS: Partial<Record<CandleInterval, number>> = {
  '1d': 86_400_000,
  '1h': 3_600_000,
  '1m': 60_000,
  '1s': 1_000
}

interface HistoryOptions {
  // Older than these, the exchange no longer has the data.
  secondsSince?: number
  tradesSince?: number
}

// An exchange's history built from a list of trades, with the same limits and
// inclusive time ranges as the real thing.
export function createHistory(
  points: Partial<Record<SymbolId, PricePoint[]>>,
  { secondsSince = 0, tradesSince = 0 }: HistoryOptions = {}
) {
  const requests: string[] = []

  const getTrades = (symbol: SymbolId): Trade[] =>
    (points[symbol] ?? []).map(([time, price], id) => ({
      id,
      price,
      qty: 1,
      time,
      side: 'buy'
    }))

  return {
    requests,
    async getHistoryCandles(
      symbol: SymbolId,
      interval: CandleInterval,
      { limit, startTime = 0, endTime = Infinity }: FetchCandlesOptions
    ): Promise<Candle[]> {
      requests.push(`${symbol} ${interval}`)

      const ms = INTERVAL_MS[interval] as number
      const candles = new Map<number, Candle>()

      for (const { price, time } of getTrades(symbol)) {
        const open = Math.floor(time / ms) * ms
        const candle = candles.get(open)

        if (interval === '1s' && open < secondsSince) continue

        candles.set(
          open,
          candle
            ? {
                ...candle,
                high: Math.max(candle.high, price),
                low: Math.min(candle.low, price),
                close: price
              }
            : {
                time: open / 1000,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: 1
              }
        )
      }

      return [...candles.values()]
        .filter(
          (candle) =>
            candle.time * 1000 >= startTime && candle.time * 1000 <= endTime
        )
        .slice(0, limit)
    },
    async getHistoryTrades(
      symbol: SymbolId,
      { limit, startTime = 0, endTime = Infinity }: FetchCandlesOptions
    ): Promise<Trade[]> {
      requests.push(`${symbol} trades`)

      return getTrades(symbol)
        .filter(
          ({ time }) =>
            time >= startTime && time <= endTime && time >= tradesSince
        )
        .slice(0, limit)
    }
  }
}
