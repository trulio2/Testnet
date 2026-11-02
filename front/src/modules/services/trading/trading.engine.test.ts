import { describe, expect, it } from 'vitest'
import type {
  OrderBook,
  OrderRequest,
  SymbolId,
  TradeSide,
  TradingAccount
} from '@/types'
import {
  cancelOpenOrder,
  createAccount,
  getAccountSummary,
  getBookFillPrice,
  INITIAL_BALANCE,
  MAKER_FEE_RATE,
  matchRestingOrders,
  submitOrder,
  TAKER_FEE_RATE
} from './trading.engine'

const NOW = 1_000

function bookAround(bid: number, ask: number, qty = 100): OrderBook {
  return {
    bids: [{ price: bid, qty }],
    asks: [{ price: ask, qty }]
  }
}

function place(
  account: TradingAccount,
  request: OrderRequest,
  book: OrderBook = bookAround(99, 101)
) {
  const mid = (book.bids[0].price + book.asks[0].price) / 2
  const result = submitOrder(account, {
    request,
    book,
    marks: { [request.symbol]: mid },
    time: NOW
  })

  if (!result.ok) throw new Error(`rejected: ${result.reason}`)

  return result
}

function fillAt(
  account: TradingAccount,
  side: TradeSide,
  qty: number,
  price: number,
  symbol: SymbolId = 'BTCUSD'
) {
  return place(
    account,
    { symbol, side, type: 'market', qty },
    bookAround(price, price, 1_000_000)
  ).account
}

describe('getBookFillPrice', () => {
  const levels = [
    { price: 100, qty: 1 },
    { price: 102, qty: 1 }
  ]

  it('uses only the best level when it covers the order', () => {
    expect(getBookFillPrice(levels, 0.5)).toBe(100)
  })

  it('averages across the levels it consumes', () => {
    expect(getBookFillPrice(levels, 2)).toBe(101)
  })

  it('takes any remainder at the worst visible price', () => {
    expect(getBookFillPrice(levels, 4)).toBe(101.5)
  })

  it('returns undefined for an empty side', () => {
    expect(getBookFillPrice([], 1)).toBeUndefined()
  })
})

describe('market orders', () => {
  it('buys at the ask and pays the taker fee', () => {
    const { account, fill } = place(createAccount(), {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'market',
      qty: 1
    })

    expect(fill?.price).toBe(101)
    expect(fill?.liquidity).toBe('taker')
    expect(account.positions.BTCUSD).toEqual({
      symbol: 'BTCUSD',
      qty: 1,
      avgEntry: 101
    })
    expect(account.walletBalance).toBeCloseTo(
      INITIAL_BALANCE - 101 * TAKER_FEE_RATE
    )
  })

  it('sells at the bid', () => {
    const { fill } = place(createAccount(), {
      symbol: 'BTCUSD',
      side: 'sell',
      type: 'market',
      qty: 1
    })

    expect(fill?.price).toBe(99)
  })

  it('is rejected when the book has no levels', () => {
    const result = submitOrder(createAccount(), {
      request: { symbol: 'BTCUSD', side: 'buy', type: 'market', qty: 1 },
      book: { bids: [], asks: [] },
      marks: {},
      time: NOW
    })

    expect(result).toEqual({ ok: false, reason: 'marketUnavailable' })
  })
})

describe('limit orders', () => {
  it('rests without touching the wallet when it does not cross', () => {
    const { account, order, fill } = place(createAccount(), {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'limit',
      qty: 1,
      price: 95
    })

    expect(fill).toBeUndefined()
    expect(order?.price).toBe(95)
    expect(account.openOrders).toHaveLength(1)
    expect(account.walletBalance).toBe(INITIAL_BALANCE)
  })

  it('takes the best ask, not its own price, when it crosses', () => {
    const { account, fill } = place(createAccount(), {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'limit',
      qty: 1,
      price: 110
    })

    expect(fill?.price).toBe(101)
    expect(fill?.liquidity).toBe('taker')
    expect(account.openOrders).toHaveLength(0)
  })

  it('rounds the price to the tick size', () => {
    const { order } = place(createAccount(), {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'limit',
      qty: 1,
      price: 95.126
    })

    expect(order?.price).toBe(95.13)
  })

  it.each([0, -1, NaN])('rejects a price of %s', (price) => {
    const result = submitOrder(createAccount(), {
      request: { symbol: 'BTCUSD', side: 'buy', type: 'limit', qty: 1, price },
      book: bookAround(99, 101),
      marks: {},
      time: NOW
    })

    expect(result).toEqual({ ok: false, reason: 'invalidPrice' })
  })
})

describe('matchRestingOrders', () => {
  const resting = (side: TradeSide, price: number) =>
    place(createAccount(), {
      symbol: 'BTCUSD',
      side,
      type: 'limit',
      qty: 1,
      price
    }).account

  it('fills a buy when the market touches its price, at its price', () => {
    const account = matchRestingOrders(
      resting('buy', 95),
      'BTCUSD',
      { low: 95, high: 95 },
      NOW
    )

    expect(account.openOrders).toHaveLength(0)
    expect(account.fills[0]).toMatchObject({ price: 95, liquidity: 'maker' })
    expect(account.walletBalance).toBeCloseTo(
      INITIAL_BALANCE - 95 * MAKER_FEE_RATE
    )
  })

  it('fills a buy at its limit even when the market gaps through it', () => {
    const account = matchRestingOrders(
      resting('buy', 95),
      'BTCUSD',
      { low: 90, high: 90 },
      NOW
    )

    expect(account.fills[0].price).toBe(95)
  })

  it('fills a sell when the market reaches its price', () => {
    const account = matchRestingOrders(
      resting('sell', 105),
      'BTCUSD',
      { low: 105, high: 105 },
      NOW
    )

    expect(account.positions.BTCUSD?.qty).toBe(-1)
  })

  it('returns the same account when nothing is touched', () => {
    const account = resting('buy', 95)

    expect(
      matchRestingOrders(account, 'BTCUSD', { low: 95.01, high: 95.01 }, NOW)
    ).toBe(account)
  })

  it('ignores orders on other symbols', () => {
    const account = resting('buy', 95)

    expect(
      matchRestingOrders(account, 'USDBRL', { low: 1, high: 1 }, NOW)
    ).toBe(account)
  })

  it('uses a book crossing: best ask as low, best bid as high', () => {
    const account = resting('sell', 105)

    expect(
      matchRestingOrders(account, 'BTCUSD', { low: 106, high: 104 }, NOW)
    ).toBe(account)
    expect(
      matchRestingOrders(account, 'BTCUSD', { low: 106, high: 105 }, NOW)
        .openOrders
    ).toHaveLength(0)
  })

  it('fills oldest orders first', () => {
    const first = place(createAccount(), {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'limit',
      qty: 1,
      price: 95
    }).account
    const second = place(first, {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'limit',
      qty: 1,
      price: 96
    }).account

    const account = matchRestingOrders(
      second,
      'BTCUSD',
      { low: 90, high: 90 },
      NOW
    )

    expect(account.fills.map((fill) => fill.price)).toEqual([96, 95])
  })
})

describe('positions', () => {
  it('averages the entry when adding', () => {
    const account = fillAt(
      fillAt(createAccount(), 'buy', 1, 100),
      'buy',
      3,
      200
    )

    expect(account.positions.BTCUSD).toMatchObject({ qty: 4, avgEntry: 175 })
  })

  it('realizes profit on a partial close and keeps the entry', () => {
    const opened = fillAt(createAccount(), 'buy', 2, 100)
    const account = fillAt(opened, 'sell', 1, 150)

    expect(account.positions.BTCUSD).toMatchObject({ qty: 1, avgEntry: 100 })
    expect(account.fills[0].realizedPnl).toBe(50)
  })

  it('removes the position on a full close', () => {
    const account = fillAt(
      fillAt(createAccount(), 'buy', 1, 100),
      'sell',
      1,
      90
    )

    expect(account.positions.BTCUSD).toBeUndefined()
    expect(account.fills[0].realizedPnl).toBe(-10)
  })

  it('flips with the entry at the fill price and realizes only the closed part', () => {
    const account = fillAt(
      fillAt(createAccount(), 'buy', 1, 100),
      'sell',
      3,
      120
    )

    expect(account.positions.BTCUSD).toMatchObject({ qty: -2, avgEntry: 120 })
    expect(account.fills[0].realizedPnl).toBe(20)
  })

  it('profits on a short when the price falls', () => {
    const account = fillAt(
      fillAt(createAccount(), 'sell', 1, 100),
      'buy',
      1,
      80
    )

    expect(account.fills[0].realizedPnl).toBe(20)
  })

  it('keeps quantities free of float noise', () => {
    const account = fillAt(
      fillAt(createAccount(), 'buy', 0.1, 100),
      'buy',
      0.2,
      100
    )

    expect(account.positions.BTCUSD?.qty).toBe(0.3)
  })

  it('books wallet changes as realized pnl minus fees', () => {
    const account = fillAt(
      fillAt(createAccount(), 'buy', 1, 100),
      'sell',
      1,
      150
    )
    const fees = (100 + 150) * TAKER_FEE_RATE

    expect(account.walletBalance).toBeCloseTo(INITIAL_BALANCE + 50 - fees)
  })
})

describe('USD/BRL', () => {
  it('converts realized pnl and fees from BRL to USD at the fill price', () => {
    const opened = fillAt(createAccount(), 'buy', 1000, 5, 'USDBRL')
    const account = fillAt(opened, 'sell', 1000, 5.5, 'USDBRL')
    const fill = account.fills[0]

    expect(fill.realizedPnl).toBeCloseTo(500 / 5.5)
    expect(fill.fee).toBeCloseTo(1000 * TAKER_FEE_RATE)
  })

  it('converts unrealized pnl at the mark price', () => {
    const account = fillAt(createAccount(), 'buy', 1000, 5, 'USDBRL')
    const { unrealizedPnl } = getAccountSummary(account, { USDBRL: 5.5 })

    expect(unrealizedPnl).toBeCloseTo(500 / 5.5)
  })

  it('needs margin in USD, not BRL', () => {
    const account = fillAt(createAccount(), 'buy', 1000, 5, 'USDBRL')

    expect(getAccountSummary(account, {}).usedMargin).toBeCloseTo(1000)
  })
})

describe('margin', () => {
  it('rejects an order larger than the equity', () => {
    const result = submitOrder(createAccount(), {
      request: { symbol: 'BTCUSD', side: 'buy', type: 'market', qty: 2000 },
      book: bookAround(99, 101, 10_000),
      marks: {},
      time: NOW
    })

    expect(result).toEqual({ ok: false, reason: 'insufficientMargin' })
  })

  it('includes the fee in the requirement', () => {
    const result = submitOrder(createAccount(), {
      request: {
        symbol: 'BTCUSD',
        side: 'buy',
        type: 'market',
        qty: INITIAL_BALANCE / 100
      },
      book: bookAround(100, 100, 10_000),
      marks: {},
      time: NOW
    })

    expect(result).toEqual({ ok: false, reason: 'insufficientMargin' })
  })

  it('counts resting orders against available margin', () => {
    const { account } = place(createAccount(), {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'limit',
      qty: 1,
      price: 95
    })
    const summary = getAccountSummary(account, {})

    expect(summary.usedMargin).toBe(95)
    expect(summary.availableMargin).toBe(INITIAL_BALANCE - 95)
  })

  it('charges nothing extra for a resting order that closes a position', () => {
    const opened = fillAt(createAccount(), 'buy', 1, 100)
    const { account } = place(opened, {
      symbol: 'BTCUSD',
      side: 'sell',
      type: 'limit',
      qty: 1,
      price: 200
    })

    expect(getAccountSummary(account, {}).usedMargin).toBe(100)
  })

  it('charges only for the part of an order beyond the position', () => {
    const opened = fillAt(createAccount(), 'buy', 1, 100)
    const { account } = place(opened, {
      symbol: 'BTCUSD',
      side: 'sell',
      type: 'limit',
      qty: 3,
      price: 200
    })

    expect(getAccountSummary(account, {}).usedMargin).toBe(400)
  })

  it('always allows closing an underwater position', () => {
    const opened = fillAt(createAccount(), 'buy', 900, 100)
    const crashed = bookAround(10, 10, 10_000)
    const result = submitOrder(opened, {
      request: { symbol: 'BTCUSD', side: 'sell', type: 'market', qty: 900 },
      book: crashed,
      marks: { BTCUSD: 10 },
      time: NOW
    })

    expect(result.ok).toBe(true)
  })

  it('counts unrealized losses against new orders', () => {
    const opened = fillAt(createAccount(), 'buy', 900, 100)
    const result = submitOrder(opened, {
      request: { symbol: 'USDBRL', side: 'buy', type: 'market', qty: 5000 },
      book: bookAround(5, 5, 100_000),
      marks: { BTCUSD: 10, USDBRL: 5 },
      time: NOW
    })

    expect(result).toEqual({ ok: false, reason: 'insufficientMargin' })
  })
})

describe('order validation', () => {
  it.each([0, -1, NaN, 0.000001])('rejects a quantity of %s', (qty) => {
    const result = submitOrder(createAccount(), {
      request: { symbol: 'BTCUSD', side: 'buy', type: 'market', qty },
      book: bookAround(99, 101),
      marks: {},
      time: NOW
    })

    expect(result).toEqual({ ok: false, reason: 'invalidQty' })
  })

  it('rejects an order below the minimum notional', () => {
    const result = submitOrder(createAccount(), {
      request: { symbol: 'BTCUSD', side: 'buy', type: 'market', qty: 0.01 },
      book: bookAround(99, 101),
      marks: {},
      time: NOW
    })

    expect(result).toEqual({ ok: false, reason: 'belowMinNotional' })
  })

  it('lets a small order close a position despite the minimum', () => {
    const opened = fillAt(createAccount(), 'buy', 1, 100)
    const { account } = place(opened, {
      symbol: 'BTCUSD',
      side: 'sell',
      type: 'market',
      qty: 0.01
    })

    expect(account.positions.BTCUSD?.qty).toBe(0.99)
  })
})

describe('cancelOpenOrder', () => {
  it('removes only the given order and frees its margin', () => {
    const first = place(createAccount(), {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'limit',
      qty: 1,
      price: 95
    })
    const second = place(first.account, {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'limit',
      qty: 1,
      price: 90
    })
    const account = cancelOpenOrder(second.account, first.order?.id ?? 0)

    expect(account.openOrders.map((order) => order.price)).toEqual([90])
    expect(getAccountSummary(account, {}).usedMargin).toBe(90)
  })
})

describe('getAccountSummary', () => {
  it('adds unrealized pnl to equity', () => {
    const account = fillAt(createAccount(), 'sell', 1, 100)
    const summary = getAccountSummary(account, { BTCUSD: 90 })

    expect(summary.unrealizedPnl).toBe(10)
    expect(summary.equity).toBeCloseTo(account.walletBalance + 10)
  })

  it('treats a position with no mark as flat', () => {
    const account = fillAt(createAccount(), 'buy', 1, 100)

    expect(getAccountSummary(account, {}).unrealizedPnl).toBe(0)
  })
})
