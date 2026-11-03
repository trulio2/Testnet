import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import type {
  Candle,
  Indicator,
  IndicatorComputations,
  PivotPeriodLevels
} from '@/types'
import {
  computeIchimoku,
  computeMovingAverage,
  createDefaultSettings
} from '@/utils'
import { type PivotDrawOptions, PivotsPrimitive } from './chartPrimitives'
import { IndicatorLayers } from './IndicatorLayers'

const candle = (time: number, close = 100): Candle => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1
})

const movingAverage = (id = 1, length = 1): Indicator => ({
  id,
  type: 'movingAverage',
  visible: true,
  settings: { ...createDefaultSettings('movingAverage'), length }
})

const ichimoku = (): Indicator => ({
  id: 2,
  type: 'ichimoku',
  visible: true,
  settings: {
    ...createDefaultSettings('ichimoku'),
    conversionPeriods: 1,
    basePeriods: 1,
    laggingPeriods: 1,
    displacement: 2
  }
})

const pivots = (): Indicator => ({
  id: 3,
  type: 'pivots',
  visible: true,
  settings: createDefaultSettings('pivots')
})

function setup(periods: PivotPeriodLevels[] = []) {
  const lines: {
    setData: ReturnType<typeof vi.fn>
    applyOptions: ReturnType<typeof vi.fn>
    attachPrimitive: ReturnType<typeof vi.fn>
    detachPrimitive: ReturnType<typeof vi.fn>
  }[] = []
  const chart = {
    addLineSeries: vi.fn(() => {
      const line = {
        setData: vi.fn(),
        applyOptions: vi.fn(),
        attachPrimitive: vi.fn(),
        detachPrimitive: vi.fn()
      }

      lines.push(line)

      return line
    }),
    removeSeries: vi.fn()
  }
  const candleSeries = { attachPrimitive: vi.fn(), detachPrimitive: vi.fn() }
  const computations: IndicatorComputations = {
    computeMovingAverage,
    computeIchimoku,
    loadPivotLevels: async () => periods,
    getTimeframeSeconds: () => 50
  }
  const layers = new IndicatorLayers(
    chart as unknown as IChartApi,
    candleSeries as unknown as ISeriesApi<'Candlestick'>,
    computations,
    '11px mono'
  )

  layers.setContext({
    symbol: 'BTCUSD',
    timeframe: '1m',
    formatPrice: String
  })

  const lastData = (index: number) => lines[index].setData.mock.lastCall?.[0]

  return { layers, chart, candleSeries, lines, lastData }
}

describe('IndicatorLayers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a line per moving average, for repeated indicators too', () => {
    const { layers, chart, lastData } = setup()

    layers.setCandles([candle(60, 1), candle(120, 3)])
    layers.setIndicators([movingAverage(1, 1), movingAverage(2, 2)])

    expect(chart.addLineSeries).toHaveBeenCalledTimes(2)
    expect(lastData(0)).toEqual([
      { time: 60, value: 1 },
      { time: 120, value: 3 }
    ])
    expect(lastData(1)).toEqual([{ time: 120, value: 2 }])
  })

  it('does not recreate a line when its settings change', () => {
    const { layers, chart } = setup()

    layers.setIndicators([movingAverage(1, 1)])
    layers.setIndicators([movingAverage(1, 5)])

    expect(chart.addLineSeries).toHaveBeenCalledTimes(1)
  })

  it('applies live candles at most once a second', () => {
    const { layers, lines, lastData } = setup()

    layers.setCandles([candle(60, 1)])
    layers.setIndicators([movingAverage()])

    const callsBefore = lines[0].setData.mock.calls.length

    layers.updateCandle(candle(60, 2))
    layers.updateCandle(candle(60, 3))

    expect(lines[0].setData.mock.calls.length).toBe(callsBefore)

    vi.advanceTimersByTime(1000)

    expect(lines[0].setData.mock.calls.length).toBe(callsBefore + 1)
    expect(lastData(0)).toEqual([{ time: 60, value: 3 }])
  })

  it('adds a new candle when the time moves on', () => {
    const { layers, lastData } = setup()

    layers.setCandles([candle(60, 1)])
    layers.setIndicators([movingAverage()])
    layers.updateCandle(candle(120, 5))
    vi.advanceTimersByTime(1000)

    expect(lastData(0)).toEqual([
      { time: 60, value: 1 },
      { time: 120, value: 5 }
    ])
  })

  it('removes the series of a removed indicator', () => {
    const { layers, chart, lines } = setup()

    layers.setIndicators([movingAverage()])
    layers.setIndicators([])

    expect(chart.removeSeries).toHaveBeenCalledWith(lines[0])
  })

  it('clears a hidden indicator so it stops extending the time scale', () => {
    const { layers, lines, lastData } = setup()

    layers.setCandles([candle(60)])
    layers.setIndicators([{ ...movingAverage(), visible: false }])

    expect(lastData(0)).toEqual([])
    expect(lines[0].applyOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ visible: false })
    )
  })

  it('draws ichimoku as five lines with the cloud on span A', () => {
    const { layers, chart, lines, lastData } = setup()

    layers.setCandles([candle(60, 10), candle(120, 20)])
    layers.setIndicators([ichimoku()])

    expect(chart.addLineSeries).toHaveBeenCalledTimes(5)
    expect(lines[3].attachPrimitive).toHaveBeenCalledTimes(1)
    // Displacement 2 leads by one candle, into the future past 120.
    expect(lastData(3)).toEqual([
      { time: 120, value: 10 },
      { time: 180, value: 20 }
    ])
  })

  it('detaches and removes everything on dispose', () => {
    const { layers, chart, lines, candleSeries } = setup()

    layers.setIndicators([ichimoku(), pivots()])
    layers.dispose()

    expect(lines[3].detachPrimitive).toHaveBeenCalledTimes(1)
    expect(chart.removeSeries).toHaveBeenCalledTimes(5)
    expect(candleSeries.detachPrimitive).toHaveBeenCalledTimes(1)
  })

  it('stops a pending refresh on dispose', () => {
    const { layers, lines } = setup()

    layers.setIndicators([movingAverage()])
    layers.updateCandle(candle(60))
    layers.dispose()

    const calls = lines[0].setData.mock.calls.length

    vi.advanceTimersByTime(5000)

    expect(lines[0].setData.mock.calls.length).toBe(calls)
  })

  describe('pivots', () => {
    const drawOptions = async (
      periods: PivotPeriodLevels[],
      candles: Candle[],
      indicator: Indicator = pivots()
    ) => {
      const spy = vi.spyOn(PivotsPrimitive.prototype, 'setData')
      const { layers } = setup(periods)

      layers.setCandles(candles)
      layers.setIndicators([indicator])
      await vi.advanceTimersByTimeAsync(0)

      const options = spy.mock.lastCall?.[0] as PivotDrawOptions | null

      spy.mockRestore()

      return options
    }

    it('spans each period from its start to the next one', async () => {
      const options = await drawOptions(
        [
          { startTime: 100, endTime: 200, levels: { P: 1 } },
          { startTime: 200, endTime: 250, levels: { P: 2 } }
        ],
        [candle(100), candle(150), candle(200), candle(250)]
      )

      expect(options?.segments.map((s) => [s.startTime, s.endTime])).toEqual([
        [100, 200],
        [200, 250]
      ])
    })

    it('extends a running period past the last candle to where it ends', async () => {
      const options = await drawOptions(
        [{ startTime: 200, endTime: 500, levels: { P: 2 } }],
        [candle(200), candle(250)]
      )

      expect(options?.segments[0]).toMatchObject({
        startTime: 200,
        endTime: 250,
        barsBeyond: 5
      })
    })

    it('does not extend a period that already finished', async () => {
      const options = await drawOptions(
        [{ startTime: 100, endTime: 200, levels: { P: 1 } }],
        [candle(100), candle(150), candle(200), candle(250)]
      )

      expect(options?.segments[0].barsBeyond).toBe(0)
    })

    it('moves a period start onto the next candle on screen', async () => {
      const options = await drawOptions(
        [{ startTime: 110, endTime: 220, levels: { P: 1 } }],
        [candle(100), candle(160), candle(220)]
      )

      expect(options?.segments[0].startTime).toBe(160)
    })

    it('starts at the first candle when the period began before them', async () => {
      const options = await drawOptions(
        [{ startTime: 50, endTime: 160, levels: { P: 1 } }],
        [candle(100), candle(160)]
      )

      expect(options?.segments[0].startTime).toBe(100)
    })

    it('skips a period that ended before the loaded candles', async () => {
      const options = await drawOptions(
        [{ startTime: 10, endTime: 100, levels: { P: 1 } }],
        [candle(100), candle(160)]
      )

      expect(options?.segments).toEqual([])
    })

    it('leaves out levels switched off in the settings', async () => {
      const base = createDefaultSettings('pivots')
      const options = await drawOptions(
        [{ startTime: 100, endTime: 200, levels: { P: 1, R1: 2 } }],
        [candle(100)],
        {
          id: 3,
          type: 'pivots',
          visible: true,
          settings: {
            ...base,
            levels: { ...base.levels, R1: { color: '#000000', visible: false } }
          }
        }
      )

      expect(options?.segments[0].levels.map((level) => level.name)).toEqual([
        'P'
      ])
    })

    it('clears the drawing when hidden', async () => {
      const options = await drawOptions(
        [{ startTime: 100, endTime: 200, levels: { P: 1 } }],
        [candle(100)],
        { ...pivots(), visible: false }
      )

      expect(options).toBeNull()
    })
  })
})
