import type {
  Candle,
  IchimokuLines,
  IchimokuSettings,
  LinePoint,
  MovingAverageSettings,
  PivotLevels,
  PivotPeriod,
  PivotPeriodLevels,
  PivotTimeframe,
  PivotType,
  PriceSource,
  Timeframe
} from '@/types'
import { TIMEFRAME_SECONDS } from '../market/market.constants'

const DAY_SECONDS = 86_400

function getSourceValue(candle: Candle, source: PriceSource): number {
  const { open, high, low, close } = candle

  switch (source) {
    case 'open':
      return open
    case 'high':
      return high
    case 'low':
      return low
    case 'hl2':
      return (high + low) / 2
    case 'hlc3':
      return (high + low + close) / 3
    case 'ohlc4':
      return (open + high + low + close) / 4
    default:
      return close
  }
}

// Indexes past the last candle continue at the timeframe's spacing, which is how
// offsets and the Ichimoku cloud reach into the future.
function getTimeAt(candles: Candle[], index: number, stepSeconds: number) {
  const lastIndex = candles.length - 1

  return index <= lastIndex
    ? candles[index].time
    : candles[lastIndex].time + (index - lastIndex) * stepSeconds
}

function getMovingAverageValues(
  values: number[],
  { method, length }: MovingAverageSettings
): (number | undefined)[] {
  const results: (number | undefined)[] = []
  let sum = 0
  let previousEma: number | undefined

  values.forEach((value, index) => {
    sum += value

    if (index >= length) sum -= values[index - length]
    if (index < length - 1) {
      results.push(undefined)
      return
    }

    if (method === 'ema') {
      previousEma =
        previousEma === undefined
          ? sum / length
          : (value - previousEma) * (2 / (length + 1)) + previousEma
      results.push(previousEma)
    } else if (method === 'wma') {
      let weighted = 0

      for (let weight = 1; weight <= length; weight++) {
        weighted += values[index - length + weight] * weight
      }

      results.push(weighted / ((length * (length + 1)) / 2))
    } else {
      results.push(sum / length)
    }
  })

  return results
}

export function computeMovingAverage(
  settings: MovingAverageSettings,
  candles: Candle[],
  timeframe: Timeframe
): LinePoint[] {
  const step = TIMEFRAME_SECONDS[timeframe]
  const values = candles.map((candle) =>
    getSourceValue(candle, settings.source)
  )
  const points: LinePoint[] = []

  getMovingAverageValues(values, settings).forEach((value, index) => {
    const shifted = index + settings.offset

    if (value === undefined || shifted < 0) return

    points.push({ time: getTimeAt(candles, shifted, step), value })
  })

  return points
}

// The middle of the highest high and lowest low over the last `periods` candles.
function getMidpoints(candles: Candle[], periods: number) {
  return candles.map((_, index) => {
    if (index < periods - 1) return undefined

    let high = -Infinity
    let low = Infinity

    for (let i = index - periods + 1; i <= index; i++) {
      high = Math.max(high, candles[i].high)
      low = Math.min(low, candles[i].low)
    }

    return (high + low) / 2
  })
}

export function computeIchimoku(
  settings: IchimokuSettings,
  candles: Candle[],
  timeframe: Timeframe
): IchimokuLines {
  const step = TIMEFRAME_SECONDS[timeframe]
  const shift = settings.displacement - 1
  const conversion = getMidpoints(candles, settings.conversionPeriods)
  const base = getMidpoints(candles, settings.basePeriods)
  const spanB = getMidpoints(candles, settings.laggingPeriods)
  const lines: IchimokuLines = {
    conversion: [],
    base: [],
    lagging: [],
    leadingA: [],
    leadingB: []
  }

  candles.forEach((candle, index) => {
    const conversionValue = conversion[index]
    const baseValue = base[index]
    const spanBValue = spanB[index]

    if (conversionValue !== undefined) {
      lines.conversion.push({ time: candle.time, value: conversionValue })
    }

    if (baseValue !== undefined) {
      lines.base.push({ time: candle.time, value: baseValue })
    }

    if (index - shift >= 0) {
      lines.lagging.push({
        time: candles[index - shift].time,
        value: candle.close
      })
    }

    const leadTime = getTimeAt(candles, index + shift, step)

    if (conversionValue !== undefined && baseValue !== undefined) {
      lines.leadingA.push({
        time: leadTime,
        value: (conversionValue + baseValue) / 2
      })
    }

    if (spanBValue !== undefined) {
      lines.leadingB.push({ time: leadTime, value: spanBValue })
    }
  })

  return lines
}

// `previous` is the finished period the levels come from; `currentOpen` is only
// used by Woodie.
export function computePivotLevels(
  type: PivotType,
  previous: Candle,
  currentOpen: number
): PivotLevels {
  const { open, high, low, close } = previous
  const range = high - low
  const typical = (high + low + close) / 3

  switch (type) {
    case 'fibonacci':
      return {
        P: typical,
        R1: typical + 0.382 * range,
        S1: typical - 0.382 * range,
        R2: typical + 0.618 * range,
        S2: typical - 0.618 * range,
        R3: typical + range,
        S3: typical - range
      }
    case 'woodie': {
      const pivot = (high + low + 2 * currentOpen) / 4
      const r3 = high + 2 * (pivot - low)
      const s3 = low - 2 * (high - pivot)

      return {
        P: pivot,
        R1: 2 * pivot - low,
        S1: 2 * pivot - high,
        R2: pivot + range,
        S2: pivot - range,
        R3: r3,
        S3: s3,
        R4: r3 + range,
        S4: s3 - range
      }
    }
    case 'classic':
      return {
        P: typical,
        R1: 2 * typical - low,
        S1: 2 * typical - high,
        R2: typical + range,
        S2: typical - range,
        R3: typical + 2 * range,
        S3: typical - 2 * range,
        R4: typical + 3 * range,
        S4: typical - 3 * range
      }
    case 'dm': {
      let x = high + low + 2 * close

      if (close < open) x = high + 2 * low + close
      else if (close > open) x = 2 * high + low + close

      return { P: x / 4, R1: x / 2 - low, S1: x / 2 - high }
    }
    case 'camarilla': {
      const r5 = (high / low) * close

      return {
        P: typical,
        R1: close + (1.1 * range) / 12,
        S1: close - (1.1 * range) / 12,
        R2: close + (1.1 * range) / 6,
        S2: close - (1.1 * range) / 6,
        R3: close + (1.1 * range) / 4,
        S3: close - (1.1 * range) / 4,
        R4: close + (1.1 * range) / 2,
        S4: close - (1.1 * range) / 2,
        R5: r5,
        S5: close - (r5 - close)
      }
    }
    default:
      return {
        P: typical,
        R1: 2 * typical - low,
        S1: 2 * typical - high,
        R2: typical + range,
        S2: typical - range,
        R3: 2 * typical + (high - 2 * low),
        S3: 2 * typical - (2 * high - low),
        R4: 3 * typical + (high - 3 * low),
        S4: 3 * typical - (3 * high - low),
        R5: 4 * typical + (high - 4 * low),
        S5: 4 * typical - (4 * high - low)
      }
  }
}

// Each period's levels come from the one before it, so the oldest candle only
// supplies levels. The newest period has no end yet.
export function computePivotPeriods(
  periods: Candle[],
  type: PivotType,
  back: number
): PivotPeriodLevels[] {
  const results: PivotPeriodLevels[] = []

  for (let i = 1; i < periods.length; i++) {
    results.push({
      startTime: periods[i].time,
      endTime: periods[i + 1]?.time,
      levels: computePivotLevels(type, periods[i - 1], periods[i].open)
    })
  }

  return results.slice(-back)
}

export function resolvePivotPeriod(
  setting: PivotTimeframe,
  timeframe: Timeframe
): PivotPeriod {
  if (setting !== 'auto') return setting

  const seconds = TIMEFRAME_SECONDS[timeframe]

  if (seconds <= 900) return 'day'

  return seconds < DAY_SECONDS ? 'week' : 'month'
}

export function aggregateCandlesByYear(months: Candle[]): Candle[] {
  const years = new Map<number, Candle>()

  for (const month of months) {
    const year = new Date(month.time * 1000).getUTCFullYear()
    const current = years.get(year)

    years.set(
      year,
      current
        ? {
            ...current,
            high: Math.max(current.high, month.high),
            low: Math.min(current.low, month.low),
            close: month.close,
            volume: current.volume + month.volume
          }
        : month
    )
  }

  return [...years.values()]
}

// When the period starting at `startTime` (seconds) ends.
export function getNextPeriodStart(
  period: PivotPeriod,
  startTime: number
): number {
  if (period === 'day') return startTime + DAY_SECONDS
  if (period === 'week') return startTime + 7 * DAY_SECONDS

  const start = new Date(startTime * 1000)
  const year = start.getUTCFullYear()
  const month = start.getUTCMonth()

  return (
    (period === 'month'
      ? Date.UTC(year, month + 1, 1)
      : Date.UTC(year + 1, 0, 1)) / 1000
  )
}
