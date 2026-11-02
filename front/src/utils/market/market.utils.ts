import type { Candle, Locale, Timeframe, Trade } from '@/types'
import { TIMEFRAME_SECONDS } from './market.constants'

const NUMBER_LOCALES: Record<Locale, string> = {
  en: 'en-US',
  pt: 'pt-BR'
}

const formatters = new Map<string, Intl.NumberFormat>()

function getFormatter(locale: Locale, options: Intl.NumberFormatOptions) {
  const key = `${locale}:${JSON.stringify(options)}`
  let formatter = formatters.get(key)

  if (!formatter) {
    formatter = new Intl.NumberFormat(NUMBER_LOCALES[locale], options)
    formatters.set(key, formatter)
  }

  return formatter
}

export function formatDecimal(
  value: number,
  decimals: number,
  locale: Locale
): string {
  return getFormatter(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value)
}

export function formatCompact(value: number, locale: Locale): string {
  return getFormatter(locale, {
    notation: 'compact',
    maximumFractionDigits: 2
  }).format(value)
}

export function formatSignedPercent(value: number, locale: Locale): string {
  return getFormatter(locale, {
    signDisplay: 'exceptZero',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

export function formatUtcTime(time: number): string {
  return new Date(time).toISOString().slice(11, 19)
}

export function getSeriesKey(symbol: string, timeframe: Timeframe): string {
  return `${symbol}:${timeframe}`
}

export function mergeTrades(
  current: Trade[],
  incoming: Trade[],
  limit: number
): Trade[] {
  const byId = new Map(current.map((trade) => [trade.id, trade]))

  for (const trade of incoming) byId.set(trade.id, trade)

  return [...byId.values()].sort((a, b) => b.id - a.id).slice(0, limit)
}

export function applyTradeToCandles(
  candles: Candle[],
  trade: Trade,
  timeframe: Timeframe
): Candle[] {
  const seconds = TIMEFRAME_SECONDS[timeframe]
  const bucket = Math.floor(trade.time / 1000 / seconds) * seconds
  const last = candles.at(-1)

  if (!last || bucket < last.time) return candles

  if (bucket > last.time) {
    return [
      ...candles,
      {
        time: bucket,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.qty
      }
    ]
  }

  return [
    ...candles.slice(0, -1),
    {
      ...last,
      high: Math.max(last.high, trade.price),
      low: Math.min(last.low, trade.price),
      close: trade.price,
      volume: last.volume + trade.qty
    }
  ]
}

// Keeps older candles only when `latest` overlaps them, so a long outage never
// joins two distant stretches of history without the candles in between.
export function mergeLatestCandles(
  current: Candle[],
  latest: Candle[]
): Candle[] {
  const firstLatest = latest[0]

  if (!firstLatest) return current

  const lastCurrent = current.at(-1)

  if (!lastCurrent || lastCurrent.time < firstLatest.time) return latest

  return [
    ...current.filter((candle) => candle.time < firstLatest.time),
    ...latest
  ]
}
