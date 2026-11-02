import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  Candle,
  IMarketService,
  MarketEventListener,
  Order,
  Trade
} from '@/types'
import { MINUTE_CANDLES_PAGE_SIZE, SYMBOLS } from '@/utils'

// The store persists to localStorage, which doesn't exist under Node.
vi.hoisted(() => {
  const items = new Map<string, string>()

  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key)
    }
  })
})

const { createAccount } = await import('./trading.engine')
const { tradingStore } = await import('./trading.store')
const { default: TradingService } = await import('./trading.service')

const MINUTE = 60_000

const order = (id: number, createdAt: number, price = 95): Order => ({
  id,
  symbol: 'BTCUSD',
  side: 'buy',
  qty: 1,
  price,
  createdAt
})

const candle = (minute: number, low = 100): Candle => ({
  time: (minute * MINUTE) / 1000,
  open: 100,
  high: 110,
  low,
  close: 100,
  volume: 1
})

const trade = (time: number, price = 100): Trade => ({
  id: time,
  price,
  qty: 1,
  time,
  side: 'buy'
})

function setup() {
  const listeners: MarketEventListener[] = []
  const getMinuteCandlesSince =
    vi.fn<(symbol: string, startTime: number) => Promise<Candle[]>>()

  getMinuteCandlesSince.mockResolvedValue([])

  const market = {
    getSymbols: () => Object.values(SYMBOLS),
    getMarketTime: () => Date.now(),
    getMinuteCandlesSince,
    subscribeMarketEvents(listener: MarketEventListener) {
      listeners.push(listener)

      return () => {}
    }
  } as unknown as IMarketService
  const service = new TradingService(market)

  service.start()

  return {
    getMinuteCandlesSince,
    open: () => listeners.forEach((listener) => listener.onOpen()),
    sendTrade: (value: Trade) =>
      listeners.forEach((listener) => listener.onTrade('BTCUSD', value))
  }
}

function seed(orders: Order[], lastProcessedAt = 0) {
  tradingStore.setState({
    account: { ...createAccount(), openOrders: orders },
    lastProcessedAt
  })
}

const flush = () => vi.advanceTimersByTimeAsync(0)

describe('catch-up', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    seed([])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fills an order the market crossed while the stream was down', async () => {
    const { getMinuteCandlesSince, open } = setup()

    seed([order(1, 10 * MINUTE)], 20 * MINUTE)
    getMinuteCandlesSince.mockResolvedValueOnce([candle(21), candle(22, 90)])

    open()
    await flush()

    const { account } = tradingStore.getState()

    expect(account.openOrders).toHaveLength(0)
    expect(account.fills[0]).toMatchObject({
      price: 95,
      liquidity: 'maker',
      time: 22 * MINUTE
    })
  })

  it('starts from the last saved minute, not the order time', async () => {
    const { getMinuteCandlesSince, open } = setup()

    seed([order(1, 10 * MINUTE)], 20 * MINUTE + 5_000)

    open()
    await flush()

    expect(getMinuteCandlesSince).toHaveBeenCalledWith('BTCUSD', 20 * MINUTE)
  })

  it('starts from the order when it is newer than the saved time', async () => {
    const { getMinuteCandlesSince, open } = setup()

    seed([order(1, 30 * MINUTE + 5_000)], 20 * MINUTE)

    open()
    await flush()

    expect(getMinuteCandlesSince).toHaveBeenCalledWith('BTCUSD', 30 * MINUTE)
  })

  it('makes no requests without open orders', async () => {
    const { getMinuteCandlesSince, open } = setup()

    open()
    await flush()

    expect(getMinuteCandlesSince).not.toHaveBeenCalled()
  })

  it('only requests symbols that have open orders', async () => {
    const { getMinuteCandlesSince, open } = setup()

    seed([order(1, 10 * MINUTE)])

    open()
    await flush()

    expect(getMinuteCandlesSince).toHaveBeenCalledTimes(1)
  })

  it('pages through a long gap until a short page', async () => {
    const { getMinuteCandlesSince, open } = setup()
    const fullPage = Array.from({ length: MINUTE_CANDLES_PAGE_SIZE }, (_, i) =>
      candle(100 + i)
    )

    seed([order(1, 10 * MINUTE)], 100 * MINUTE)
    getMinuteCandlesSince
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([candle(1100)])

    open()
    await flush()

    expect(getMinuteCandlesSince).toHaveBeenCalledTimes(2)
    expect(getMinuteCandlesSince).toHaveBeenLastCalledWith(
      'BTCUSD',
      1100 * MINUTE
    )
  })

  it('stops paging once no orders remain', async () => {
    const { getMinuteCandlesSince, open } = setup()
    const fullPage = Array.from({ length: MINUTE_CANDLES_PAGE_SIZE }, (_, i) =>
      candle(100 + i, 90)
    )

    seed([order(1, 10 * MINUTE)], 100 * MINUTE)
    getMinuteCandlesSince.mockResolvedValueOnce(fullPage)

    open()
    await flush()

    expect(getMinuteCandlesSince).toHaveBeenCalledTimes(1)
  })

  it('keeps an order cancelled during the request cancelled', async () => {
    const { getMinuteCandlesSince, open } = setup()
    let resolve: (candles: Candle[]) => void = () => {}

    seed([order(1, 10 * MINUTE)], 20 * MINUTE)
    getMinuteCandlesSince.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )

    open()
    await flush()
    tradingStore.getState().setAccount(createAccount())
    resolve([candle(21, 90)])
    await flush()

    expect(tradingStore.getState().account.fills).toHaveLength(0)
  })

  it('retries after a failed request and then fills', async () => {
    const { getMinuteCandlesSince, open } = setup()

    seed([order(1, 10 * MINUTE)], 20 * MINUTE)
    getMinuteCandlesSince
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([candle(21, 90)])

    open()
    await flush()

    expect(tradingStore.getState().account.openOrders).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(30_000)

    expect(tradingStore.getState().account.openOrders).toHaveLength(0)
  })

  it('does not run two catch-ups at once, and reruns for a later drop', async () => {
    const { getMinuteCandlesSince, open } = setup()
    let resolve: (candles: Candle[]) => void = () => {}

    seed([order(1, 10 * MINUTE)], 20 * MINUTE)
    getMinuteCandlesSince.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )

    open()
    open()
    await flush()

    expect(getMinuteCandlesSince).toHaveBeenCalledTimes(1)

    resolve([])
    await flush()

    expect(getMinuteCandlesSince).toHaveBeenCalledTimes(2)
  })
})

describe('saved processing time', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    seed([])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const lastProcessedAt = () => tradingStore.getState().lastProcessedAt

  it('does not move before the first catch-up has run', () => {
    const { sendTrade } = setup()

    seed([order(1, 10 * MINUTE, 50)], 20 * MINUTE)
    sendTrade(trade(30 * MINUTE))

    expect(lastProcessedAt()).toBe(20 * MINUTE)
  })

  it('moves with trades after catch-up, at most every 5 seconds', async () => {
    const { open, sendTrade } = setup()

    seed([order(1, 10 * MINUTE, 50)], 20 * MINUTE)
    open()
    await flush()

    sendTrade(trade(30 * MINUTE))
    expect(lastProcessedAt()).toBe(30 * MINUTE)

    sendTrade(trade(30 * MINUTE + 4_000))
    expect(lastProcessedAt()).toBe(30 * MINUTE)

    sendTrade(trade(30 * MINUTE + 5_000))
    expect(lastProcessedAt()).toBe(30 * MINUTE + 5_000)
  })

  it('stays put without open orders', async () => {
    const { open, sendTrade } = setup()

    open()
    await flush()
    sendTrade(trade(30 * MINUTE))

    expect(lastProcessedAt()).toBe(0)
  })

  it('stays put while a failed catch-up is waiting to retry', async () => {
    const { getMinuteCandlesSince, open, sendTrade } = setup()

    seed([order(1, 10 * MINUTE, 50)], 20 * MINUTE)
    getMinuteCandlesSince.mockRejectedValueOnce(new Error('offline'))

    open()
    await flush()
    sendTrade(trade(30 * MINUTE))

    expect(lastProcessedAt()).toBe(20 * MINUTE)
  })

  it('stops again after a reconnect until the new gap is replayed', async () => {
    const { getMinuteCandlesSince, open, sendTrade } = setup()

    seed([order(1, 10 * MINUTE, 50)], 20 * MINUTE)
    open()
    await flush()
    sendTrade(trade(30 * MINUTE))

    getMinuteCandlesSince.mockReturnValueOnce(new Promise(() => {}))
    open()
    await flush()
    sendTrade(trade(40 * MINUTE))

    expect(lastProcessedAt()).toBe(30 * MINUTE)
  })
})
