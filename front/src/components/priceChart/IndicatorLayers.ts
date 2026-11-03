import type {
  IChartApi,
  ISeriesApi,
  LineData,
  LineSeriesPartialOptions,
  LineWidth,
  Time,
  UTCTimestamp
} from 'lightweight-charts'
import type {
  Candle,
  IchimokuSettings,
  Indicator,
  IndicatorComputations,
  LinePoint,
  MovingAverageSettings,
  PivotLevelName,
  PivotPeriodLevels,
  PivotSettings,
  SymbolId,
  Timeframe
} from '@/types'
import {
  CloudPrimitive,
  type PivotSegment,
  PivotsPrimitive
} from './chartPrimitives'

const REFRESH_INTERVAL_MS = 1000

type Line = ISeriesApi<'Line'>

interface IchimokuLayer {
  type: 'ichimoku'
  conversion: Line
  base: Line
  lagging: Line
  leadingA: Line
  leadingB: Line
  cloud: CloudPrimitive
}

interface MovingAverageLayer {
  type: 'movingAverage'
  line: Line
}

interface PivotsLayer {
  type: 'pivots'
  primitive: PivotsPrimitive
  request: number
}

type Layer = IchimokuLayer | MovingAverageLayer | PivotsLayer

interface ChartContext {
  symbol: SymbolId
  timeframe: Timeframe
  formatPrice: (price: number) => string
}

function toLineData(points: LinePoint[]): LineData<Time>[] {
  return points.map(({ time, value }) => ({
    time: time as UTCTimestamp,
    value
  }))
}

// The candle at or after a time, because a period can start before the loaded
// history or between this timeframe's candles.
function findCandleTime(candles: Candle[], time: number): number | undefined {
  let low = 0
  let high = candles.length - 1
  let found: number | undefined

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)

    if (candles[middle].time >= time) {
      found = candles[middle].time
      high = middle - 1
    } else {
      low = middle + 1
    }
  }

  return found
}

function toPivotSegments(
  periods: PivotPeriodLevels[],
  candles: Candle[],
  settings: PivotSettings,
  stepSeconds: number
): PivotSegment[] {
  const last = candles.at(-1)

  if (!last) return []

  const segments: PivotSegment[] = []

  for (const period of periods) {
    const startTime = findCandleTime(candles, period.startTime)

    if (startTime === undefined) continue
    if (period.endTime <= candles[0].time) continue

    const levels = (
      Object.entries(period.levels) as [PivotLevelName, number][]
    ).filter(([name]) => settings.levels[name].visible)

    // A period still running ends in the future, where there are no candles yet.
    const endTime = findCandleTime(candles, period.endTime)

    segments.push({
      startTime,
      endTime: endTime ?? last.time,
      barsBeyond:
        endTime === undefined ? (period.endTime - last.time) / stepSeconds : 0,
      levels: levels.map(([name, price]) => ({
        name,
        price,
        color: settings.levels[name].color
      }))
    })
  }

  return segments
}

// Keeps the chart's series and drawings in step with the indicator list and the
// candles. Everything is recalculated together, at most once a second while
// candles are updating, because a change to the live candle can move many points.
export class IndicatorLayers {
  private layers = new Map<number, Layer>()
  private indicators: Indicator[] = []
  private candles: Candle[] = []
  private context: ChartContext | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private chart: IChartApi,
    private candleSeries: ISeriesApi<'Candlestick'>,
    private computations: IndicatorComputations,
    private font: string
  ) {}

  public setContext(context: ChartContext) {
    this.context = context
    this.refresh()
  }

  public setIndicators(indicators: Indicator[]) {
    this.indicators = indicators

    const ids = new Set(indicators.map((indicator) => indicator.id))

    for (const [id, layer] of this.layers) {
      if (!ids.has(id)) {
        this.removeLayer(layer)
        this.layers.delete(id)
      }
    }

    this.refresh()
  }

  public setCandles(candles: Candle[]) {
    this.candles = candles
    this.refresh()
  }

  public updateCandle(candle: Candle) {
    const last = this.candles.at(-1)

    if (last?.time === candle.time) {
      this.candles = [...this.candles.slice(0, -1), candle]
    } else {
      this.candles = [...this.candles, candle]
    }

    this.refreshTimer ??= setTimeout(() => this.refresh(), REFRESH_INTERVAL_MS)
  }

  public dispose() {
    this.clearRefreshTimer()
    this.layers.forEach((layer) => this.removeLayer(layer))
    this.layers.clear()
  }

  private clearRefreshTimer() {
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer)

    this.refreshTimer = null
  }

  private refresh() {
    this.clearRefreshTimer()

    if (!this.context) return

    for (const indicator of this.indicators) {
      switch (indicator.type) {
        case 'movingAverage':
          this.renderMovingAverage(
            indicator.id,
            indicator.settings,
            indicator.visible
          )
          break
        case 'ichimoku':
          this.renderIchimoku(
            indicator.id,
            indicator.settings,
            indicator.visible
          )
          break
        default:
          void this.renderPivots(
            indicator.id,
            indicator.settings,
            indicator.visible
          )
      }
    }
  }

  private createLine(): Line {
    return this.chart.addLineSeries({
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    })
  }

  private removeLayer(layer: Layer) {
    if (layer.type === 'movingAverage') {
      this.chart.removeSeries(layer.line)
    } else if (layer.type === 'ichimoku') {
      layer.leadingA.detachPrimitive(layer.cloud)
      this.chart.removeSeries(layer.conversion)
      this.chart.removeSeries(layer.base)
      this.chart.removeSeries(layer.lagging)
      this.chart.removeSeries(layer.leadingA)
      this.chart.removeSeries(layer.leadingB)
    } else {
      layer.request++
      this.candleSeries.detachPrimitive(layer.primitive)
    }
  }

  private renderMovingAverage(
    id: number,
    settings: MovingAverageSettings,
    visible: boolean
  ) {
    const { context } = this

    if (!context) return

    let layer = this.layers.get(id) as MovingAverageLayer | undefined

    if (!layer) {
      layer = { type: 'movingAverage', line: this.createLine() }
      this.layers.set(id, layer)
    }

    layer.line.applyOptions({
      color: settings.color,
      lineWidth: settings.lineWidth as LineWidth,
      visible
    })
    layer.line.setData(
      visible
        ? toLineData(
            this.computations.computeMovingAverage(
              settings,
              this.candles,
              context.timeframe
            )
          )
        : []
    )
  }

  private renderIchimoku(
    id: number,
    settings: IchimokuSettings,
    visible: boolean
  ) {
    const { context } = this

    if (!context) return

    let layer = this.layers.get(id) as IchimokuLayer | undefined

    if (!layer) {
      layer = {
        type: 'ichimoku',
        conversion: this.createLine(),
        base: this.createLine(),
        lagging: this.createLine(),
        leadingA: this.createLine(),
        leadingB: this.createLine(),
        cloud: new CloudPrimitive()
      }
      layer.leadingA.attachPrimitive(layer.cloud)
      this.layers.set(id, layer)
    }

    const lineWidth = settings.lineWidth as LineWidth
    const style = (color: string): LineSeriesPartialOptions => ({
      color,
      lineWidth,
      visible
    })

    layer.conversion.applyOptions(style(settings.conversionColor))
    layer.base.applyOptions(style(settings.baseColor))
    layer.lagging.applyOptions(style(settings.laggingColor))
    layer.leadingA.applyOptions(style(settings.leadingAColor))
    layer.leadingB.applyOptions(style(settings.leadingBColor))

    const lines = visible
      ? this.computations.computeIchimoku(
          settings,
          this.candles,
          context.timeframe
        )
      : { conversion: [], base: [], lagging: [], leadingA: [], leadingB: [] }

    layer.conversion.setData(toLineData(lines.conversion))
    layer.base.setData(toLineData(lines.base))
    layer.lagging.setData(toLineData(lines.lagging))
    layer.leadingA.setData(toLineData(lines.leadingA))
    layer.leadingB.setData(toLineData(lines.leadingB))

    const spanB = new Map(
      lines.leadingB.map((point) => [point.time, point.value])
    )

    layer.cloud.setData(
      lines.leadingA.flatMap(({ time, value }) => {
        const b = spanB.get(time)

        return b === undefined ? [] : [{ time, a: value, b }]
      }),
      settings.cloudUpColor,
      settings.cloudDownColor
    )
  }

  private async renderPivots(
    id: number,
    settings: PivotSettings,
    visible: boolean
  ) {
    const { context } = this

    if (!context) return

    let layer = this.layers.get(id) as PivotsLayer | undefined

    if (!layer) {
      layer = { type: 'pivots', primitive: new PivotsPrimitive(), request: 0 }
      this.candleSeries.attachPrimitive(layer.primitive)
      this.layers.set(id, layer)
    }

    const request = ++layer.request

    if (!visible) {
      layer.primitive.setData(null)
      return
    }

    const periods = await this.computations.loadPivotLevels(
      context.symbol,
      settings,
      context.timeframe
    )

    if (layer.request !== request) return

    layer.primitive.setData({
      segments: toPivotSegments(
        periods,
        this.candles,
        settings,
        this.computations.getTimeframeSeconds(context.timeframe)
      ),
      lineWidth: settings.lineWidth,
      showLabels: settings.showLabels,
      showPrices: settings.showPrices,
      labelsPosition: settings.labelsPosition,
      font: this.font,
      formatPrice: context.formatPrice
    })
  }
}
