import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IMarketRepository,
  MarketStreamHandlers,
  SymbolId,
  Trade
} from '@/types'
import MarketService from './market.service'

const trade = (id: number, price: number): Trade => ({
  id,
  price,
  qty: 1,
  time: id,
  side: 'buy'
})

function setup(seedTrades: Partial<Record<SymbolId, Trade[]>> = {}) {
  let handlers: MarketStreamHandlers | undefined

  const repository: IMarketRepository = {
    fetchCandles: async () => [],
    fetchRecentTrades: async (symbol) => seedTrades[symbol] ?? [],
    openStream(streamHandlers) {
      handlers = streamHandlers

      return { close() {} }
    }
  }
  const service = new MarketService(repository)

  service.start()

  return {
    service,
    open: () => handlers?.onOpen(),
    sendTrade: (symbol: SymbolId, value: Trade) =>
      handlers?.onTrade(symbol, value)
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
