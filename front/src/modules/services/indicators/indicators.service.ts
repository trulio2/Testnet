import type {
  Candle,
  IchimokuLines,
  IchimokuSettings,
  IIndicatorsService,
  IMarketService,
  Indicator,
  IndicatorSettings,
  IndicatorType,
  LinePoint,
  MovingAverageSettings,
  PivotPeriod,
  PivotPeriodLevels,
  PivotSettings,
  SymbolId,
  Timeframe
} from '@/types'
import {
  aggregateCandlesByYear,
  computeIchimoku,
  computeMovingAverage,
  computePivotPeriods,
  createDefaultSettings,
  getNextPeriodStart,
  MINUTE_CANDLES_PAGE_SIZE,
  resolvePivotPeriod,
  TIMEFRAME_SECONDS
} from '@/utils'
import { indicatorsStore } from './indicators.store'

const FAILED_REQUEST_RETRY_MS = 30_000
const MONTHS_PER_YEAR = 12

interface CachedPeriods {
  count: number
  expiresAt: number
  candles: Promise<Candle[]>
}

const PERIOD_INTERVALS = {
  day: '1d',
  week: '1w',
  month: '1M',
  year: '1M'
} as const

export default class IndicatorsService implements IIndicatorsService {
  private periodCache = new Map<string, CachedPeriods>()

  constructor(private marketService: IMarketService) {}

  public getIndicators(): Indicator[] {
    return indicatorsStore((state) => state.indicators)
  }

  public addIndicator(type: IndicatorType): Indicator {
    const { indicators, nextId, setIndicators } = indicatorsStore.getState()
    const indicator = {
      id: nextId,
      type,
      visible: true,
      settings: createDefaultSettings(type)
    } as Indicator

    setIndicators([...indicators, indicator], nextId + 1)

    return indicator
  }

  public updateIndicator(id: number, settings: IndicatorSettings): void {
    this.changeIndicator(id, { settings } as Partial<Indicator>)
  }

  public setIndicatorVisible(id: number, visible: boolean): void {
    this.changeIndicator(id, { visible })
  }

  public setAllIndicatorsVisible(visible: boolean): void {
    const { indicators, setIndicators } = indicatorsStore.getState()

    setIndicators(
      indicators.map((indicator) => ({ ...indicator, visible }) as Indicator)
    )
  }

  public isLegendCollapsed(): boolean {
    return indicatorsStore((state) => state.isLegendCollapsed)
  }

  public setLegendCollapsed(collapsed: boolean): void {
    indicatorsStore.getState().setLegendCollapsed(collapsed)
  }

  public removeIndicator(id: number): void {
    const { indicators, setIndicators } = indicatorsStore.getState()

    setIndicators(indicators.filter((indicator) => indicator.id !== id))
  }

  public computeMovingAverage(
    settings: MovingAverageSettings,
    candles: Candle[],
    timeframe: Timeframe
  ): LinePoint[] {
    return computeMovingAverage(settings, candles, timeframe)
  }

  public computeIchimoku(
    settings: IchimokuSettings,
    candles: Candle[],
    timeframe: Timeframe
  ): IchimokuLines {
    return computeIchimoku(settings, candles, timeframe)
  }

  public async loadPivotLevels(
    symbol: SymbolId,
    settings: PivotSettings,
    timeframe: Timeframe
  ): Promise<PivotPeriodLevels[]> {
    const period = resolvePivotPeriod(settings.timeframe, timeframe)
    const candles = await this.getPeriodCandles(
      symbol,
      period,
      settings.pivotsBack + 1
    )

    return computePivotPeriods(
      candles,
      settings.pivotType,
      settings.pivotsBack,
      period
    )
  }

  public getTimeframeSeconds(timeframe: Timeframe): number {
    return TIMEFRAME_SECONDS[timeframe]
  }

  private changeIndicator(id: number, changes: Partial<Indicator>): void {
    const { indicators, setIndicators } = indicatorsStore.getState()

    setIndicators(
      indicators.map((indicator) =>
        indicator.id === id
          ? ({ ...indicator, ...changes } as Indicator)
          : indicator
      )
    )
  }

  // Finished periods never change, so a request lasts until the newest period
  // ends. Called on every chart refresh, so a failure is cached too and retried
  // later rather than on the next refresh.
  private getPeriodCandles(
    symbol: SymbolId,
    period: PivotPeriod,
    count: number
  ): Promise<Candle[]> {
    const key = `${symbol}:${period}`
    const cached = this.periodCache.get(key)
    const now = this.marketService.getMarketTime()

    if (cached && cached.count >= count && now < cached.expiresAt) {
      return cached.candles.then((candles) => candles.slice(-count))
    }

    const entry: CachedPeriods = {
      count,
      expiresAt: now + FAILED_REQUEST_RETRY_MS,
      candles: this.fetchPeriodCandles(symbol, period, count).then(
        (candles) => {
          const newest = candles.at(-1)

          entry.expiresAt = newest
            ? getNextPeriodStart(period, newest.time) * 1000
            : entry.expiresAt

          return candles
        },
        (error) => {
          console.error(error)

          return []
        }
      )
    }

    this.periodCache.set(key, entry)

    return entry.candles
  }

  private async fetchPeriodCandles(
    symbol: SymbolId,
    period: PivotPeriod,
    count: number
  ): Promise<Candle[]> {
    const isYear = period === 'year'
    const limit = isYear ? (count + 1) * MONTHS_PER_YEAR : count
    const candles = await this.marketService.getPeriodCandles(
      symbol,
      PERIOD_INTERVALS[period],
      Math.min(limit, MINUTE_CANDLES_PAGE_SIZE)
    )

    return isYear ? aggregateCandlesByYear(candles) : candles
  }
}
