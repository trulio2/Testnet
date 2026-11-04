import type {
  Candle,
  CandleInterval,
  IMarketService,
  MarkPrices,
  SimulationEvent,
  SymbolId,
  Trade,
  TradingAccount
} from '@/types'
import { SYMBOLS } from '@/utils'
import {
  applyPriceMove,
  hasExposure,
  hasTriggerInRange,
  isSymbolExposed
} from './trading.engine'

type HistorySource = Pick<
  IMarketService,
  'getHistoryCandles' | 'getHistoryTrades'
>

// A candle a window was checked against, and the level it came from. Null when the
// exchange has no candle for that window.
type Bounds = Partial<
  Record<SymbolId, { candle: Candle | null; level: number }>
>

export interface SymbolTrade {
  symbol: SymbolId
  trade: Trade
}

export interface SimulationOptions {
  account: TradingAccount
  start: number
  end: number
  marks: MarkPrices
  source: HistorySource
  onProgress: (time: number) => void
  onEvent: (event: SimulationEvent) => void
}

const LEVELS: { interval: CandleInterval; ms: number }[] = [
  { interval: '1d', ms: 86_400_000 },
  { interval: '1h', ms: 3_600_000 },
  { interval: '1m', ms: 60_000 },
  { interval: '1s', ms: 1_000 }
]
const MINUTE_LEVEL = 2
const SECOND_LEVEL = LEVELS.length - 1
const PAGE_SIZE = 1000
const SYMBOL_IDS = Object.keys(SYMBOLS) as SymbolId[]

// Applies trades in time order, across symbols. They share money, so a fill on one
// symbol can change what happens on the other.
export function replayTrades(
  account: TradingAccount,
  trades: SymbolTrade[],
  lastPrices: Partial<Record<SymbolId, number>>,
  marks: MarkPrices
): { account: TradingAccount; events: SimulationEvent[] } {
  const events: SimulationEvent[] = []
  let current = account

  for (const { symbol, trade } of [...trades].sort(
    (a, b) => a.trade.time - b.trade.time
  )) {
    const result = applyPriceMove(
      current,
      symbol,
      {
        from: lastPrices[symbol] ?? trade.price,
        to: trade.price,
        time: trade.time
      },
      marks
    )

    current = result.account
    events.push(...result.events)
    lastPrices[symbol] = trade.price
  }

  return { account: current, events }
}

// Fetched as the sweep reaches them, because a symbol can stop mattering part way.
function createCandlePages(
  source: HistorySource,
  symbol: SymbolId,
  { interval, ms }: (typeof LEVELS)[number],
  to: number
) {
  const candles = new Map<number, Candle>()
  let nextStart: number | null = null
  let isExhausted = false

  return async (time: number) => {
    nextStart ??= time

    while (!isExhausted && nextStart <= time) {
      const page = await source.getHistoryCandles(symbol, interval, {
        limit: PAGE_SIZE,
        startTime: nextStart,
        endTime: to - 1
      })
      const last = page.at(-1)

      page.forEach((candle) => candles.set(candle.time * 1000, candle))

      if (!last || page.length < PAGE_SIZE) isExhausted = true
      else nextStart = last.time * 1000 + ms
    }

    return candles.get(time)
  }
}

async function loadTrades(
  source: HistorySource,
  symbol: SymbolId,
  from: number,
  to: number
) {
  const trades: Trade[] = []
  let startTime = from

  for (;;) {
    const page = await source.getHistoryTrades(symbol, {
      limit: PAGE_SIZE,
      startTime,
      endTime: to - 1
    })
    const lastId = trades.at(-1)?.id ?? -1

    trades.push(...page.filter((trade) => trade.id > lastId))

    const last = page.at(-1)

    if (!last || page.length < PAGE_SIZE) return trades

    startTime = last.time === startTime ? startTime + 1 : last.time
  }
}

// Sweeps forward through time, across both symbols at once, and zooms in only on
// windows where an order or a liquidation price could be reached: days, then hours,
// minutes, seconds and finally individual trades. Everything is worked out again
// after each event, since a fill moves the liquidation price and a liquidation
// cancels orders. Nothing is saved here, so a failed run can simply start over.
export async function runSimulation({
  account,
  start,
  end,
  marks,
  source,
  onProgress,
  onEvent
}: SimulationOptions): Promise<TradingAccount> {
  const lastPrices: Partial<Record<SymbolId, number>> = {}
  let current = account

  const isHit = (symbol: SymbolId, candle: Candle, before: number) =>
    hasTriggerInRange(current, symbol, candle, before, marks)

  // For periods the exchange no longer has finer data for. The usual guess at the
  // path inside a candle: to the nearer extreme, then the other, then the close.
  const estimate = (symbol: SymbolId, candle: Candle) => {
    const { open, high, low, close } = candle
    const path =
      open - low <= high - open
        ? [open, low, high, close]
        : [open, high, low, close]

    path.slice(1).forEach((to, index) => {
      const result = applyPriceMove(
        current,
        symbol,
        { from: path[index], to, time: candle.time * 1000 },
        marks
      )

      current = result.account
      result.events.forEach((event) => onEvent({ ...event, estimated: true }))
    })
  }

  const scanTrades = async (from: number, to: number, bounds: Bounds) => {
    const trades: SymbolTrade[] = []

    for (const symbol of SYMBOL_IDS) {
      const bound = bounds[symbol]

      if (!bound?.candle || !isHit(symbol, bound.candle, to)) continue

      const loaded = await loadTrades(
        source,
        symbol,
        Math.max(from, start),
        Math.min(to, end)
      )

      if (loaded.length === 0 && from >= start && to <= end) {
        estimate(symbol, bound.candle)
      }

      loaded.forEach((trade) => trades.push({ symbol, trade }))
    }

    const result = replayTrades(current, trades, lastPrices, marks)

    current = result.account
    result.events.forEach(onEvent)
  }

  const scan = async (
    level: number,
    from: number,
    to: number,
    parents: Bounds
  ) => {
    const { ms } = LEVELS[level]
    const pages = new Map<SymbolId, ReturnType<typeof createCandlePages>>()
    const found = new Set<SymbolId>()
    const lastTime = Math.min(to, end)

    for (
      let time = Math.floor(Math.max(from, start) / ms) * ms;
      time < lastTime && hasExposure(current);
      time += ms
    ) {
      const windowEnd = time + ms
      const bounds: Bounds = {}
      const closes: Partial<Record<SymbolId, number>> = {}
      let isTouched = false

      for (const symbol of SYMBOL_IDS) {
        const parent = parents[symbol]

        if (!isSymbolExposed(current, symbol)) continue

        if (
          parent &&
          (!parent.candle || !isHit(symbol, parent.candle, windowEnd))
        ) {
          bounds[symbol] = parent
          continue
        }

        const getCandle =
          pages.get(symbol) ??
          createCandlePages(source, symbol, LEVELS[level], lastTime)

        pages.set(symbol, getCandle)

        const candle = await getCandle(time)

        bounds[symbol] = { candle: candle ?? null, level }

        if (!candle) continue

        found.add(symbol)
        closes[symbol] = candle.close

        if (isHit(symbol, candle, windowEnd)) isTouched = true
      }

      if (isTouched) {
        if (level === SECOND_LEVEL) await scanTrades(time, windowEnd, bounds)
        else await scan(level + 1, time, windowEnd, bounds)
      }

      Object.assign(lastPrices, closes)
      onProgress(Math.min(windowEnd, end))
    }

    // The candle above said something happens in here, but there's nothing finer.
    if (from < start || to > end) return

    for (const symbol of SYMBOL_IDS) {
      const parent = parents[symbol]

      if (
        parent?.candle &&
        parent.level === level - 1 &&
        !found.has(symbol) &&
        isHit(symbol, parent.candle, to)
      ) {
        estimate(symbol, parent.candle)
      }
    }
  }

  const firstLevel = LEVELS.findIndex(({ ms }) => ms <= end - start)

  await scan(
    firstLevel === -1 ? MINUTE_LEVEL : Math.min(firstLevel, MINUTE_LEVEL),
    start,
    end,
    {}
  )
  onProgress(end)

  return current
}
