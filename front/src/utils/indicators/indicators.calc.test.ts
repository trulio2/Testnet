import { describe, expect, it } from 'vitest'
import type { Candle, IchimokuSettings, MovingAverageSettings } from '@/types'
import {
  aggregateCandlesByYear,
  computeIchimoku,
  computeMovingAverage,
  computePivotLevels,
  computePivotPeriods,
  getNextPeriodStart,
  resolvePivotPeriod
} from './indicators.calc'
import { createDefaultSettings } from './indicators.defaults'

const STEP = 60

// Candles a minute apart whose open, high, low and close are all the value.
const flat = (values: number[]): Candle[] =>
  values.map((value, index) => ({
    time: index * STEP,
    open: value,
    high: value,
    low: value,
    close: value,
    volume: 1
  }))

const ma = (overrides: Partial<MovingAverageSettings>) => ({
  ...createDefaultSettings('movingAverage'),
  ...overrides
})

const values = (points: { value: number }[]) => points.map((p) => p.value)

describe('computeMovingAverage', () => {
  it('computes a simple average once there are enough candles', () => {
    const points = computeMovingAverage(
      ma({ method: 'sma', length: 3 }),
      flat([1, 2, 3, 4, 5]),
      '1m'
    )

    expect(points).toEqual([
      { time: 120, value: 2 },
      { time: 180, value: 3 },
      { time: 240, value: 4 }
    ])
  })

  it('seeds an exponential average with the simple average', () => {
    const points = computeMovingAverage(
      ma({ method: 'ema', length: 3 }),
      flat([1, 2, 3, 4, 5]),
      '1m'
    )

    // alpha 0.5: seed 2, then 2 + (4 - 2) * 0.5 = 3, then 3 + (5 - 3) * 0.5 = 4.
    expect(values(points)).toEqual([2, 3, 4])
  })

  it('gives an exponential average more weight on recent candles', () => {
    const [, , , last] = computeMovingAverage(
      ma({ method: 'ema', length: 3 }),
      flat([10, 10, 10, 10, 20, 20]),
      '1m'
    )

    expect(last.value).toBe(17.5)
  })

  it('computes a weighted average', () => {
    const points = computeMovingAverage(
      ma({ method: 'wma', length: 3 }),
      flat([1, 2, 3, 6]),
      '1m'
    )

    // (1*1 + 2*2 + 3*3) / 6, then (2*1 + 3*2 + 6*3) / 6.
    expect(points[0].value).toBeCloseTo(14 / 6)
    expect(points[1].value).toBeCloseTo(26 / 6)
  })

  it('reads the chosen source', () => {
    const candle: Candle = {
      time: 0,
      open: 1,
      high: 10,
      low: 2,
      close: 3,
      volume: 1
    }
    const run = (source: MovingAverageSettings['source']) =>
      computeMovingAverage(ma({ length: 1, source }), [candle], '1m')[0].value

    expect(run('open')).toBe(1)
    expect(run('high')).toBe(10)
    expect(run('low')).toBe(2)
    expect(run('close')).toBe(3)
    expect(run('hl2')).toBe(6)
    expect(run('hlc3')).toBe(5)
    expect(run('ohlc4')).toBe(4)
  })

  it('shifts forward past the last candle at the timeframe spacing', () => {
    const points = computeMovingAverage(
      ma({ length: 1, offset: 2 }),
      flat([1, 2]),
      '1m'
    )

    expect(points).toEqual([
      { time: 120, value: 1 },
      { time: 180, value: 2 }
    ])
  })

  it('shifts backward and drops points before the first candle', () => {
    const points = computeMovingAverage(
      ma({ length: 1, offset: -1 }),
      flat([1, 2, 3]),
      '1m'
    )

    expect(points).toEqual([
      { time: 0, value: 2 },
      { time: 60, value: 3 }
    ])
  })

  it('returns nothing with too few candles', () => {
    expect(computeMovingAverage(ma({ length: 5 }), flat([1, 2]), '1m')).toEqual(
      []
    )
  })

  it('handles no candles', () => {
    expect(computeMovingAverage(ma({ length: 1 }), [], '1m')).toEqual([])
  })
})

describe('computeIchimoku', () => {
  const settings: IchimokuSettings = {
    ...createDefaultSettings('ichimoku'),
    conversionPeriods: 2,
    basePeriods: 3,
    laggingPeriods: 4,
    displacement: 3
  }
  const candles: Candle[] = [
    { time: 0, open: 10, high: 12, low: 8, close: 11, volume: 1 },
    { time: 60, open: 11, high: 14, low: 10, close: 13, volume: 1 },
    { time: 120, open: 13, high: 16, low: 12, close: 15, volume: 1 },
    { time: 180, open: 15, high: 18, low: 14, close: 17, volume: 1 },
    { time: 240, open: 17, high: 20, low: 16, close: 19, volume: 1 }
  ]
  const lines = computeIchimoku(settings, candles, '1m')

  it('uses the middle of the range for the conversion line', () => {
    expect(lines.conversion).toEqual([
      { time: 60, value: 11 },
      { time: 120, value: 13 },
      { time: 180, value: 15 },
      { time: 240, value: 17 }
    ])
  })

  it('uses its own period for the base line', () => {
    expect(lines.base).toEqual([
      { time: 120, value: 12 },
      { time: 180, value: 14 },
      { time: 240, value: 16 }
    ])
  })

  it('moves the close back by displacement minus one', () => {
    expect(lines.lagging).toEqual([
      { time: 0, value: 15 },
      { time: 60, value: 17 },
      { time: 120, value: 19 }
    ])
  })

  it('moves span A forward into the future', () => {
    expect(lines.leadingA).toEqual([
      { time: 240, value: 12.5 },
      { time: 300, value: 14.5 },
      { time: 360, value: 16.5 }
    ])
  })

  it('moves span B forward using its own period', () => {
    // Highest 18 and lowest 8 over the first four candles.
    expect(lines.leadingB).toEqual([
      { time: 300, value: 13 },
      { time: 360, value: 15 }
    ])
  })

  it('handles no candles', () => {
    expect(computeIchimoku(settings, [], '1m').leadingA).toEqual([])
  })
})

describe('computePivotLevels', () => {
  const previous: Candle = {
    time: 0,
    open: 95,
    high: 110,
    low: 90,
    close: 100,
    volume: 1
  }

  it('computes traditional levels', () => {
    expect(computePivotLevels('traditional', previous, 105)).toEqual({
      P: 100,
      R1: 110,
      S1: 90,
      R2: 120,
      S2: 80,
      R3: 130,
      S3: 70,
      R4: 140,
      S4: 60,
      R5: 150,
      S5: 50
    })
  })

  it('computes fibonacci levels', () => {
    const levels = computePivotLevels('fibonacci', previous, 105)

    expect(levels.P).toBe(100)
    expect(levels.R1).toBeCloseTo(107.64)
    expect(levels.S1).toBeCloseTo(92.36)
    expect(levels.R2).toBeCloseTo(112.36)
    expect(levels.S2).toBeCloseTo(87.64)
    expect(levels.R3).toBe(120)
    expect(levels.S3).toBe(80)
    expect(levels.R4).toBeUndefined()
  })

  it('computes woodie levels from the current open', () => {
    expect(computePivotLevels('woodie', previous, 105)).toEqual({
      P: 102.5,
      R1: 115,
      S1: 95,
      R2: 122.5,
      S2: 82.5,
      R3: 135,
      S3: 75,
      R4: 155,
      S4: 55
    })
  })

  it('computes classic levels', () => {
    expect(computePivotLevels('classic', previous, 105)).toEqual({
      P: 100,
      R1: 110,
      S1: 90,
      R2: 120,
      S2: 80,
      R3: 140,
      S3: 60,
      R4: 160,
      S4: 40
    })
  })

  it('computes dm levels for each direction of the period', () => {
    expect(computePivotLevels('dm', previous, 105)).toEqual({
      P: 102.5,
      R1: 115,
      S1: 95
    })
    expect(computePivotLevels('dm', { ...previous, open: 105 }, 105).P).toBe(
      97.5
    )
    expect(computePivotLevels('dm', { ...previous, open: 100 }, 105).P).toBe(
      100
    )
  })

  it('computes camarilla levels around the close', () => {
    const levels = computePivotLevels('camarilla', previous, 105)

    expect(levels.P).toBe(100)
    expect(levels.R1).toBeCloseTo(100 + 22 / 12)
    expect(levels.S1).toBeCloseTo(100 - 22 / 12)
    expect(levels.R2).toBeCloseTo(100 + 22 / 6)
    expect(levels.R3).toBeCloseTo(105.5)
    expect(levels.S3).toBeCloseTo(94.5)
    expect(levels.R4).toBeCloseTo(111)
    expect(levels.S4).toBeCloseTo(89)
    expect(levels.R5).toBeCloseTo((110 / 90) * 100)
    expect(levels.S5).toBeCloseTo(100 - ((110 / 90) * 100 - 100))
  })
})

describe('computePivotPeriods', () => {
  const periods: Candle[] = [
    { time: 0, open: 95, high: 110, low: 90, close: 100, volume: 1 },
    { time: 100, open: 100, high: 120, low: 100, close: 110, volume: 1 },
    { time: 200, open: 110, high: 115, low: 105, close: 112, volume: 1 }
  ]

  it('takes each period’s levels from the one before', () => {
    const [first, second] = computePivotPeriods(periods, 'traditional', 10)

    expect(first.startTime).toBe(100)
    expect(first.endTime).toBe(200)
    expect(first.levels.P).toBe(100)
    expect(second.levels.P).toBeCloseTo((120 + 100 + 110) / 3)
  })

  it('leaves the newest period open-ended', () => {
    const result = computePivotPeriods(periods, 'traditional', 10)

    expect(result.at(-1)?.endTime).toBeUndefined()
  })

  it('keeps only the requested number, newest last', () => {
    const result = computePivotPeriods(periods, 'traditional', 1)

    expect(result.map((period) => period.startTime)).toEqual([200])
  })

  it('needs at least two periods', () => {
    expect(computePivotPeriods([periods[0]], 'traditional', 5)).toEqual([])
  })
})

describe('resolvePivotPeriod', () => {
  it.each([
    ['1m', 'day'],
    ['5m', 'day'],
    ['15m', 'day'],
    ['1h', 'week'],
    ['4h', 'week'],
    ['1d', 'month']
  ] as const)('auto on %s uses %s', (timeframe, expected) => {
    expect(resolvePivotPeriod('auto', timeframe)).toBe(expected)
  })

  it('keeps an explicit choice', () => {
    expect(resolvePivotPeriod('year', '1m')).toBe('year')
  })
})

describe('aggregateCandlesByYear', () => {
  it('combines months into years', () => {
    const month = (iso: string, high: number, low: number, close: number) => ({
      time: Date.parse(iso) / 1000,
      open: close - 1,
      high,
      low,
      close,
      volume: 1
    })
    const years = aggregateCandlesByYear([
      month('2024-11-01', 10, 5, 8),
      month('2024-12-01', 12, 7, 9),
      month('2025-01-01', 11, 6, 10)
    ])

    expect(years).toHaveLength(2)
    expect(years[0]).toMatchObject({
      time: Date.parse('2024-11-01') / 1000,
      open: 7,
      high: 12,
      low: 5,
      close: 9,
      volume: 2
    })
    expect(years[1]).toMatchObject({ high: 11, low: 6, close: 10 })
  })
})

describe('getNextPeriodStart', () => {
  const at = (iso: string) => Date.parse(iso) / 1000

  it('adds a day and a week', () => {
    expect(getNextPeriodStart('day', 0)).toBe(86_400)
    expect(getNextPeriodStart('week', 0)).toBe(604_800)
  })

  it('moves to the next calendar month, across a year', () => {
    expect(getNextPeriodStart('month', at('2026-01-01'))).toBe(at('2026-02-01'))
    expect(getNextPeriodStart('month', at('2026-12-01'))).toBe(at('2027-01-01'))
  })

  it('moves to the next calendar year', () => {
    expect(getNextPeriodStart('year', at('2026-03-01'))).toBe(at('2027-01-01'))
  })
})
