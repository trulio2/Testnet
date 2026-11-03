import IoC from '@/modules/ioc'
import {
  type Candle,
  type IchimokuSettings,
  type IIndicatorsService,
  type IndicatorComputations,
  type IndicatorSettings,
  type IndicatorType,
  type MovingAverageSettings,
  type PivotSettings,
  SERVICES,
  type SymbolId,
  type Timeframe
} from '@/types'
import {
  createDefaultSettings,
  INDICATOR_LIMITS,
  MOVING_AVERAGE_METHODS,
  PIVOT_LABEL_POSITIONS,
  PIVOT_LEVEL_NAMES,
  PIVOT_TIMEFRAMES,
  PIVOT_TYPES,
  PRICE_SOURCES
} from '@/utils'

const indicatorsService = IoC.getOrCreateInstance<IIndicatorsService>(
  SERVICES.INDICATORS
)

const indicatorActions = {
  addIndicator: (type: IndicatorType) => indicatorsService.addIndicator(type),
  updateIndicator: (id: number, settings: IndicatorSettings) =>
    indicatorsService.updateIndicator(id, settings),
  setIndicatorVisible: (id: number, visible: boolean) =>
    indicatorsService.setIndicatorVisible(id, visible),
  setAllIndicatorsVisible: (visible: boolean) =>
    indicatorsService.setAllIndicatorsVisible(visible),
  setLegendCollapsed: (collapsed: boolean) =>
    indicatorsService.setLegendCollapsed(collapsed),
  removeIndicator: (id: number) => indicatorsService.removeIndicator(id)
}

const indicatorOptions = {
  methods: MOVING_AVERAGE_METHODS,
  sources: PRICE_SOURCES,
  pivotTypes: PIVOT_TYPES,
  pivotTimeframes: PIVOT_TIMEFRAMES,
  labelPositions: PIVOT_LABEL_POSITIONS,
  levelNames: PIVOT_LEVEL_NAMES,
  limits: INDICATOR_LIMITS,
  createDefaultSettings
}

const indicatorComputations: IndicatorComputations = {
  computeMovingAverage: (
    settings: MovingAverageSettings,
    candles: Candle[],
    timeframe: Timeframe
  ) => indicatorsService.computeMovingAverage(settings, candles, timeframe),
  computeIchimoku: (
    settings: IchimokuSettings,
    candles: Candle[],
    timeframe: Timeframe
  ) => indicatorsService.computeIchimoku(settings, candles, timeframe),
  loadPivotLevels: (
    symbol: SymbolId,
    settings: PivotSettings,
    timeframe: Timeframe
  ) => indicatorsService.loadPivotLevels(symbol, settings, timeframe),
  getTimeframeSeconds: (timeframe: Timeframe) =>
    indicatorsService.getTimeframeSeconds(timeframe)
}

export function useIndicators() {
  return indicatorsService.getIndicators()
}

export function useIndicatorLegendCollapsed() {
  return indicatorsService.isLegendCollapsed()
}

export function useIndicatorActions() {
  return indicatorActions
}

export function useIndicatorOptions() {
  return indicatorOptions
}

export function useIndicatorComputations() {
  return indicatorComputations
}
