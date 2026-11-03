import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candle, IMarketService, PivotSettings } from '@/types'
import { createDefaultSettings } from '@/utils'

// The store persists to localStorage, which doesn't exist under Node.
vi.hoisted(() => {
  const items = new Map<string, string>()

  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key)
    }
  })
})

const { indicatorsStore } = await import('./indicators.store')
const { default: IndicatorsService } = await import('./indicators.service')

const DAY = 86_400

const candle = (time: number, close = 100): Candle => ({
  time,
  open: close,
  high: close + 10,
  low: close - 10,
  close,
  volume: 1
})

function setup(now = 9.5 * DAY * 1000) {
  const getPeriodCandles = vi.fn<IMarketService['getPeriodCandles']>()
  let time = now

  const service = new IndicatorsService({
    getMarketTime: () => time,
    getPeriodCandles
  } as unknown as IMarketService)

  return {
    service,
    getPeriodCandles,
    setTime: (value: number) => {
      time = value
    }
  }
}

const pivots = (overrides: Partial<PivotSettings> = {}): PivotSettings => ({
  ...createDefaultSettings('pivots'),
  pivotsBack: 2,
  ...overrides
})

const stored = () => indicatorsStore.getState().indicators

describe('indicator list', () => {
  beforeEach(() => {
    indicatorsStore.setState({
      indicators: [],
      nextId: 1,
      isLegendCollapsed: false
    })
  })

  it('adds an indicator with its defaults', () => {
    const { service } = setup()

    service.addIndicator('movingAverage')

    expect(stored()[0]).toMatchObject({
      id: 1,
      type: 'movingAverage',
      visible: true,
      settings: { method: 'sma', length: 9 }
    })
  })

  it('allows the same indicator more than once, with its own settings', () => {
    const { service } = setup()
    const first = service.addIndicator('movingAverage')
    const second = service.addIndicator('movingAverage')

    service.updateIndicator(first.id, {
      ...createDefaultSettings('movingAverage'),
      length: 50
    })
    service.updateIndicator(second.id, {
      ...createDefaultSettings('movingAverage'),
      length: 200
    })

    expect(stored().map((indicator) => indicator.id)).toEqual([1, 2])
    expect(
      stored().map(
        (indicator) => (indicator.settings as { length: number }).length
      )
    ).toEqual([50, 200])
  })

  it('gives instances separate default settings', () => {
    const { service } = setup()
    const first = service.addIndicator('pivots')
    const second = service.addIndicator('pivots')

    expect(first.settings).not.toBe(second.settings)
    expect((first.settings as PivotSettings).levels).not.toBe(
      (second.settings as PivotSettings).levels
    )
  })

  it('does not reuse the id of a removed indicator', () => {
    const { service } = setup()
    const first = service.addIndicator('ichimoku')

    service.removeIndicator(first.id)

    expect(service.addIndicator('ichimoku').id).toBe(2)
    expect(stored()).toHaveLength(1)
  })

  it('hides and shows every indicator at once', () => {
    const { service } = setup()

    service.addIndicator('ichimoku')
    service.addIndicator('pivots')

    service.setAllIndicatorsVisible(false)
    expect(stored().map((indicator) => indicator.visible)).toEqual([
      false,
      false
    ])

    service.setAllIndicatorsVisible(true)
    expect(stored().map((indicator) => indicator.visible)).toEqual([true, true])
  })

  it('keeps each indicator’s settings when hiding them all', () => {
    const { service } = setup()
    const added = service.addIndicator('movingAverage')

    service.updateIndicator(added.id, {
      ...createDefaultSettings('movingAverage'),
      length: 50
    })
    service.setAllIndicatorsVisible(false)

    expect((stored()[0].settings as { length: number }).length).toBe(50)
  })

  it('remembers whether the list is collapsed, apart from the indicators', () => {
    const { service } = setup()

    service.addIndicator('pivots')
    service.setLegendCollapsed(true)

    expect(indicatorsStore.getState().isLegendCollapsed).toBe(true)
    expect(stored()[0].visible).toBe(true)
  })

  it('hides and shows one indicator', () => {
    const { service } = setup()
    const first = service.addIndicator('ichimoku')

    service.addIndicator('pivots')
    service.setIndicatorVisible(first.id, false)

    expect(stored().map((indicator) => indicator.visible)).toEqual([
      false,
      true
    ])
  })
})

describe('loadPivotLevels', () => {
  const days = [candle(7 * DAY), candle(8 * DAY), candle(9 * DAY, 200)]

  it('requests one more period than it shows', async () => {
    const { service, getPeriodCandles } = setup()

    getPeriodCandles.mockResolvedValue(days)

    const levels = await service.loadPivotLevels(
      'BTCUSD',
      pivots({ timeframe: 'day' }),
      '1m'
    )

    expect(getPeriodCandles).toHaveBeenCalledWith('BTCUSD', '1d', 3)
    expect(levels.map((period) => period.startTime)).toEqual([8 * DAY, 9 * DAY])
  })

  it.each([
    ['1m', '1d'],
    ['1h', '1w'],
    ['1d', '1M']
  ] as const)(
    'on auto with a %s chart requests %s candles',
    async (tf, interval) => {
      const { service, getPeriodCandles } = setup()

      getPeriodCandles.mockResolvedValue(days)
      await service.loadPivotLevels('BTCUSD', pivots(), tf)

      expect(getPeriodCandles.mock.calls[0][1]).toBe(interval)
    }
  )

  it('builds yearly periods from months', async () => {
    const { service, getPeriodCandles } = setup()
    const month = (iso: string) => candle(Date.parse(iso) / 1000)

    getPeriodCandles.mockResolvedValue([
      month('2025-11-01'),
      month('2025-12-01'),
      month('2026-01-01')
    ])

    const levels = await service.loadPivotLevels(
      'BTCUSD',
      pivots({ timeframe: 'year', pivotsBack: 1 }),
      '1m'
    )

    expect(getPeriodCandles).toHaveBeenCalledWith('BTCUSD', '1M', 36)
    expect(levels).toHaveLength(1)
    expect(levels[0].startTime).toBe(Date.parse('2026-01-01') / 1000)
  })

  it('reuses a request until the newest period ends', async () => {
    const { service, getPeriodCandles, setTime } = setup()
    const settings = pivots({ timeframe: 'day' })

    getPeriodCandles.mockResolvedValue(days)
    await service.loadPivotLevels('BTCUSD', settings, '1m')
    await service.loadPivotLevels('BTCUSD', settings, '1m')

    expect(getPeriodCandles).toHaveBeenCalledTimes(1)

    setTime(10 * DAY * 1000)
    await service.loadPivotLevels('BTCUSD', settings, '1m')

    expect(getPeriodCandles).toHaveBeenCalledTimes(2)
  })

  it('shares one request between calls made at the same time', async () => {
    const { service, getPeriodCandles } = setup()
    const settings = pivots({ timeframe: 'day' })

    getPeriodCandles.mockResolvedValue(days)
    await Promise.all([
      service.loadPivotLevels('BTCUSD', settings, '1m'),
      service.loadPivotLevels('BTCUSD', settings, '1m')
    ])

    expect(getPeriodCandles).toHaveBeenCalledTimes(1)
  })

  it('requests again when more periods are needed', async () => {
    const { service, getPeriodCandles } = setup()

    getPeriodCandles.mockResolvedValue(days)
    await service.loadPivotLevels('BTCUSD', pivots({ timeframe: 'day' }), '1m')
    await service.loadPivotLevels(
      'BTCUSD',
      pivots({ timeframe: 'day', pivotsBack: 5 }),
      '1m'
    )

    expect(getPeriodCandles).toHaveBeenLastCalledWith('BTCUSD', '1d', 6)
  })

  it('keeps symbols apart', async () => {
    const { service, getPeriodCandles } = setup()
    const settings = pivots({ timeframe: 'day' })

    getPeriodCandles.mockResolvedValue(days)
    await service.loadPivotLevels('BTCUSD', settings, '1m')
    await service.loadPivotLevels('USDBRL', settings, '1m')

    expect(getPeriodCandles).toHaveBeenCalledTimes(2)
  })

  it('returns nothing on failure and waits before retrying', async () => {
    const { service, getPeriodCandles, setTime } = setup()
    const settings = pivots({ timeframe: 'day' })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    getPeriodCandles.mockRejectedValueOnce(new Error('offline'))

    expect(await service.loadPivotLevels('BTCUSD', settings, '1m')).toEqual([])

    await service.loadPivotLevels('BTCUSD', settings, '1m')

    expect(getPeriodCandles).toHaveBeenCalledTimes(1)

    getPeriodCandles.mockResolvedValue(days)
    setTime(9.5 * DAY * 1000 + 31_000)

    expect(
      await service.loadPivotLevels('BTCUSD', settings, '1m')
    ).toHaveLength(2)

    consoleError.mockRestore()
  })
})
