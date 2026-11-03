import type {
  IndicatorSettingsByType,
  IndicatorType,
  MovingAverageMethod,
  PivotLabelsPosition,
  PivotLevelName,
  PivotLevelStyle,
  PivotTimeframe,
  PivotType,
  PriceSource
} from '@/types'

export const MOVING_AVERAGE_METHODS: MovingAverageMethod[] = [
  'sma',
  'ema',
  'wma'
]

export const PRICE_SOURCES: PriceSource[] = [
  'close',
  'open',
  'high',
  'low',
  'hl2',
  'hlc3',
  'ohlc4'
]

export const PIVOT_TYPES: PivotType[] = [
  'traditional',
  'fibonacci',
  'woodie',
  'classic',
  'dm',
  'camarilla'
]

export const PIVOT_TIMEFRAMES: PivotTimeframe[] = [
  'auto',
  'day',
  'week',
  'month',
  'year'
]

export const PIVOT_LABEL_POSITIONS: PivotLabelsPosition[] = ['left', 'right']

export const PIVOT_LEVEL_NAMES: PivotLevelName[] = [
  'P',
  'S1',
  'R1',
  'S2',
  'R2',
  'S3',
  'R3',
  'S4',
  'R4',
  'S5',
  'R5'
]

export const INDICATOR_LIMITS = {
  length: { min: 1, max: 2000 },
  offset: { min: -500, max: 500 },
  ichimokuPeriods: { min: 1, max: 500 },
  pivotsBack: { min: 1, max: 200 },
  lineWidth: { min: 1, max: 4 }
}

const PIVOT_COLOR = '#fb8c00'

function createPivotLevels(): Record<PivotLevelName, PivotLevelStyle> {
  return Object.fromEntries(
    PIVOT_LEVEL_NAMES.map((name) => [
      name,
      { color: PIVOT_COLOR, visible: true }
    ])
  ) as Record<PivotLevelName, PivotLevelStyle>
}

export function createDefaultSettings<T extends IndicatorType>(
  type: T
): IndicatorSettingsByType[T] {
  const defaults: IndicatorSettingsByType = {
    movingAverage: {
      method: 'sma',
      length: 9,
      source: 'close',
      offset: 0,
      color: '#2962ff',
      lineWidth: 1
    },
    ichimoku: {
      conversionPeriods: 9,
      basePeriods: 26,
      laggingPeriods: 52,
      displacement: 26,
      conversionColor: '#2962ff',
      baseColor: '#b71c1c',
      laggingColor: '#43a047',
      leadingAColor: '#4caf50',
      leadingBColor: '#ff5252',
      cloudUpColor: '#43a047',
      cloudDownColor: '#f44336',
      lineWidth: 1
    },
    pivots: {
      pivotType: 'traditional',
      timeframe: 'auto',
      pivotsBack: 15,
      showLabels: true,
      showPrices: true,
      labelsPosition: 'left',
      lineWidth: 1,
      levels: createPivotLevels()
    }
  }

  return defaults[type]
}
