import type {
  ISeriesPrimitive,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  Logical,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp
} from 'lightweight-charts'
import type { PivotLabelsPosition, PivotLevelName } from '@/types'

type DrawTarget = Parameters<ISeriesPrimitivePaneRenderer['draw']>[0]

const OFFSCREEN_MARGIN = 40
const CLOUD_ALPHA = '26'
const LABEL_GAP = 4

// Draws on the chart's own canvas, behind the candles, in time and price
// coordinates so it follows scrolling and zooming.
abstract class CanvasPrimitive implements ISeriesPrimitive<Time> {
  protected param: SeriesAttachedParameter<Time, SeriesType> | null = null

  private view: ISeriesPrimitivePaneView = {
    zOrder: () => 'bottom',
    renderer: () => ({ draw: (target) => this.draw(target) })
  }

  public attached(param: SeriesAttachedParameter<Time, SeriesType>) {
    this.param = param
  }

  public detached() {
    this.param = null
  }

  public paneViews() {
    return [this.view]
  }

  protected abstract draw(target: DrawTarget): void
}

export interface CloudPoint {
  time: number
  a: number
  b: number
}

interface CloudCoordinate {
  x: number
  a: number
  b: number
  isUp: boolean
}

// Fills between Leading Span A and B, which the library has no series type for.
export class CloudPrimitive extends CanvasPrimitive {
  private points: CloudPoint[] = []
  private upColor = ''
  private downColor = ''

  public setData(points: CloudPoint[], upColor: string, downColor: string) {
    this.points = points
    this.upColor = `${upColor}${CLOUD_ALPHA}`
    this.downColor = `${downColor}${CLOUD_ALPHA}`
    this.param?.requestUpdate()
  }

  protected draw(target: DrawTarget) {
    const { param } = this

    if (!param) return

    const timeScale = param.chart.timeScale()

    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      let previous: CloudCoordinate | null = null

      for (const point of this.points) {
        const x = timeScale.timeToCoordinate(point.time as UTCTimestamp)
        const a = param.series.priceToCoordinate(point.a)
        const b = param.series.priceToCoordinate(point.b)

        if (x === null || a === null || b === null) {
          previous = null
          continue
        }

        const current = { x, a, b, isUp: point.a >= point.b }
        const isVisible =
          previous &&
          current.x >= -OFFSCREEN_MARGIN &&
          previous.x <= mediaSize.width + OFFSCREEN_MARGIN

        if (previous && isVisible) this.fillBetween(context, previous, current)

        previous = current
      }
    })
  }

  // Where the spans cross, the fill changes color at the crossing point.
  private fillBetween(
    context: CanvasRenderingContext2D,
    from: CloudCoordinate,
    to: CloudCoordinate
  ) {
    if (from.isUp === to.isUp) {
      context.fillStyle = from.isUp ? this.upColor : this.downColor
      context.beginPath()
      context.moveTo(from.x, from.a)
      context.lineTo(to.x, to.a)
      context.lineTo(to.x, to.b)
      context.lineTo(from.x, from.b)
      context.closePath()
      context.fill()
      return
    }

    const fromGap = from.a - from.b
    const toGap = to.a - to.b
    const ratio = fromGap / (fromGap - toGap)
    const crossX = from.x + (to.x - from.x) * ratio
    const crossY = from.a + (to.a - from.a) * ratio

    context.fillStyle = from.isUp ? this.upColor : this.downColor
    context.beginPath()
    context.moveTo(from.x, from.a)
    context.lineTo(crossX, crossY)
    context.lineTo(from.x, from.b)
    context.closePath()
    context.fill()

    context.fillStyle = to.isUp ? this.upColor : this.downColor
    context.beginPath()
    context.moveTo(crossX, crossY)
    context.lineTo(to.x, to.a)
    context.lineTo(to.x, to.b)
    context.closePath()
    context.fill()
  }
}

export interface PivotSegmentLevel {
  name: PivotLevelName
  price: number
  color: string
}

export interface PivotSegment {
  startTime: number
  endTime: number
  barsBeyond: number
  levels: PivotSegmentLevel[]
}

export interface PivotDrawOptions {
  segments: PivotSegment[]
  lineWidth: number
  showLabels: boolean
  showPrices: boolean
  labelsPosition: PivotLabelsPosition
  font: string
  formatPrice: (price: number) => string
}

// Draws each period's levels only across that period. As a primitive it also
// stays out of the price scale, so far-away levels don't squash the candles.
export class PivotsPrimitive extends CanvasPrimitive {
  private options: PivotDrawOptions | null = null

  public setData(options: PivotDrawOptions | null) {
    this.options = options
    this.param?.requestUpdate()
  }

  protected draw(target: DrawTarget) {
    const { param, options } = this

    if (!param || !options) return

    const timeScale = param.chart.timeScale()
    const firstBar = timeScale.logicalToCoordinate(0 as Logical)
    const secondBar = timeScale.logicalToCoordinate(1 as Logical)

    if (firstBar === null || secondBar === null) return

    // Read from the scale because it changes as the chart is zoomed.
    const barSpacing = secondBar - firstBar

    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      context.lineWidth = options.lineWidth
      context.font = options.font
      context.textBaseline = 'middle'

      for (const segment of options.segments) {
        const startX = timeScale.timeToCoordinate(
          segment.startTime as UTCTimestamp
        )
        const endX = timeScale.timeToCoordinate(segment.endTime as UTCTimestamp)

        if (startX === null || endX === null) continue

        // A period with one candle on screen would otherwise have no width.
        const right = Math.max(
          endX + segment.barsBeyond * barSpacing,
          startX + barSpacing
        )

        if (right < 0 || startX > mediaSize.width) continue

        for (const level of segment.levels) {
          const y = param.series.priceToCoordinate(level.price)

          if (y === null || y < 0 || y > mediaSize.height) continue

          context.strokeStyle = level.color
          context.beginPath()
          context.moveTo(startX, y)
          context.lineTo(right, y)
          context.stroke()

          this.drawLabel(context, options, level, startX, right, y)
        }
      }
    })
  }

  private drawLabel(
    context: CanvasRenderingContext2D,
    options: PivotDrawOptions,
    level: PivotSegmentLevel,
    left: number,
    right: number,
    y: number
  ) {
    const price = `(${options.formatPrice(level.price)})`
    const parts = [
      options.showLabels ? level.name : '',
      options.showPrices ? price : ''
    ]
    const text = parts.filter(Boolean).join(' ')

    if (!text) return

    const isLeft = options.labelsPosition === 'left'

    context.fillStyle = level.color
    context.textAlign = isLeft ? 'right' : 'left'
    context.fillText(text, isLeft ? left - LABEL_GAP : right + LABEL_GAP, y)
  }
}
