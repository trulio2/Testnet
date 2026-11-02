import type {
  Candle,
  CandleListener,
  CandleSeries,
  CandleStatus,
  ConnectionStatus,
  IMarketRepository,
  IMarketService,
  MarketEventListener,
  MarketStream,
  OrderBook,
  SymbolConfig,
  SymbolId,
  Ticker,
  Timeframe,
  Trade
} from '@/types'
import {
  applyTradeToCandles,
  getMidPrice,
  getSeriesKey,
  mergeLatestCandles,
  mergeTrades,
  MINUTE_CANDLES_PAGE_SIZE,
  SYMBOLS,
  TIMEFRAME_SECONDS
} from '@/utils'
import { chartPreferencesStore } from './chartPreferences.store'
import { marketStore } from './market.store'

const RECENT_TRADES_LIMIT = 50
const CANDLES_PAGE_SIZE = 500
const STALE_AFTER_MS = 15_000
const WATCHDOG_INTERVAL_MS = 5_000
const BASE_RECONNECT_DELAY_MS = 1_000
const MAX_RECONNECT_DELAY_MS = 30_000
const NO_TRADES: Trade[] = []

interface CandleSubscription {
  key: string
  symbol: SymbolId
  timeframe: Timeframe
  listeners: Set<CandleListener>
  loadToken: number
  fetching: boolean
  bufferedTrades: Trade[]
}

export default class MarketService implements IMarketService {
  private started = false
  private hasConnected = false
  private stream: MarketStream | null = null
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private lastMessageAt = 0
  private flushHandle: number | null = null
  private pendingTrades: Partial<Record<SymbolId, Trade[]>> = {}
  private pendingBooks: Partial<Record<SymbolId, OrderBook>> = {}
  private pendingTickers: Partial<Record<SymbolId, Ticker>> = {}
  private latestBooks: Partial<Record<SymbolId, OrderBook>> = {}
  private clockOffset = 0
  private eventListeners = new Set<MarketEventListener>()
  private subscriptions = new Map<string, CandleSubscription>()

  constructor(private marketRepository: IMarketRepository) {}

  // Layout's effect runs twice under StrictMode, so this must stay idempotent.
  public start(): void {
    if (this.started) return

    this.started = true
    this.connect()
    setInterval(() => this.checkForStaleStream(), WATCHDOG_INTERVAL_MS)
  }

  public getSymbols(): SymbolConfig[] {
    return Object.values(SYMBOLS)
  }

  public getSymbol(symbol: SymbolId): SymbolConfig {
    return SYMBOLS[symbol]
  }

  public resolveSymbol(value: string): SymbolId | null {
    return Object.hasOwn(SYMBOLS, value) ? (value as SymbolId) : null
  }

  public getTimeframes(): Timeframe[] {
    return Object.keys(TIMEFRAME_SECONDS) as Timeframe[]
  }

  public getSelectedTimeframe(): Timeframe {
    return chartPreferencesStore((state) => state.timeframe)
  }

  public setSelectedTimeframe(timeframe: Timeframe): void {
    chartPreferencesStore.getState().setTimeframe(timeframe)
  }

  public getConnectionStatus(): ConnectionStatus {
    return marketStore((state) => state.status)
  }

  public getTicker(symbol: SymbolId): Ticker | undefined {
    return marketStore((state) => state.tickers[symbol])
  }

  public getLastPrice(symbol: SymbolId): number | undefined {
    return marketStore((state) => state.trades[symbol]?.[0]?.price)
  }

  public getMarkPrice(symbol: SymbolId): number | undefined {
    return marketStore((state) => getMidPrice(state.books[symbol]))
  }

  public getOrderBook(symbol: SymbolId): OrderBook | undefined {
    return marketStore((state) => state.books[symbol])
  }

  // Current to the last message, unlike the store, which only updates on
  // animation frames and so stops while the tab is hidden.
  public getLatestBook(symbol: SymbolId): OrderBook | undefined {
    return this.latestBooks[symbol]
  }

  public isLive(): boolean {
    return marketStore.getState().status === 'live'
  }

  // Local time corrected to the exchange's clock, so times stay comparable with
  // trades and candles on machines whose clock has drifted.
  public getMarketTime(): number {
    return Date.now() + this.clockOffset
  }

  public subscribeMarketEvents(listener: MarketEventListener): () => void {
    this.eventListeners.add(listener)

    return () => {
      this.eventListeners.delete(listener)
    }
  }

  public getRecentTrades(symbol: SymbolId): Trade[] {
    return marketStore((state) => state.trades[symbol] ?? NO_TRADES)
  }

  public getCandleStatus(symbol: SymbolId, timeframe: Timeframe): CandleStatus {
    const key = getSeriesKey(symbol, timeframe)

    return marketStore((state) => state.series[key]?.status ?? 'loading')
  }

  public subscribeCandles(
    symbol: SymbolId,
    timeframe: Timeframe,
    listener: CandleListener
  ): () => void {
    const key = getSeriesKey(symbol, timeframe)
    let subscription = this.subscriptions.get(key)

    if (subscription) {
      const series = marketStore.getState().series[key]

      if (series?.status === 'ready') listener.onReset(series.candles)
    } else {
      subscription = {
        key,
        symbol,
        timeframe,
        listeners: new Set(),
        loadToken: 0,
        fetching: false,
        bufferedTrades: []
      }
      this.subscriptions.set(key, subscription)
      void this.loadLatestCandles(subscription)
    }

    const active = subscription

    active.listeners.add(listener)

    return () => {
      active.listeners.delete(listener)

      if (active.listeners.size > 0) return

      this.subscriptions.delete(key)
      marketStore.getState().removeSeries(key)
    }
  }

  public getMinuteCandlesSince(
    symbol: SymbolId,
    startTime: number
  ): Promise<Candle[]> {
    return this.marketRepository.fetchCandles(symbol, '1m', {
      limit: MINUTE_CANDLES_PAGE_SIZE,
      startTime
    })
  }

  public async loadOlderCandles(
    symbol: SymbolId,
    timeframe: Timeframe
  ): Promise<void> {
    const key = getSeriesKey(symbol, timeframe)
    const subscription = this.subscriptions.get(key)
    const series = marketStore.getState().series[key]
    const oldest = series?.candles[0]

    if (
      !subscription ||
      !oldest ||
      series.status !== 'ready' ||
      series.loadingOlder ||
      !series.hasMore
    ) {
      return
    }

    this.updateSeries(key, { loadingOlder: true })

    try {
      const older = await this.marketRepository.fetchCandles(
        symbol,
        timeframe,
        { limit: CANDLES_PAGE_SIZE, endTime: oldest.time * 1000 - 1 }
      )

      if (this.subscriptions.get(key) !== subscription) return

      const current = marketStore.getState().series[key]
      const candles = [...older, ...current.candles]

      this.updateSeries(key, {
        candles,
        hasMore: older.length === CANDLES_PAGE_SIZE,
        loadingOlder: false
      })
      subscription.listeners.forEach((listener) =>
        listener.onHistory(candles, older.length)
      )
    } catch (error) {
      console.error(error)

      if (this.subscriptions.get(key) === subscription) {
        this.updateSeries(key, { loadingOlder: false })
      }
    }
  }

  public async reloadCandles(
    symbol: SymbolId,
    timeframe: Timeframe
  ): Promise<void> {
    const subscription = this.subscriptions.get(getSeriesKey(symbol, timeframe))

    if (subscription) await this.loadLatestCandles(subscription)
  }

  private connect(): void {
    this.lastMessageAt = Date.now()
    this.stream = this.marketRepository.openStream({
      onOpen: () => this.handleOpen(),
      onClose: () => this.handleDisconnect(),
      onTrade: (symbol, trade) => {
        this.markMessageReceived()
        this.clockOffset = trade.time - Date.now()
        this.handleTrade(symbol, trade)
        this.eventListeners.forEach((listener) =>
          listener.onTrade(symbol, trade)
        )
      },
      onBook: (symbol, book) => {
        this.markMessageReceived()
        this.latestBooks[symbol] = book
        this.pendingBooks[symbol] = book
        this.scheduleFlush()
        this.eventListeners.forEach((listener) => listener.onBook(symbol, book))
      },
      onTicker: (symbol, ticker) => {
        this.markMessageReceived()
        this.pendingTickers[symbol] = ticker
        this.scheduleFlush()
      }
    })
  }

  private handleOpen(): void {
    marketStore.getState().setStatus('live')
    this.getSymbols().forEach(({ id }) => void this.seedRecentTrades(id))

    if (this.hasConnected) {
      this.subscriptions.forEach(
        (subscription) => void this.loadLatestCandles(subscription)
      )
    }

    this.hasConnected = true
    this.eventListeners.forEach((listener) => listener.onOpen())
  }

  private handleDisconnect(): void {
    this.stream = null
    marketStore
      .getState()
      .setStatus(this.hasConnected ? 'reconnecting' : 'connecting')

    const backoff = Math.min(
      BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts,
      MAX_RECONNECT_DELAY_MS
    )

    this.reconnectAttempts += 1
    this.reconnectTimer = setTimeout(
      () => {
        this.reconnectTimer = null
        this.connect()
      },
      backoff + Math.random() * BASE_RECONNECT_DELAY_MS
    )
  }

  // A socket can open and then drop straight away, so the backoff only resets
  // once data is actually flowing.
  private markMessageReceived(): void {
    this.lastMessageAt = Date.now()
    this.reconnectAttempts = 0
  }

  // Covers sockets that stay "open" while no data arrives. Closing through the
  // stream handle detaches its handlers, so the disconnect is handled here.
  private checkForStaleStream(): void {
    if (!this.stream || this.reconnectTimer) return
    if (Date.now() - this.lastMessageAt < STALE_AFTER_MS) return

    this.stream.close()
    this.handleDisconnect()
  }

  private async seedRecentTrades(symbol: SymbolId): Promise<void> {
    try {
      const trades = await this.marketRepository.fetchRecentTrades(
        symbol,
        RECENT_TRADES_LIMIT
      )

      this.queueTrades(symbol, trades)
    } catch (error) {
      // The stream keeps filling the list, so a failed seed is not fatal.
      console.error(error)
    }
  }

  private handleTrade(symbol: SymbolId, trade: Trade): void {
    this.queueTrades(symbol, [trade])

    this.subscriptions.forEach((subscription) => {
      if (subscription.symbol !== symbol) return
      if (subscription.fetching) subscription.bufferedTrades.push(trade)

      const series = marketStore.getState().series[subscription.key]

      if (series?.status !== 'ready') return

      const candles = applyTradeToCandles(
        series.candles,
        trade,
        subscription.timeframe
      )
      const updated = candles.at(-1)

      if (candles === series.candles || !updated) return

      this.updateSeries(subscription.key, { candles })
      subscription.listeners.forEach((listener) => listener.onUpdate(updated))
    })
  }

  private queueTrades(symbol: SymbolId, trades: Trade[]): void {
    this.pendingTrades[symbol] = mergeTrades(
      this.pendingTrades[symbol] ?? [],
      trades,
      RECENT_TRADES_LIMIT
    )
    this.scheduleFlush()
  }

  // Coalesces stream messages into one store write per frame, so panels render
  // at most once per frame however busy the feed gets.
  private scheduleFlush(): void {
    if (this.flushHandle !== null) return

    this.flushHandle = requestAnimationFrame(() => {
      this.flushHandle = null
      this.flushStreamBatch()
    })
  }

  private flushStreamBatch(): void {
    const { tickers, books, trades, applyStreamBatch } = marketStore.getState()
    const mergedTrades = { ...trades }

    for (const symbol of Object.keys(this.pendingTrades) as SymbolId[]) {
      mergedTrades[symbol] = mergeTrades(
        trades[symbol] ?? [],
        this.pendingTrades[symbol] ?? [],
        RECENT_TRADES_LIMIT
      )
    }

    applyStreamBatch({
      tickers: { ...tickers, ...this.pendingTickers },
      books: { ...books, ...this.pendingBooks },
      trades: mergedTrades
    })

    this.pendingTrades = {}
    this.pendingBooks = {}
    this.pendingTickers = {}
  }

  private async loadLatestCandles(
    subscription: CandleSubscription
  ): Promise<void> {
    const { key, symbol, timeframe } = subscription
    const { series, setSeries } = marketStore.getState()
    const isInitialLoad = series[key]?.status !== 'ready'
    const token = ++subscription.loadToken

    if (isInitialLoad) {
      setSeries(key, {
        candles: [],
        status: 'loading',
        hasMore: true,
        loadingOlder: false
      })
    }

    subscription.fetching = true
    subscription.bufferedTrades = []

    const isStale = () =>
      this.subscriptions.get(key) !== subscription ||
      subscription.loadToken !== token

    try {
      const latest = await this.marketRepository.fetchCandles(
        symbol,
        timeframe,
        { limit: CANDLES_PAGE_SIZE }
      )

      if (isStale()) return

      // Trades that raced the request are replayed so the live candle misses
      // nothing. One already counted by the response adds a little volume.
      const current = marketStore.getState().series[key]
      const candles = subscription.bufferedTrades.reduce(
        (result, trade) => applyTradeToCandles(result, trade, timeframe),
        mergeLatestCandles(current.candles, latest)
      )

      subscription.fetching = false
      subscription.bufferedTrades = []

      this.updateSeries(key, {
        candles,
        status: 'ready',
        hasMore: isInitialLoad
          ? latest.length === CANDLES_PAGE_SIZE
          : current.hasMore
      })
      subscription.listeners.forEach((listener) =>
        isInitialLoad
          ? listener.onReset(candles)
          : listener.onHistory(candles, 0)
      )
    } catch (error) {
      console.error(error)

      if (isStale()) return

      subscription.fetching = false
      subscription.bufferedTrades = []

      if (isInitialLoad) this.updateSeries(key, { status: 'error' })
    }
  }

  private updateSeries(key: string, changes: Partial<CandleSeries>): void {
    const { series, setSeries } = marketStore.getState()

    setSeries(key, { ...series[key], ...changes })
  }
}
