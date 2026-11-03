export type SymbolId = 'BTCUSD' | 'USDBRL'

export type Currency = 'USD' | 'BRL'

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'

export type CandleInterval = Timeframe | '1w' | '1M'

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting'

export type TradeSide = 'buy' | 'sell'

export type CandleStatus = 'loading' | 'ready' | 'error'

export interface SymbolConfig {
  id: SymbolId
  label: string
  base: string
  quote: Currency
  feedSymbol: string
  feedLabel: string
  tickSize: number
  priceDecimals: number
  qtyDecimals: number
  minNotional: number
  bookSteps: number[]
}

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Trade {
  id: number
  price: number
  qty: number
  time: number
  side: TradeSide
}

export interface OrderBookLevel {
  price: number
  qty: number
}

export interface OrderBook {
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
}

export interface Ticker {
  changePercent: number
  high: number
  low: number
  volume: number
}

export interface CandleSeries {
  candles: Candle[]
  status: CandleStatus
  hasMore: boolean
  loadingOlder: boolean
}

export interface CandleListener {
  onReset(candles: Candle[]): void
  onHistory(candles: Candle[], prepended: number): void
  onUpdate(candle: Candle): void
}

export interface FetchCandlesOptions {
  limit: number
  startTime?: number
  endTime?: number
}

export interface MarketStreamHandlers {
  onOpen(): void
  onClose(): void
  onTrade(symbol: SymbolId, trade: Trade): void
  onBook(symbol: SymbolId, book: OrderBook): void
  onTicker(symbol: SymbolId, ticker: Ticker): void
}

export interface MarketEventListener {
  onOpen(): void
  onTrade(symbol: SymbolId, trade: Trade): void
  onBook(symbol: SymbolId, book: OrderBook): void
}

export interface MarketStream {
  close(): void
}

export interface IMarketRepository {
  fetchCandles(
    symbol: SymbolId,
    interval: CandleInterval,
    options: FetchCandlesOptions
  ): Promise<Candle[]>
  fetchRecentTrades(symbol: SymbolId, limit: number): Promise<Trade[]>
  fetchOrderBook(symbol: SymbolId, limit: number): Promise<OrderBook>
  openStream(handlers: MarketStreamHandlers): MarketStream
}

export interface IMarketService {
  start(): void
  getSymbols(): SymbolConfig[]
  getSymbol(symbol: SymbolId): SymbolConfig
  resolveSymbol(value: string): SymbolId | null
  getTimeframes(): Timeframe[]
  getSelectedTimeframe(): Timeframe
  setSelectedTimeframe(timeframe: Timeframe): void
  getConnectionStatus(): ConnectionStatus
  getTicker(symbol: SymbolId): Ticker | undefined
  getLastPrice(symbol: SymbolId): number | undefined
  getMarkPrice(symbol: SymbolId): number | undefined
  getOrderBook(symbol: SymbolId): OrderBook | undefined
  getDeepBook(symbol: SymbolId): OrderBook | undefined
  watchDeepBook(symbol: SymbolId): () => void
  getOrderBookStep(symbol: SymbolId): number
  changeOrderBookStep(symbol: SymbolId, direction: 1 | -1): void
  getLatestBook(symbol: SymbolId): OrderBook | undefined
  isLive(): boolean
  getMarketTime(): number
  subscribeMarketEvents(listener: MarketEventListener): () => void
  subscribeLastPrice(
    symbol: SymbolId,
    listener: (price: number) => void
  ): () => void
  getRecentTrades(symbol: SymbolId): Trade[]
  getCandleStatus(symbol: SymbolId, timeframe: Timeframe): CandleStatus
  subscribeCandles(
    symbol: SymbolId,
    timeframe: Timeframe,
    listener: CandleListener
  ): () => void
  getMinuteCandlesSince(symbol: SymbolId, startTime: number): Promise<Candle[]>
  getPeriodCandles(
    symbol: SymbolId,
    interval: CandleInterval,
    limit: number
  ): Promise<Candle[]>
  loadOlderCandles(symbol: SymbolId, timeframe: Timeframe): Promise<void>
  reloadCandles(symbol: SymbolId, timeframe: Timeframe): Promise<void>
}

export interface ChartPreferencesState {
  timeframe: Timeframe
  bookSteps: Partial<Record<SymbolId, number>>
  setTimeframe(timeframe: Timeframe): void
  setBookStep(symbol: SymbolId, step: number): void
}

export interface MarketState {
  status: ConnectionStatus
  tickers: Partial<Record<SymbolId, Ticker>>
  books: Partial<Record<SymbolId, OrderBook>>
  deepBooks: Partial<Record<SymbolId, OrderBook>>
  trades: Partial<Record<SymbolId, Trade[]>>
  series: Record<string, CandleSeries>
  setStatus(status: ConnectionStatus): void
  applyStreamBatch(
    batch: Pick<MarketState, 'tickers' | 'books' | 'trades'>
  ): void
  setDeepBook(symbol: SymbolId, book: OrderBook | undefined): void
  setSeries(key: string, series: CandleSeries): void
  removeSeries(key: string): void
}
