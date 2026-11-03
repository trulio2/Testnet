import type { Candle, SymbolId, Timeframe } from './market.types'

export type IndicatorType = 'movingAverage' | 'ichimoku' | 'pivots'

export type MovingAverageMethod = 'sma' | 'ema' | 'wma'

export type PriceSource =
  'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4'

export type PivotType =
  'traditional' | 'fibonacci' | 'woodie' | 'classic' | 'dm' | 'camarilla'

export type PivotTimeframe = 'auto' | 'day' | 'week' | 'month' | 'year'

export type PivotPeriod = Exclude<PivotTimeframe, 'auto'>

export type PivotLabelsPosition = 'left' | 'right'

export type PivotLevelName =
  'P' | 'R1' | 'S1' | 'R2' | 'S2' | 'R3' | 'S3' | 'R4' | 'S4' | 'R5' | 'S5'

export interface MovingAverageSettings {
  method: MovingAverageMethod
  length: number
  source: PriceSource
  offset: number
  color: string
  lineWidth: number
}

export interface IchimokuSettings {
  conversionPeriods: number
  basePeriods: number
  laggingPeriods: number
  displacement: number
  conversionColor: string
  baseColor: string
  laggingColor: string
  leadingAColor: string
  leadingBColor: string
  cloudUpColor: string
  cloudDownColor: string
  lineWidth: number
}

export interface PivotLevelStyle {
  color: string
  visible: boolean
}

export interface PivotSettings {
  pivotType: PivotType
  timeframe: PivotTimeframe
  pivotsBack: number
  showLabels: boolean
  showPrices: boolean
  labelsPosition: PivotLabelsPosition
  lineWidth: number
  levels: Record<PivotLevelName, PivotLevelStyle>
}

export interface IndicatorSettingsByType {
  movingAverage: MovingAverageSettings
  ichimoku: IchimokuSettings
  pivots: PivotSettings
}

export type Indicator = {
  [T in IndicatorType]: {
    id: number
    type: T
    visible: boolean
    settings: IndicatorSettingsByType[T]
  }
}[IndicatorType]

export type IndicatorSettings = Indicator['settings']

export interface LinePoint {
  time: number
  value: number
}

export interface IchimokuLines {
  conversion: LinePoint[]
  base: LinePoint[]
  lagging: LinePoint[]
  leadingA: LinePoint[]
  leadingB: LinePoint[]
}

export type PivotLevels = Partial<Record<PivotLevelName, number>>

export interface PivotPeriodLevels {
  startTime: number
  endTime?: number
  levels: PivotLevels
}

export interface IndicatorComputations {
  computeMovingAverage(
    settings: MovingAverageSettings,
    candles: Candle[],
    timeframe: Timeframe
  ): LinePoint[]
  computeIchimoku(
    settings: IchimokuSettings,
    candles: Candle[],
    timeframe: Timeframe
  ): IchimokuLines
  loadPivotLevels(
    symbol: SymbolId,
    settings: PivotSettings,
    timeframe: Timeframe
  ): Promise<PivotPeriodLevels[]>
}

export interface IIndicatorsService extends IndicatorComputations {
  getIndicators(): Indicator[]
  addIndicator(type: IndicatorType): Indicator
  updateIndicator(id: number, settings: IndicatorSettings): void
  setIndicatorVisible(id: number, visible: boolean): void
  removeIndicator(id: number): void
}

export interface IndicatorsState {
  indicators: Indicator[]
  nextId: number
  setIndicators(indicators: Indicator[], nextId?: number): void
}
