import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IMarketService,
  MarketEventListener,
  Order,
  SymbolId,
  Trade
} from '@/types'
import { SYMBOLS } from '@/utils'
import { createHistory, type PricePoint } from './trading.history.fixture'

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
const { simulationStore } = await import('./simulation.store')
const { default: TradingService } = await import('./trading.service')

const MINUTE = 60_000

const order = (id: number, createdAt: number, price = 95): Order => ({
  id,
  market: 'margin',
  symbol: 'BTCUSD',
  side: 'buy',
  qty: 1,
  price,
  createdAt
})

const trade = (time: number, price = 100): Trade => ({
  id: time,
  price,
  qty: 1,
  time,
  side: 'buy'
})

function setup(points: Partial<Record<SymbolId, PricePoint[]>> = {}) {
  const listeners: MarketEventListener[] = []
  const history = createHistory(points)
  const getHistoryCandles = vi.fn(history.getHistoryCandles)
  const getHistoryTrades = vi.fn(history.getHistoryTrades)
  const market = {
    getSymbols: () => Object.values(SYMBOLS),
    getMarketTime: () => Date.now(),
    getLatestBook: () => undefined,
    isLive: () => true,
    getHistoryCandles,
    getHistoryTrades,
    subscribeMarketEvents(listener: MarketEventListener) {
      listeners.push(listener)

      return () => {}
    }
  } as unknown as IMarketService
  const service = new TradingService(market)

  service.start()

  const open = () => listeners.forEach((listener) => listener.onOpen())
  const sendTrade = (value: Trade, symbol: SymbolId = 'BTCUSD') =>
    listeners.forEach((listener) => listener.onTrade(symbol, value))

  return {
    service,
    history,
    getHistoryCandles,
    getHistoryTrades,
    open,
    sendTrade,
    // The stream opening, then the first trade that starts the simulation.
    async reconnect(time = 30 * MINUTE) {
      open()
      sendTrade(trade(time))
      await flush()
    },
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
  simulationStore.setState({ run: null })
}

const run = () => simulationStore.getState().run
const flush = () => vi.advanceTimersByTimeAsync(0)

describe('simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    seed([])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const account = () => tradingStore.getState().account

  it('fills an order the market crossed while the stream was down', async () => {
    const { reconnect } = setup({ BTCUSD: [[22 * MINUTE, 90]] })

    seed([order(1, 10 * MINUTE)], 20 * MINUTE)
    await reconnect()

    expect(account().openOrders).toHaveLength(0)
    expect(account().fills[0]).toMatchObject({
      price: 95,
      liquidity: 'maker',
      time: 22 * MINUTE
    })
  })

  it('waits for a live trade before it starts', async () => {
    const { getHistoryCandles, open } = setup()

    seed([order(1, 10 * MINUTE)], 20 * MINUTE)
    open()
    await flush()

    expect(getHistoryCandles).not.toHaveBeenCalled()
    expect(run()?.status).toBe('running')
    expect(run()?.isVisible).toBe(false)
  })

  it('starts from the saved time, not the order time', async () => {
    const { reconnect } = setup({ BTCUSD: [[15 * MINUTE, 90]] })

    seed([order(1, 10 * MINUTE)], 20 * MINUTE)
    await reconnect()

    expect(account().openOrders).toHaveLength(1)
  })

  it('starts from the order when it is newer than the saved time', async () => {
    const { reconnect } = setup({ BTCUSD: [[22 * MINUTE, 90]] })

    seed([order(1, 25 * MINUTE)], 20 * MINUTE)
    await reconnect()

    expect(account().openOrders).toHaveLength(1)
  })

  it('makes no requests and shows nothing without open orders', async () => {
    const { reconnect, getHistoryCandles, getHistoryTrades } = setup()

    await reconnect()

    expect(getHistoryCandles).not.toHaveBeenCalled()
    expect(getHistoryTrades).not.toHaveBeenCalled()
    expect(run()).toBeNull()
  })

  it('only requests symbols that have something open', async () => {
    const { reconnect, getHistoryCandles } = setup()

    seed([order(1, 10 * MINUTE)], 20 * MINUTE)
    await reconnect()

    expect(
      getHistoryCandles.mock.calls.map(([symbol]) => symbol)
    ).not.toContain('USDBRL')
  })

  describe('while it runs', () => {
    const holdRequests = (context: ReturnType<typeof setup>) => {
      let release = () => {}

      context.getHistoryCandles.mockImplementationOnce(
        (symbol, interval, options) =>
          new Promise((resolve) => {
            release = () =>
              resolve(
                context.history.getHistoryCandles(symbol, interval, options)
              )
          })
      )

      return () => release()
    }

    it('holds live trades, then applies them after the history', async () => {
      const context = setup({ BTCUSD: [[22 * MINUTE, 100]] })
      const release = holdRequests(context)

      seed([order(1, 10 * MINUTE)], 20 * MINUTE)
      context.open()
      context.sendTrade(trade(30 * MINUTE))
      await flush()
      context.sendTrade(trade(30 * MINUTE + 100, 90))

      expect(account().openOrders).toHaveLength(1)

      release()
      await flush()

      expect(account().openOrders).toHaveLength(0)
      expect(account().fills[0].time).toBe(30 * MINUTE + 100)
      expect(run()?.events).toHaveLength(1)
      expect(tradingStore.getState().lastProcessedAt).toBe(30 * MINUTE + 100)
    })

    it('does not liquidate from the live book', async () => {
      const context = setup()

      holdRequests(context)
      tradingStore.setState({
        account: {
          ...createAccount(),
          balances: { USD: 20, BRL: 0 },
          positions: {
            BTCUSD: {
              symbol: 'BTCUSD',
              qty: 1,
              avgEntry: 100,
              updatedAt: 10 * MINUTE
            }
          }
        }
      })
      await context.reconnect()
      context.sendBook(79, 80)

      expect(account().positions.BTCUSD).toBeDefined()
    })

    it('refuses new orders', async () => {
      const context = setup()

      holdRequests(context)
      seed([order(1, 10 * MINUTE)], 20 * MINUTE)
      await context.reconnect()

      expect(
        context.service.placeOrder({
          symbol: 'BTCUSD',
          side: 'buy',
          type: 'market',
          qty: 1
        })
      ).toEqual({ ok: false, reason: 'marketUnavailable' })
    })

    it('saves nothing until the end', async () => {
      const context = setup({
        BTCUSD: [[22 * MINUTE, 90]]
      })
      let release = () => {}

      context.getHistoryTrades.mockImplementationOnce(
        (symbol, options) =>
          new Promise((resolve) => {
            release = () =>
              resolve(context.history.getHistoryTrades(symbol, options))
          })
      )
      seed([order(1, 10 * MINUTE)], 20 * MINUTE)
      await context.reconnect()

      expect(account().openOrders).toHaveLength(1)
      expect(tradingStore.getState().lastProcessedAt).toBe(20 * MINUTE)

      release()
      await flush()

      expect(account().openOrders).toHaveLength(0)
    })

    it('runs once at a time, and again for a drop during the run', async () => {
      const context = setup()
      const release = holdRequests(context)

      seed([order(1, 10 * MINUTE)], 20 * MINUTE)
      await context.reconnect()
      context.open()

      const calls = context.getHistoryCandles.mock.calls.length

      await flush()
      expect(context.getHistoryCandles.mock.calls.length).toBe(calls)

      release()
      await flush()
      expect(run()?.status).toBe('running')

      context.sendTrade(trade(40 * MINUTE))
      await flush()

      expect(context.getHistoryCandles.mock.calls.length).toBeGreaterThan(calls)
      expect(run()?.status).toBe('done')
      expect(tradingStore.getState().lastProcessedAt).toBe(40 * MINUTE)
    })
  })

  describe('when requests fail', () => {
    const fail = (context: ReturnType<typeof setup>) =>
      context.getHistoryCandles.mockRejectedValueOnce(new Error('offline'))

    it('shows the failure and keeps trading paused', async () => {
      const context = setup({ BTCUSD: [[22 * MINUTE, 90]] })

      seed([order(1, 10 * MINUTE)], 20 * MINUTE)
      fail(context)
      await context.reconnect()

      expect(run()).toMatchObject({ status: 'failed', isVisible: true })

      context.sendTrade(trade(31 * MINUTE, 90))

      expect(account().openOrders).toHaveLength(1)
    })

    it('retries by itself and then fills', async () => {
      const context = setup({ BTCUSD: [[22 * MINUTE, 90]] })

      seed([order(1, 10 * MINUTE)], 20 * MINUTE)
      fail(context)
      await context.reconnect()

      await vi.advanceTimersByTimeAsync(30_000)
      context.sendTrade(trade(31 * MINUTE))
      await flush()

      expect(account().openOrders).toHaveLength(0)
      expect(run()?.status).toBe('done')
    })

    it('retries when asked', async () => {
      const context = setup({ BTCUSD: [[22 * MINUTE, 90]] })

      seed([order(1, 10 * MINUTE)], 20 * MINUTE)
      fail(context)
      await context.reconnect()

      context.service.retrySimulation()
      context.sendTrade(trade(31 * MINUTE))
      await flush()

      expect(account().openOrders).toHaveLength(0)
    })

    it('keeps no log rows from the failed attempt', async () => {
      const context = setup({ BTCUSD: [[22 * MINUTE, 90]] })

      seed([order(1, 10 * MINUTE), order(2, 10 * MINUTE, 50)], 20 * MINUTE)
      context.getHistoryCandles.mockImplementationOnce(
        context.history.getHistoryCandles
      )
      context.getHistoryCandles.mockImplementationOnce(
        context.history.getHistoryCandles
      )
      context.getHistoryCandles.mockImplementationOnce(
        context.history.getHistoryCandles
      )
      await context.reconnect()

      expect(run()?.events).toHaveLength(1)

      context.service.dismissSimulation()
      tradingStore.setState({
        account: {
          ...createAccount(),
          openOrders: [order(1, 10 * MINUTE)]
        },
        lastProcessedAt: 20 * MINUTE
      })
      context.getHistoryTrades.mockRejectedValueOnce(new Error('offline'))
      await context.reconnect()

      expect(run()).toMatchObject({ status: 'failed', events: [] })
    })
  })

  describe('the window', () => {
    it('shows for a gap of a minute or more, even with nothing to report', async () => {
      const { reconnect } = setup()

      seed([order(1, 10 * MINUTE)], 20 * MINUTE)
      await reconnect(21 * MINUTE)

      expect(run()).toMatchObject({
        status: 'done',
        isVisible: true,
        events: [],
        balances: []
      })
    })

    it('stays hidden for a quick reload with nothing to report', async () => {
      const { reconnect } = setup()

      seed([order(1, 10 * MINUTE)], 20 * MINUTE)
      await reconnect(20 * MINUTE + 5_000)

      expect(run()).toBeNull()
    })

    it('shows for a quick reload when something happened', async () => {
      const { reconnect } = setup({ BTCUSD: [[20 * MINUTE + 2_000, 90]] })

      seed([order(1, 10 * MINUTE)], 20 * MINUTE)
      await reconnect(20 * MINUTE + 5_000)

      expect(run()).toMatchObject({ status: 'done', isVisible: true })
      expect(run()?.events).toHaveLength(1)
    })

    it('reports what happened to each balance', async () => {
      const { reconnect } = setup({
        USDBRL: [[22 * MINUTE, 6]]
      })

      seed(
        [
          {
            ...order(1, 10 * MINUTE, 6),
            symbol: 'USDBRL',
            market: 'spot',
            side: 'sell',
            qty: 100
          }
        ],
        20 * MINUTE
      )

      const { USD, BRL } = account().balances

      await reconnect()

      const balances = run()?.balances ?? []

      expect(balances.map(({ currency }) => currency)).toEqual(['USD', 'BRL'])
      expect(balances[0]).toEqual({
        currency: 'USD',
        before: USD,
        after: USD - 100
      })
      expect(balances[1].before).toBe(BRL)
      expect(balances[1].after).toBeCloseTo(BRL + 600 - 600 * 0.0002)
    })

    it('goes away when dismissed', async () => {
      const { reconnect, service } = setup()

      seed([order(1, 10 * MINUTE)], 20 * MINUTE)
      await reconnect()
      service.dismissSimulation()

      expect(run()).toBeNull()
    })

    it('adds to the log when a later gap comes before it is closed', async () => {
      const { reconnect } = setup({
        BTCUSD: [
          [22 * MINUTE, 90],
          [35 * MINUTE, 40]
        ]
      })

      seed([order(1, 10 * MINUTE), order(2, 10 * MINUTE, 50)], 20 * MINUTE)
      await reconnect()
      expect(run()?.events).toHaveLength(1)

      await reconnect(40 * MINUTE)
      expect(run()?.events.map(({ price }) => price)).toEqual([95, 50])
    })
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

  it('does not move before the first simulation has run', () => {
    const { sendTrade } = setup()

    seed([order(1, 10 * MINUTE, 50)], 20 * MINUTE)
    sendTrade(trade(30 * MINUTE))

    expect(lastProcessedAt()).toBe(20 * MINUTE)
  })

  it('moves with trades after the simulation, at most every 5 seconds', async () => {
    const { reconnect, sendTrade } = setup()

    seed([order(1, 10 * MINUTE, 50)], 20 * MINUTE)
    await reconnect()

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

  it('stays put while a failed simulation is waiting to retry', async () => {
    const { getHistoryCandles, reconnect, sendTrade } = setup()

    seed([order(1, 10 * MINUTE, 50)], 20 * MINUTE)
    getHistoryCandles.mockRejectedValueOnce(new Error('offline'))

    await reconnect()
    sendTrade(trade(31 * MINUTE))

    expect(lastProcessedAt()).toBe(20 * MINUTE)
  })

  it('stops again after a reconnect until the new gap is replayed', async () => {
    const { getHistoryCandles, reconnect, sendTrade } = setup()

    seed([order(1, 10 * MINUTE, 50)], 20 * MINUTE)
    await reconnect()

    getHistoryCandles.mockReturnValueOnce(new Promise(() => {}))
    await reconnect(40 * MINUTE)
    sendTrade(trade(50 * MINUTE))

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
    const { reconnect, sendBook } = setup()

    seedPosition()
    await reconnect()

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
    const { reconnect, sendTrade } = setup()

    seedPosition()
    await reconnect()
    sendTrade(trade(30 * MINUTE, 50))

    expect(account().positions.BTCUSD).toBeDefined()
  })

  it('replays a position with no open orders', async () => {
    const { reconnect } = setup({
      BTCUSD: [
        [21 * MINUTE, 90],
        [21 * MINUTE + 1_000, 70]
      ]
    })

    seedPosition(10 * MINUTE, 20 * MINUTE)
    await reconnect()

    expect(account().positions.BTCUSD).toBeUndefined()
    expect(account().fills[0].time).toBe(21 * MINUTE + 1_000)
    expect(account().fills[0].price).toBeCloseTo(80 / 0.995, 2)
  })

  it('starts from the position when it is newer than the saved time', async () => {
    const { reconnect } = setup({ BTCUSD: [[25 * MINUTE, 70]] })

    seedPosition(30 * MINUTE + 5_000, 20 * MINUTE)
    await reconnect(31 * MINUTE)

    expect(account().positions.BTCUSD).toBeDefined()
  })

  it('moves the saved time for a position without open orders', async () => {
    const { reconnect } = setup()

    seedPosition(10 * MINUTE, 20 * MINUTE)
    await reconnect()

    expect(tradingStore.getState().lastProcessedAt).toBe(30 * MINUTE)
  })
})

describe('fee rates', () => {
  beforeEach(() => {
    seed([])
  })

  const rates = () => tradingStore.getState().account.feeRates.BTCUSD

  it('saves valid rates and refuses invalid ones', () => {
    const { service } = setup()

    expect(
      service.setFeeRates('BTCUSD', { maker: 0.001, taker: 0.002 })
    ).toEqual({ ok: true })
    expect(rates()).toEqual({ maker: 0.001, taker: 0.002 })

    expect(service.setFeeRates('BTCUSD', { maker: NaN, taker: 0.002 })).toEqual(
      {
        ok: false,
        reason: 'invalidFeeRates'
      }
    )
    expect(rates()).toEqual({ maker: 0.001, taker: 0.002 })
  })

  it('restores the defaults for one symbol', () => {
    const { service } = setup()
    const defaults = createAccount().feeRates.BTCUSD

    service.setFeeRates('BTCUSD', { maker: 0.001, taker: 0.002 })
    service.setFeeRates('USDBRL', { maker: 0.003, taker: 0.004 })
    service.resetFeeRates('BTCUSD')

    expect(rates()).toEqual(defaults)
    expect(tradingStore.getState().account.feeRates.USDBRL).toEqual({
      maker: 0.003,
      taker: 0.004
    })
  })

  it('keeps custom rates through an account reset', () => {
    const { service } = setup()

    service.setFeeRates('BTCUSD', { maker: 0.001, taker: 0.002 })
    service.depositFunds('USD', 500)
    service.resetAccount()

    const { account } = tradingStore.getState()

    expect(account.balances.USD).toBe(createAccount().balances.USD)
    expect(account.feeRates.BTCUSD).toEqual({ maker: 0.001, taker: 0.002 })
  })
})

describe('spot', () => {
  const book = {
    bids: [{ price: 100, qty: 1000 }],
    asks: [{ price: 100, qty: 1000 }]
  }

  const setupSpot = () => {
    const context = setup()
    const market = context.service as unknown as {
      marketService: IMarketService
    }

    market.marketService.isLive = () => true
    market.marketService.getLatestBook = () => book
    context.open()

    return context
  }

  beforeEach(() => {
    seed([])
  })

  const account = () => tradingStore.getState().account

  it('sells only what open spot sells have not set aside', () => {
    const { service } = setupSpot()

    service.placeOrder({
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'market',
      market: 'spot',
      qty: 3
    })
    service.placeOrder({
      symbol: 'BTCUSD',
      side: 'sell',
      type: 'limit',
      market: 'spot',
      qty: 1,
      price: 200
    })
    service.sellSpotHolding('BTCUSD')

    expect(account().spot.BTCUSD?.qty).toBe(1)
    expect(account().openOrders).toHaveLength(1)
  })

  it('does nothing when there is nothing to sell', () => {
    const { service } = setupSpot()

    expect(service.sellSpotHolding('BTCUSD')).toEqual({ ok: true })
    expect(account().fills).toHaveLength(0)
  })

  it('remembers the trade mode per symbol', () => {
    const { service } = setupSpot()

    service.setTradeMode('USDBRL', 'spot')

    expect(account().tradeMode).toEqual({ BTCUSD: 'margin', USDBRL: 'spot' })
  })

  it('clears spot holdings and the mode on an account reset', () => {
    const { service } = setupSpot()

    service.setTradeMode('BTCUSD', 'spot')
    service.placeOrder({
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'market',
      market: 'spot',
      qty: 1
    })
    service.resetAccount()

    expect(account().spot).toEqual({})
    expect(account().tradeMode.BTCUSD).toBe('margin')
  })
})
