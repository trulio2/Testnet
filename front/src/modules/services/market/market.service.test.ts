import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IMarketRepository,
  MarketFeed,
  MarketStreamHandlers,
  OrderBook,
  SymbolId,
  Trade
} from '@/types'
import { chartPreferencesStore } from './chartPreferences.store'
import MarketService from './market.service'
import { marketStore } from './market.store'

const trade = (id: number, price: number): Trade => ({
  id,
  price,
  qty: 1,
  time: id,
  side: 'buy'
})

function setup(seedTrades: Partial<Record<SymbolId, Trade[]>> = {}) {
  const handlers: Partial<Record<MarketFeed, MarketStreamHandlers>> = {}
  const fetchTrades = vi.fn<IMarketRepository['fetchTrades']>(async () => [])
  const fetchOrderBook = vi.fn<IMarketRepository['fetchOrderBook']>(
    async () => ({
      bids: [{ price: 1, qty: 1 }],
      asks: [{ price: 2, qty: 1 }]
    })
  )

  const repository: IMarketRepository = {
    fetchCandles: async () => [],
    fetchRecentTrades: async (symbol) => seedTrades[symbol] ?? [],
    fetchTrades,
    fetchOrderBook,
    openStream(feed, streamHandlers) {
      handlers[feed] = streamHandlers

      return { close() {} }
    }
  }
  const service = new MarketService(repository)

  service.start()

  return {
    service,
    fetchOrderBook,
    fetchTrades,
    handlers,
    open: (feed: MarketFeed = 'spot') => handlers[feed]?.onOpen(),
    close: (feed: MarketFeed) => handlers[feed]?.onClose(),
    sendTrade: (symbol: SymbolId, value: Trade) =>
      handlers.spot?.onTrade(symbol, value)
  }
}

describe('subscribeLastPrice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', () => 0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reports each trade on the symbol', () => {
    const { service, sendTrade } = setup()
    const listener = vi.fn()

    service.subscribeLastPrice('BTCUSD', listener)
    sendTrade('BTCUSD', trade(1, 100))
    sendTrade('BTCUSD', trade(2, 101))

    expect(listener.mock.calls).toEqual([[100], [101]])
  })

  it('ignores trades on other symbols', () => {
    const { service, sendTrade } = setup()
    const listener = vi.fn()

    service.subscribeLastPrice('BTCUSD', listener)
    sendTrade('USDBRL', trade(1, 5))

    expect(listener).not.toHaveBeenCalled()
  })

  it('starts with the latest known price', () => {
    const { service, sendTrade } = setup()
    const listener = vi.fn()

    sendTrade('BTCUSD', trade(1, 100))
    service.subscribeLastPrice('BTCUSD', listener)

    expect(listener).toHaveBeenCalledWith(100)
  })

  it('stops after unsubscribing', () => {
    const { service, sendTrade } = setup()
    const listener = vi.fn()
    const unsubscribe = service.subscribeLastPrice('BTCUSD', listener)

    unsubscribe()
    sendTrade('BTCUSD', trade(1, 100))

    expect(listener).not.toHaveBeenCalled()
  })

  it('uses the newest seeded trade until the stream sends one', async () => {
    const { service, open } = setup({
      USDBRL: [trade(1, 5.1), trade(2, 5.2)]
    })
    const listener = vi.fn()

    service.subscribeLastPrice('USDBRL', listener)
    open()
    await vi.advanceTimersByTimeAsync(0)

    expect(listener.mock.calls).toEqual([[5.2]])
  })

  it('does not let a slower seed replace a price from the stream', async () => {
    const { service, open, sendTrade } = setup({ BTCUSD: [trade(1, 90)] })
    const listener = vi.fn()

    service.subscribeLastPrice('BTCUSD', listener)
    open()
    sendTrade('BTCUSD', trade(2, 100))
    await vi.advanceTimersByTimeAsync(0)

    expect(listener.mock.calls).toEqual([[100]])
  })
})

describe('watchDeepBook', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('document', { visibilityState: 'visible' })
    marketStore.setState({ deepBooks: {} })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('fetches straight away and then on an interval', async () => {
    const { service, fetchOrderBook } = setup()
    const stop = service.watchDeepBook('BTCUSD')

    await vi.advanceTimersByTimeAsync(0)
    expect(fetchOrderBook).toHaveBeenCalledTimes(1)
    expect(fetchOrderBook).toHaveBeenCalledWith('BTCUSD', 1000)
    expect(marketStore.getState().deepBooks.BTCUSD).toBeDefined()

    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchOrderBook).toHaveBeenCalledTimes(2)

    stop()
  })

  it('stops polling and clears the book when nothing is watching', async () => {
    const { service, fetchOrderBook } = setup()
    const stop = service.watchDeepBook('BTCUSD')

    await vi.advanceTimersByTimeAsync(0)
    stop()
    await vi.advanceTimersByTimeAsync(9000)

    expect(fetchOrderBook).toHaveBeenCalledTimes(1)
    expect(marketStore.getState().deepBooks.BTCUSD).toBeUndefined()
  })

  it('shares one poll between watchers', async () => {
    const { service, fetchOrderBook } = setup()
    const stopFirst = service.watchDeepBook('BTCUSD')
    const stopSecond = service.watchDeepBook('BTCUSD')

    await vi.advanceTimersByTimeAsync(0)
    expect(fetchOrderBook).toHaveBeenCalledTimes(1)

    stopFirst()
    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchOrderBook).toHaveBeenCalledTimes(2)

    stopSecond()
  })

  it('ignores a response that arrives after watching stopped', async () => {
    const { service, fetchOrderBook } = setup()
    let resolve: (book: OrderBook) => void = () => {}

    fetchOrderBook.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )

    const stop = service.watchDeepBook('BTCUSD')

    stop()
    resolve({ bids: [], asks: [] })
    await vi.advanceTimersByTimeAsync(0)

    expect(marketStore.getState().deepBooks.BTCUSD).toBeUndefined()
  })

  it('skips polling while the tab is hidden', async () => {
    const { service, fetchOrderBook } = setup()

    vi.stubGlobal('document', { visibilityState: 'hidden' })

    const stop = service.watchDeepBook('BTCUSD')

    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchOrderBook).not.toHaveBeenCalled()

    stop()
  })

  it('keeps going after a failed request', async () => {
    const { service, fetchOrderBook } = setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    fetchOrderBook.mockRejectedValueOnce(new Error('offline'))

    const stop = service.watchDeepBook('BTCUSD')

    await vi.advanceTimersByTimeAsync(3000)

    expect(fetchOrderBook).toHaveBeenCalledTimes(2)
    expect(marketStore.getState().deepBooks.BTCUSD).toBeDefined()

    stop()
    consoleError.mockRestore()
  })
})

describe('changeOrderBookStep', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    chartPreferencesStore.setState({ bookSteps: {} })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const stored = (symbol: SymbolId) =>
    chartPreferencesStore.getState().bookSteps[symbol]

  it('moves up from the smallest step', () => {
    const { service } = setup()

    service.changeOrderBookStep('BTCUSD', 1)

    expect(stored('BTCUSD')).toBe(0.1)
  })

  it('moves back down', () => {
    const { service } = setup()

    service.changeOrderBookStep('BTCUSD', 1)
    service.changeOrderBookStep('BTCUSD', 1)
    service.changeOrderBookStep('BTCUSD', -1)

    expect(stored('BTCUSD')).toBe(0.1)
  })

  it('stops at the symbol’s maximum', () => {
    const { service } = setup()

    for (let i = 0; i < 20; i++) service.changeOrderBookStep('BTCUSD', 1)

    expect(stored('BTCUSD')).toBe(25)
  })

  it('stops at the smallest step', () => {
    const { service } = setup()

    service.changeOrderBookStep('BTCUSD', 1)

    for (let i = 0; i < 5; i++) service.changeOrderBookStep('BTCUSD', -1)

    expect(stored('BTCUSD')).toBe(0.01)
  })

  it('keeps each symbol separate', () => {
    const { service } = setup()

    service.changeOrderBookStep('USDBRL', 1)

    expect(stored('USDBRL')).toBe(0.0005)
    expect(stored('BTCUSD')).toBeUndefined()
  })

  it('treats a step no longer offered as the smallest', () => {
    const { service } = setup()

    chartPreferencesStore.setState({ bookSteps: { BTCUSD: 3 } })
    service.changeOrderBookStep('BTCUSD', 1)

    expect(stored('BTCUSD')).toBe(0.1)
  })
})

describe('feeds', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('document', { visibilityState: 'visible' })
    marketStore.setState({
      status: { spot: 'connecting', futures: 'connecting' }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('opens a stream for each feed', () => {
    const { handlers } = setup()

    expect(Object.keys(handlers).sort()).toEqual(['futures', 'spot'])
  })

  it('keeps spot live while futures cannot connect', () => {
    const { service, open, close } = setup()

    open('spot')
    close('futures')

    expect(service.isLive('BTCUSD')).toBe(true)
    expect(service.isLive('NVDAUSD')).toBe(false)
  })
})

describe('history on futures', () => {
  const NOW = 10 * 86_400_000

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns no trades older than the exchange keeps, without asking', async () => {
    const { service, fetchTrades } = setup()
    const trades = await service.getHistoryTrades('NVDAUSD', {
      limit: 1000,
      startTime: NOW - 3 * 86_400_000
    })

    expect(trades).toEqual([])
    expect(fetchTrades).not.toHaveBeenCalled()
  })

  it('asks for recent trades as usual', async () => {
    const { service, fetchTrades } = setup()

    await service.getHistoryTrades('NVDAUSD', {
      limit: 1000,
      startTime: NOW - 3_600_000
    })

    expect(fetchTrades).toHaveBeenCalledTimes(1)
  })

  it('builds one-second candles from trades, page by page', async () => {
    const { service, fetchTrades } = setup()
    const start = NOW - 3_600_000
    const all = Array.from({ length: 1500 }, (_, id): Trade => ({
      id,
      price: 100 + (id % 7),
      qty: 1,
      time: start + Math.floor(id / 25) * 1000,
      side: 'buy'
    }))

    fetchTrades.mockImplementation(async (_, { startTime = 0, limit }) =>
      all.filter((trade) => trade.time >= startTime).slice(0, limit)
    )

    const candles = await service.getHistoryCandles('NVDAUSD', '1s', {
      limit: 1000,
      startTime: start,
      endTime: start + 59_999
    })

    expect(candles).toHaveLength(60)
    expect(candles[0]).toMatchObject({
      time: start / 1000,
      low: 100,
      high: 106
    })
    expect(candles.reduce((sum, candle) => sum + candle.volume, 0)).toBe(1500)
  })

  it('has no one-second candles once the trades are gone', async () => {
    const { service } = setup()

    expect(
      await service.getHistoryCandles('NVDAUSD', '1s', {
        limit: 1000,
        startTime: NOW - 5 * 86_400_000
      })
    ).toEqual([])
  })
})
