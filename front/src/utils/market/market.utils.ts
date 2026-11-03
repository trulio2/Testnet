import type {
  Candle,
  Locale,
  OrderBook,
  OrderBookLevel,
  Timeframe,
  Trade
} from '@/types'
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

export function roundToDecimals(value: number, decimals: number): number {
  return Number(value.toFixed(decimals))
}

export function getMidPrice(book: OrderBook | undefined): number | undefined {
  const bid = book?.bids[0]?.price
  const ask = book?.asks[0]?.price

  return bid === undefined || ask === undefined ? undefined : (bid + ask) / 2
}

export function formatSignedDecimal(
  value: number,
  decimals: number,
  locale: Locale
): string {
  return getFormatter(locale, {
    signDisplay: 'exceptZero',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value)
}

export function formatUtcDateTime(time: number): string {
  return new Date(time).toISOString().slice(0, 19).replace('T', ' ')
}

// Accepts a comma as the decimal separator, which pt users will type.
export function parseDecimalInput(value: string): number {
  const normalized = value.trim().replace(',', '.')

  return normalized === '' ? NaN : Number(normalized)
}

export function formatFeePercent(rate: number, locale: Locale): string {
  return getFormatter(locale, { maximumFractionDigits: 4 }).format(rate * 100)
}

export function toFeePercentInput(rate: number): string {
  return String(roundToDecimals(rate * 100, 4))
}

function groupBookSide(
  levels: OrderBookLevel[],
  step: number,
  decimals: number,
  round: (value: number) => number
): OrderBookLevel[] {
  const factor = 10 ** decimals
  const stepUnits = Math.round(step * factor)
  const grouped: OrderBookLevel[] = []

  for (const { price, qty } of levels) {
    // In whole ticks, so fractional steps stay free of float noise.
    const units = Math.round(price * factor)
    const groupPrice = (round(units / stepUnits) * stepUnits) / factor
    const last = grouped.at(-1)

    if (last?.price === groupPrice) last.qty += qty
    else grouped.push({ price: groupPrice, qty })
  }

  return grouped
}

// Bids round down and asks round up, so a grouped price is always one the
// whole group can trade at, and the spread widens along with the step.
export function groupOrderBook(
  { bids, asks }: OrderBook,
  step: number,
  decimals: number
): OrderBook {
  return {
    bids: groupBookSide(bids, step, decimals, Math.floor),
    asks: groupBookSide(asks, step, decimals, Math.ceil)
  }
}

// Adds a slower, deeper snapshot beyond the live levels, which win wherever the
// two overlap because they're newer.
export function mergeBookDepth(live: OrderBook, deep: OrderBook): OrderBook {
  const lowestBid = live.bids.at(-1)?.price
  const highestAsk = live.asks.at(-1)?.price

  return {
    bids:
      lowestBid === undefined
        ? live.bids
        : [...live.bids, ...deep.bids.filter((l) => l.price < lowestBid)],
    asks:
      highestAsk === undefined
        ? live.asks
        : [...live.asks, ...deep.asks.filter((l) => l.price > highestAsk)]
  }
}
