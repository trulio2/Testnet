import { useEffect, useRef, useState } from 'react'
import {
  ColorType,
  createChart,
  CrosshairMode,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  LineStyle,
  type LogicalRange,
  type UTCTimestamp
} from 'lightweight-charts'
import {
  useCandles,
  useLiquidationPrice,
  useLocale,
  usePosition,
  useSelectedTimeframe,
  useSymbol,
  useSymbolOrders
} from '@/modules/services'
import type { Candle, SymbolId } from '@/types'

const DEFAULT_BAR_SPACING = 8
const RIGHT_OFFSET_CANDLES = 6
const LOAD_OLDER_MARGIN_CANDLES = 40
const VOLUME_ALPHA = '66'

interface ChartView {
  chart: IChartApi
  candles: ISeriesApi<'Candlestick'>
  volume: ISeriesApi<'Histogram'>
  upColor: string
  downColor: string
  entryColor: string
}

interface HoveredCandle {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

function readToken(name: string) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
}

function toCandleData(candle: Candle) {
  return { ...candle, time: candle.time as UTCTimestamp }
}

function toVolumeData(candle: Candle, view: ChartView): HistogramData {
  const color = candle.close >= candle.open ? view.upColor : view.downColor

  return {
    time: candle.time as UTCTimestamp,
    value: candle.volume,
    color: `${color}${VOLUME_ALPHA}`
  }
}

function setChartData(view: ChartView, data: Candle[]) {
  view.candles.setData(data.map(toCandleData))
  view.volume.setData(data.map((candle) => toVolumeData(candle, view)))
}

export default function PriceChart({ symbol }: { symbol: SymbolId }) {
  const { t } = useLocale()
  const { config, formatPrice, formatQty } = useSymbol(symbol)
  const { timeframe, setTimeframe } = useSelectedTimeframe()
  const [hovered, setHovered] = useState<HoveredCandle | null>(null)
  const { status, timeframes, subscribe, loadOlder, reload } = useCandles(
    symbol,
    timeframe
  )
  const orders = useSymbolOrders(symbol)
  const position = usePosition(symbol)
  const liquidationPrice = useLiquidationPrice(symbol)
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<ChartView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const border = readToken('--dash-border')
    const upColor = readToken('--dash-green')
    const downColor = readToken('--dash-red')
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: readToken('--dash-panel') },
        textColor: readToken('--dash-muted'),
        fontFamily: readToken('--mono'),
        fontSize: 11,
        attributionLogo: true
      },
      grid: {
        vertLines: { color: border },
        horzLines: { color: border }
      },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: { vertTouchDrag: false },
      rightPriceScale: { borderColor: border },
      timeScale: {
        borderColor: border,
        timeVisible: true,
        barSpacing: DEFAULT_BAR_SPACING,
        rightOffset: RIGHT_OFFSET_CANDLES
      }
    })
    const candles = chart.addCandlestickSeries({
      upColor,
      downColor,
      wickUpColor: upColor,
      wickDownColor: downColor,
      borderVisible: false
    })
    const volume = chart.addHistogramSeries({
      priceScaleId: '',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false
    })

    candles.priceScale().applyOptions({
      scaleMargins: { top: 0.08, bottom: 0.22 }
    })
    volume.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 }
    })

    chart.subscribeCrosshairMove((param) => {
      const candle = param.seriesData.get(candles)
      const bar = param.seriesData.get(volume)

      if (!candle || !('open' in candle) || !bar || !('value' in bar)) {
        setHovered(null)
        return
      }

      setHovered({
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: bar.value
      })
    })

    viewRef.current = {
      chart,
      candles,
      volume,
      upColor,
      downColor,
      entryColor: readToken('--dash-cyan')
    }

    return () => {
      viewRef.current = null
      chart.remove()
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current

    if (!view) return

    view.chart.applyOptions({ localization: { priceFormatter: formatPrice } })
    view.candles.applyOptions({
      priceFormat: {
        type: 'price',
        precision: config.priceDecimals,
        minMove: config.tickSize
      }
    })
  }, [config, formatPrice])

  useEffect(() => {
    const view = viewRef.current

    if (!view) return

    const timeScale = view.chart.timeScale()

    setChartData(view, [])

    const unsubscribe = subscribe({
      onReset(data) {
        setChartData(view, data)
        timeScale.resetTimeScale()
      },
      onHistory(data, prepended) {
        const range = timeScale.getVisibleLogicalRange()
        const isFollowingLatest = timeScale.scrollPosition() >= 0

        setChartData(view, data)

        if (prepended === 0) {
          if (isFollowingLatest) timeScale.scrollToRealTime()
        } else if (range) {
          timeScale.setVisibleLogicalRange({
            from: range.from + prepended,
            to: range.to + prepended
          })
        }
      },
      onUpdate(candle) {
        view.candles.update(toCandleData(candle))
        view.volume.update(toVolumeData(candle, view))
      }
    })
    const handleRangeChange = (range: LogicalRange | null) => {
      if (range && range.from < LOAD_OLDER_MARGIN_CANDLES) void loadOlder()
    }

    timeScale.subscribeVisibleLogicalRangeChange(handleRangeChange)

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(handleRangeChange)
      unsubscribe()
    }
  }, [subscribe, loadOlder])

  useEffect(() => {
    const view = viewRef.current

    if (!view) return

    const lines = orders.map((order) =>
      view.candles.createPriceLine({
        price: order.price,
        color: order.side === 'buy' ? view.upColor : view.downColor,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${t(`components.chart.${order.side}`)} ${formatQty(order.qty)}`
      })
    )

    if (position) {
      lines.push(
        view.candles.createPriceLine({
          price: position.avgEntry,
          color: view.entryColor,
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `${t('components.chart.entry')} ${formatQty(position.qty)}`
        })
      )
    }

    if (liquidationPrice !== undefined) {
      lines.push(
        view.candles.createPriceLine({
          price: liquidationPrice,
          color: view.downColor,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: t('components.chart.liquidation')
        })
      )
    }

    return () => {
      // The chart effect's cleanup runs first on unmount and clears viewRef.
      if (viewRef.current !== view) return

      lines.forEach((line) => view.candles.removePriceLine(line))
    }
  }, [orders, position, liquidationPrice, formatQty, t])

  return (
    <section className="trade-panel chart-panel" aria-label={config.label}>
      <header className="chart-toolbar">
        <div
          className="chart-timeframes"
          role="group"
          aria-label={t('components.chart.timeframe')}
        >
          {timeframes.map((option) => (
            <button
              key={option}
              type="button"
              className={`chart-timeframe${option === timeframe ? ' active' : ''}`}
              aria-pressed={option === timeframe}
              onClick={() => setTimeframe(option)}
            >
              {option}
            </button>
          ))}
        </div>
        {hovered && (
          <dl className="chart-legend">
            <dt>O</dt>
            <dd>{formatPrice(hovered.open)}</dd>
            <dt>H</dt>
            <dd>{formatPrice(hovered.high)}</dd>
            <dt>L</dt>
            <dd>{formatPrice(hovered.low)}</dd>
            <dt>C</dt>
            <dd>{formatPrice(hovered.close)}</dd>
            <dt>V</dt>
            <dd>{formatQty(hovered.volume)}</dd>
          </dl>
        )}
        <span className="chart-feed">
          {t('components.chart.feedNote', { feed: config.feedLabel })}
        </span>
      </header>
      <div className="chart-canvas">
        <div ref={containerRef} className="chart-container" />
        {status === 'loading' && (
          <div className="chart-overlay">
            <div
              className="spinner"
              role="status"
              aria-label={t('components.chart.loading')}
            ></div>
          </div>
        )}
        {status === 'error' && (
          <div className="chart-overlay" role="alert">
            <p>{t('error.connectionError')}</p>
            <button
              type="button"
              className="btn accent"
              onClick={() => void reload()}
            >
              {t('error.retry')}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
