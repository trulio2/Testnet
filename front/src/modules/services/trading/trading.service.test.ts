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
    getLatestBook: () => undefined,
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
      listeners.forEach((listener) => listener.onTrade('BTCUSD', value)),
    sendBook: (bid: number, ask: number) =>
      listeners.forEach((listener) =>
        listener.onBook('BTCUSD', {
          bids: [{ price: bid, qty: 1 }],
          asks: [{ price: ask, qty: 1 }]
        })
      )
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

  it('keeps paging when a filled order leaves a position to watch', async () => {
    const { getMinuteCandlesSince, open } = setup()
    const fullPage = Array.from({ length: MINUTE_CANDLES_PAGE_SIZE }, (_, i) =>
      candle(100 + i, 90)
    )

    seed([order(1, 10 * MINUTE)], 100 * MINUTE)
    getMinuteCandlesSince.mockResolvedValueOnce(fullPage)

    open()
    await flush()

    expect(tradingStore.getState().account.positions.BTCUSD).toBeDefined()
    expect(getMinuteCandlesSince).toHaveBeenCalledTimes(2)
  })

  it('stops paging once a cancelled order leaves nothing to watch', async () => {
    const { getMinuteCandlesSince, open } = setup()
    const fullPage = Array.from({ length: MINUTE_CANDLES_PAGE_SIZE }, (_, i) =>
      candle(100 + i)
    )
    let resolve: (candles: Candle[]) => void = () => {}

    seed([order(1, 10 * MINUTE)], 100 * MINUTE)
    getMinuteCandlesSince.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )

    open()
    await flush()
    tradingStore.getState().setAccount(createAccount())
    resolve(fullPage)
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

describe('liquidation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    seed([])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Liquidates near 80.4: a 20 USD balance against 1 long entered at 100.
  const seedPosition = (updatedAt = 10 * MINUTE, lastProcessedAt = 0) =>
    tradingStore.setState({
      account: {
        ...createAccount(),
        balances: { USD: 20, BRL: 0 },
        positions: {
          BTCUSD: { symbol: 'BTCUSD', qty: 1, avgEntry: 100, updatedAt }
        }
      },
      lastProcessedAt
    })

  const account = () => tradingStore.getState().account

  it('closes the position when the book mid reaches the price', async () => {
    const { open, sendBook } = setup()

    seedPosition()
    open()
    await flush()

    sendBook(90, 91)
    expect(account().positions.BTCUSD).toBeDefined()

    sendBook(79, 80)
    expect(account().positions.BTCUSD).toBeUndefined()
    expect(account().fills[0]).toMatchObject({
      price: 79.5,
      isLiquidation: true
    })
    expect(account().liquidationNotices).toHaveLength(1)
  })

  it('ignores a trade print that never moves the book', async () => {
    const { open, sendTrade } = setup()

    seedPosition()
    open()
    await flush()
    sendTrade(trade(30 * MINUTE, 50))

    expect(account().positions.BTCUSD).toBeDefined()
  })

  it('waits for catch-up before liquidating from the live book', async () => {
    const { open, sendBook, getMinuteCandlesSince } = setup()

    seedPosition()
    getMinuteCandlesSince.mockReturnValueOnce(new Promise(() => {}))
    open()
    await flush()
    sendBook(79, 80)

    expect(account().positions.BTCUSD).toBeDefined()
  })

  it('catches up on a position with no open orders', async () => {
    const { open, getMinuteCandlesSince } = setup()

    seedPosition(10 * MINUTE, 20 * MINUTE)
    getMinuteCandlesSince.mockResolvedValueOnce([
      { ...candle(21), open: 90, low: 70 }
    ])
    open()
    await flush()

    expect(getMinuteCandlesSince).toHaveBeenCalledWith('BTCUSD', 20 * MINUTE)
    expect(account().positions.BTCUSD).toBeUndefined()
    expect(account().fills[0].time).toBe(21 * MINUTE)
    expect(account().fills[0].price).toBeCloseTo(80 / 0.995, 2)
  })

  it('starts from the position when it is newer than the saved time', async () => {
    const { open, getMinuteCandlesSince } = setup()

    seedPosition(30 * MINUTE + 5_000, 20 * MINUTE)
    open()
    await flush()

    expect(getMinuteCandlesSince).toHaveBeenCalledWith('BTCUSD', 30 * MINUTE)
  })

  it('stops paging once the position is gone', async () => {
    const { open, getMinuteCandlesSince } = setup()
    const fullPage = Array.from({ length: MINUTE_CANDLES_PAGE_SIZE }, (_, i) =>
      candle(100 + i, 50)
    )

    seedPosition(10 * MINUTE, 100 * MINUTE)
    getMinuteCandlesSince.mockResolvedValueOnce(fullPage)
    open()
    await flush()

    expect(getMinuteCandlesSince).toHaveBeenCalledTimes(1)
  })

  it('moves the saved time for a position without open orders', async () => {
    const { open, sendTrade } = setup()

    seedPosition(10 * MINUTE, 20 * MINUTE)
    open()
    await flush()
    sendTrade(trade(30 * MINUTE))

    expect(tradingStore.getState().lastProcessedAt).toBe(30 * MINUTE)
  })
})
