import { describe, expect, it } from 'vitest'
import { MAX_DEPOSIT } from '@/utils'
import type {
  Candle,
  OrderBook,
  OrderRequest,
  SymbolId,
  TradeSide,
  TradingAccount,
  TradingAccountV3,
  TradingAccountV4
} from '@/types'
import {
  addDeposit,
  cancelOpenOrder,
  changeFeeRates,
  changeLeverage,
  createAccount,
  getAccountSummary,
  getBookFillPrice,
  getLiquidationPrice,
  INITIAL_BALANCES,
  liquidateIfBreached,
  MAINTENANCE_MARGIN_RATE,
  MAKER_FEE_RATE,
  matchRestingOrders,
  migrateAccountFromV1,
  migrateAccountFromV2,
  migrateAccountFromV3,
  migrateAccountFromV4,
  replayCandles,
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
      avgEntry: 101,
      updatedAt: NOW
    })
    expect(account.balances.USD).toBeCloseTo(
      INITIAL_BALANCES.USD - 101 * TAKER_FEE_RATE
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
    expect(account.balances.USD).toBe(INITIAL_BALANCES.USD)
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
    expect(account.balances.USD).toBeCloseTo(
      INITIAL_BALANCES.USD - 95 * MAKER_FEE_RATE
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

describe('replayCandles', () => {
  const candle = (time: number, low: number, high: number): Candle => ({
    time,
    open: low,
    high,
    low,
    close: high,
    volume: 1
  })
  // Placed at NOW (1000 ms), so a candle opening at 2 s starts after it.
  const resting = (side: TradeSide, price: number) =>
    place(createAccount(), {
      symbol: 'BTCUSD',
      side,
      type: 'limit',
      qty: 1,
      price
    }).account

  it('fills an order a later candle crossed, at its limit, as a maker', () => {
    const account = replayCandles(resting('buy', 95), 'BTCUSD', [
      candle(2, 90, 100)
    ])

    expect(account.openOrders).toHaveLength(0)
    expect(account.fills[0]).toMatchObject({
      price: 95,
      liquidity: 'maker',
      time: 2000
    })
  })

  it('fills sells on the candle high', () => {
    const account = replayCandles(resting('sell', 105), 'BTCUSD', [
      candle(2, 100, 105)
    ])

    expect(account.positions.BTCUSD?.qty).toBe(-1)
  })

  it('ignores a candle that opened before the order was placed', () => {
    const account = resting('buy', 95)

    expect(replayCandles(account, 'BTCUSD', [candle(0, 90, 100)])).toBe(account)
  })

  it('ignores a candle that opened as the order was placed', () => {
    const account = resting('buy', 95)

    expect(replayCandles(account, 'BTCUSD', [candle(1, 90, 100)])).toBe(account)
  })

  it('returns the same account when no candle crosses', () => {
    const account = resting('buy', 95)

    expect(
      replayCandles(account, 'BTCUSD', [candle(2, 96, 100), candle(3, 97, 99)])
    ).toBe(account)
  })

  it('does not fill an order twice across candles', () => {
    const account = replayCandles(resting('buy', 95), 'BTCUSD', [
      candle(2, 90, 100),
      candle(3, 90, 100)
    ])

    expect(account.fills).toHaveLength(1)
    expect(account.positions.BTCUSD?.qty).toBe(1)
  })

  it('leaves other symbols alone', () => {
    const account = resting('buy', 95)

    expect(replayCandles(account, 'USDBRL', [candle(2, 1, 1)])).toBe(account)
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

    expect(account.balances.USD).toBeCloseTo(INITIAL_BALANCES.USD + 50 - fees)
  })
})

describe('USD/BRL', () => {
  it('settles realized pnl and fees in BRL', () => {
    const opened = fillAt(createAccount(), 'buy', 1000, 5, 'USDBRL')
    const account = fillAt(opened, 'sell', 1000, 5.5, 'USDBRL')
    const fill = account.fills[0]
    const fees = (5000 + 5500) * TAKER_FEE_RATE

    expect(fill.realizedPnl).toBeCloseTo(500)
    expect(fill.fee).toBeCloseTo(5500 * TAKER_FEE_RATE)
    expect(account.balances.BRL).toBeCloseTo(INITIAL_BALANCES.BRL + 500 - fees)
  })

  it('leaves the USD balance alone', () => {
    const account = fillAt(createAccount(), 'buy', 1000, 5, 'USDBRL')

    expect(account.balances.USD).toBe(INITIAL_BALANCES.USD)
  })

  it('reports unrealized pnl in BRL', () => {
    const account = fillAt(createAccount(), 'buy', 1000, 5, 'USDBRL')
    const { unrealizedPnl } = getAccountSummary(account, 'BRL', { USDBRL: 5.5 })

    expect(unrealizedPnl).toBeCloseTo(500)
  })

  it('needs margin in BRL', () => {
    const account = fillAt(createAccount(), 'buy', 1000, 5, 'USDBRL')

    expect(getAccountSummary(account, 'BRL', {}).usedMargin).toBeCloseTo(5000)
    expect(getAccountSummary(account, 'USD', {}).usedMargin).toBe(0)
  })
})

describe('separate balances', () => {
  it('rejects a USD/BRL order larger than the BRL balance', () => {
    const result = submitOrder(createAccount(), {
      request: { symbol: 'USDBRL', side: 'buy', type: 'market', qty: 200_000 },
      book: bookAround(5, 5, 1_000_000),
      marks: {},
      time: NOW
    })

    expect(result).toEqual({ ok: false, reason: 'insufficientMargin' })
  })

  it('does not let USD pay for a USD/BRL order', () => {
    const empty = { ...createAccount(), balances: { USD: 1_000_000, BRL: 10 } }
    const result = submitOrder(empty, {
      request: { symbol: 'USDBRL', side: 'buy', type: 'market', qty: 100 },
      book: bookAround(5, 5, 1_000_000),
      marks: {},
      time: NOW
    })

    expect(result).toEqual({ ok: false, reason: 'insufficientMargin' })
  })

  it('does not let a USD loss block a USD/BRL order', () => {
    const opened = fillAt(createAccount(), 'buy', 900, 100)
    const result = submitOrder(opened, {
      request: { symbol: 'USDBRL', side: 'buy', type: 'market', qty: 5000 },
      book: bookAround(5, 5, 100_000),
      marks: { BTCUSD: 10, USDBRL: 5 },
      time: NOW
    })

    expect(result.ok).toBe(true)
  })
})

describe('ledger', () => {
  it('starts with a starting-balance entry per currency', () => {
    const { ledger } = createAccount(NOW)

    expect(ledger).toEqual([
      expect.objectContaining({
        type: 'initial',
        currency: 'USD',
        amount: INITIAL_BALANCES.USD,
        balance: INITIAL_BALANCES.USD,
        time: NOW
      }),
      expect.objectContaining({
        type: 'initial',
        currency: 'BRL',
        amount: INITIAL_BALANCES.BRL,
        balance: INITIAL_BALANCES.BRL,
        time: NOW
      })
    ])
  })

  it('adds one entry per fill with the net of pnl and fee', () => {
    const account = fillAt(
      fillAt(createAccount(), 'buy', 1, 100),
      'sell',
      1,
      150
    )

    expect(account.ledger[0]).toMatchObject({
      type: 'trade',
      currency: 'USD',
      symbol: 'BTCUSD'
    })
    expect(account.ledger[0].amount).toBeCloseTo(50 - 150 * TAKER_FEE_RATE)
    expect(account.ledger[0].balance).toBe(account.balances.USD)
  })

  it('records maker fills too', () => {
    const { account } = place(createAccount(), {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'limit',
      qty: 1,
      price: 95
    })
    const filled = matchRestingOrders(
      account,
      'BTCUSD',
      { low: 95, high: 95 },
      NOW
    )

    expect(filled.ledger[0].amount).toBeCloseTo(-95 * MAKER_FEE_RATE)
  })

  it('adds nothing for an order that only rests', () => {
    const start = createAccount()
    const { account } = place(start, {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'limit',
      qty: 1,
      price: 95
    })

    expect(account.ledger).toEqual(start.ledger)
  })

  it('gives every entry and fill its own id', () => {
    const account = fillAt(
      fillAt(createAccount(), 'buy', 1, 100),
      'sell',
      1,
      100
    )
    const ledgerIds = account.ledger.map((entry) => entry.id)

    expect(new Set(ledgerIds).size).toBe(ledgerIds.length)
    expect(Math.max(...ledgerIds)).toBeLessThan(account.nextId)
  })

  it('reconciles: each balance equals its entries added up', () => {
    let account = createAccount()

    account = fillAt(account, 'buy', 1, 100)
    account = fillAt(account, 'sell', 1, 120)
    account = fillAt(account, 'sell', 1000, 5, 'USDBRL')
    account = fillAt(account, 'buy', 1000, 4.5, 'USDBRL')

    for (const currency of ['USD', 'BRL'] as const) {
      const total = account.ledger
        .filter((entry) => entry.currency === currency)
        .reduce((sum, entry) => sum + entry.amount, 0)

      expect(total).toBeCloseTo(account.balances[currency])
    }
  })

  it('keeps only the newest 500 entries', () => {
    let account = createAccount()

    for (let i = 0; i < 510; i++) {
      const result = addDeposit(account, 'USD', 1, i)

      if (!result.ok) throw new Error('rejected')

      account = result.account
    }

    expect(account.ledger).toHaveLength(500)
    expect(account.ledger[0].time).toBe(509)
    expect(account.balances.USD).toBe(INITIAL_BALANCES.USD + 510)
  })
})

describe('addDeposit', () => {
  it('credits only the chosen currency and records it', () => {
    const result = addDeposit(createAccount(), 'BRL', 250.5, NOW)

    if (!result.ok) throw new Error('rejected')

    expect(result.account.balances).toEqual({
      USD: INITIAL_BALANCES.USD,
      BRL: INITIAL_BALANCES.BRL + 250.5
    })
    expect(result.entry).toMatchObject({
      type: 'deposit',
      currency: 'BRL',
      amount: 250.5,
      balance: INITIAL_BALANCES.BRL + 250.5,
      time: NOW
    })
    expect(result.account.ledger[0]).toEqual(result.entry)
  })

  it('rounds to cents', () => {
    const result = addDeposit(createAccount(), 'USD', 10.126, NOW)

    expect(result.ok && result.entry.amount).toBe(10.13)
  })

  it('allows the maximum', () => {
    expect(addDeposit(createAccount(), 'USD', MAX_DEPOSIT, NOW).ok).toBe(true)
  })

  it.each([0, -5, NaN, Infinity, 0.001, MAX_DEPOSIT + 1])(
    'rejects an amount of %s',
    (amount) => {
      expect(addDeposit(createAccount(), 'USD', amount, NOW)).toEqual({
        ok: false,
        reason: 'invalidAmount'
      })
    }
  )

  it('makes room for orders that were rejected before', () => {
    const request: OrderRequest = {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'market',
      qty: 2000
    }
    const book = bookAround(99, 101, 10_000)
    const before = createAccount()

    expect(
      submitOrder(before, { request, book, marks: {}, time: NOW }).ok
    ).toBe(false)

    const funded = addDeposit(before, 'USD', 200_000, NOW)

    if (!funded.ok) throw new Error('rejected')

    expect(
      submitOrder(funded.account, { request, book, marks: {}, time: NOW }).ok
    ).toBe(true)
  })
})

describe('migrateAccountFromV1', () => {
  const v1 = {
    walletBalance: 99_000,
    positions: { BTCUSD: { symbol: 'BTCUSD' as const, qty: 1, avgEntry: 100 } },
    openOrders: [],
    fills: [
      {
        id: 7,
        orderId: 6,
        symbol: 'USDBRL' as const,
        side: 'sell' as const,
        qty: 100,
        price: 5,
        liquidity: 'taker' as const,
        fee: 2,
        realizedPnl: 10,
        time: NOW
      },
      {
        id: 5,
        orderId: 4,
        symbol: 'BTCUSD' as const,
        side: 'buy' as const,
        qty: 1,
        price: 100,
        liquidity: 'taker' as const,
        fee: 3,
        realizedPnl: 0,
        time: NOW
      }
    ],
    nextId: 8
  }

  it('keeps USD and starts BRL at its initial balance', () => {
    const { balances } = migrateAccountFromV1(v1, NOW)

    expect(balances).toEqual({ USD: 99_000, BRL: INITIAL_BALANCES.BRL })
  })

  it('converts USD/BRL fills back to BRL and leaves BTC/USD alone', () => {
    const { fills } = migrateAccountFromV1(v1, NOW)

    expect(fills[0]).toMatchObject({ fee: 10, realizedPnl: 50 })
    expect(fills[1]).toMatchObject({ fee: 3, realizedPnl: 0 })
  })

  it('starts the ledger from the migrated balances with fresh ids', () => {
    const { ledger, nextId } = migrateAccountFromV1(v1, NOW)

    expect(ledger.map((entry) => [entry.id, entry.balance])).toEqual([
      [8, 99_000],
      [9, INITIAL_BALANCES.BRL]
    ])
    expect(nextId).toBe(10)
  })

  it('keeps positions', () => {
    expect(migrateAccountFromV1(v1, NOW).positions).toEqual(v1.positions)
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
        qty: INITIAL_BALANCES.USD / 100
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
    const summary = getAccountSummary(account, 'USD', {})

    expect(summary.usedMargin).toBe(95)
    expect(summary.availableMargin).toBe(INITIAL_BALANCES.USD - 95)
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

    expect(getAccountSummary(account, 'USD', {}).usedMargin).toBe(100)
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

    expect(getAccountSummary(account, 'USD', {}).usedMargin).toBe(400)
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
      request: { symbol: 'BTCUSD', side: 'buy', type: 'market', qty: 2000 },
      book: bookAround(10, 10, 100_000),
      marks: { BTCUSD: 10 },
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

describe('migrateAccountFromV2', () => {
  it('stamps positions with the upgrade time and adds empty notices', () => {
    const { ledger, nextId } = createAccount()
    const migrated = migrateAccountFromV2(
      {
        balances: { USD: 1, BRL: 2 },
        positions: { BTCUSD: { symbol: 'BTCUSD', qty: 1, avgEntry: 100 } },
        openOrders: [],
        fills: [],
        ledger,
        nextId
      },
      NOW
    )

    expect(migrated.positions.BTCUSD).toEqual({
      symbol: 'BTCUSD',
      qty: 1,
      avgEntry: 100,
      updatedAt: NOW
    })
    expect(migrated.liquidationNotices).toEqual([])
    expect(migrated.balances).toEqual({ USD: 1, BRL: 2 })
  })
})

describe('migrateAccountFromV3', () => {
  it('starts every symbol at 1x and keeps the rest', () => {
    const v3: Partial<TradingAccount> = createAccount()

    delete v3.leverage

    const migrated = migrateAccountFromV3(v3 as TradingAccountV3)

    expect(migrated.leverage).toEqual({ BTCUSD: 1, USDBRL: 1 })
    expect(migrated.balances).toEqual(v3.balances)
  })
})

describe('migrateAccountFromV4', () => {
  it('starts every symbol on the default rates and keeps the rest', () => {
    const v4: Partial<TradingAccount> = createAccount()

    delete v4.feeRates

    const migrated = migrateAccountFromV4(v4 as TradingAccountV4)

    expect(migrated.feeRates.BTCUSD).toEqual({
      maker: MAKER_FEE_RATE,
      taker: TAKER_FEE_RATE
    })
    expect(migrated.feeRates.USDBRL).toEqual({
      maker: MAKER_FEE_RATE,
      taker: TAKER_FEE_RATE
    })
    expect(migrated.balances).toEqual(v4.balances)
  })
})

describe('fee rates', () => {
  const withRates = (
    maker: number,
    taker: number,
    account: TradingAccount = createAccount(),
    symbol: SymbolId = 'BTCUSD'
  ) => {
    const result = changeFeeRates(account, symbol, { maker, taker })

    if (!result.ok) throw new Error('rejected')

    return result.account
  }

  const restingBuy = (account: TradingAccount) =>
    place(account, {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'limit',
      qty: 1,
      price: 95
    }).account

  const touch = (account: TradingAccount) =>
    matchRestingOrders(account, 'BTCUSD', { low: 95, high: 95 }, NOW)

  it('charges market orders the custom taker rate', () => {
    const account = fillAt(withRates(0.001, 0.002), 'buy', 1, 100)

    expect(account.fills[0].fee).toBeCloseTo(0.2)
    expect(account.balances.USD).toBeCloseTo(INITIAL_BALANCES.USD - 0.2)
  })

  it('charges a limit that crosses the book the custom taker rate', () => {
    const { fill } = place(withRates(0.001, 0.002), {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'limit',
      qty: 1,
      price: 110
    })

    expect(fill?.fee).toBeCloseTo(101 * 0.002)
  })

  it('charges a resting limit the custom maker rate', () => {
    const account = touch(restingBuy(withRates(0.001, 0.002)))

    expect(account.fills[0].fee).toBeCloseTo(95 * 0.001)
  })

  it('uses the rates in force at the fill, not when the order was placed', () => {
    const resting = restingBuy(createAccount())
    const account = touch(withRates(0.003, 0.004, resting))

    expect(account.fills[0].fee).toBeCloseTo(95 * 0.003)
  })

  it('leaves past fills as they were', () => {
    const filled = fillAt(createAccount(), 'buy', 1, 100)
    const before = filled.fills[0].fee
    const account = withRates(0.003, 0.004, filled)

    expect(account.fills[0].fee).toBe(before)
    expect(account.balances).toEqual(filled.balances)
  })

  it('is set per symbol', () => {
    const custom = withRates(0.001, 0.002)
    const account = fillAt(custom, 'buy', 1000, 5, 'USDBRL')

    expect(account.fills[0].fee).toBeCloseTo(5000 * TAKER_FEE_RATE)
  })

  it('allows zero fees', () => {
    const account = fillAt(withRates(0, 0), 'buy', 1, 100)

    expect(account.fills[0].fee).toBe(0)
    expect(account.balances.USD).toBe(INITIAL_BALANCES.USD)
  })

  it('credits a negative maker rate as a rebate', () => {
    const account = touch(restingBuy(withRates(-0.00025, 0.00075)))

    expect(account.fills[0].fee).toBeCloseTo(95 * -0.00025)
    expect(account.balances.USD).toBeCloseTo(
      INITIAL_BALANCES.USD + 95 * 0.00025
    )
    expect(account.ledger[0].amount).toBeCloseTo(95 * 0.00025)
  })

  it('does not count a rebate towards margin', () => {
    const start = withRates(-0.01, 0)
    const result = submitOrder(start, {
      request: {
        symbol: 'BTCUSD',
        side: 'buy',
        type: 'limit',
        qty: 1001,
        price: 100
      },
      book: bookAround(101, 102),
      marks: {},
      time: NOW
    })

    expect(result).toEqual({ ok: false, reason: 'insufficientMargin' })
  })

  it('includes a higher taker rate in the margin check', () => {
    const start = withRates(0, 0.05)
    const result = submitOrder(start, {
      request: { symbol: 'BTCUSD', side: 'buy', type: 'market', qty: 980 },
      book: bookAround(100, 100, 10_000),
      marks: {},
      time: NOW
    })

    expect(result).toEqual({ ok: false, reason: 'insufficientMargin' })
  })

  it('charges liquidations the custom taker rate', () => {
    const start = {
      ...withRates(0.001, 0.002),
      balances: { USD: 50, BRL: INITIAL_BALANCES.BRL },
      positions: {
        BTCUSD: {
          symbol: 'BTCUSD' as const,
          qty: 1,
          avgEntry: 100,
          updatedAt: 0
        }
      }
    }
    const account = liquidateIfBreached(start, 'BTCUSD', 50, {}, NOW)

    expect(account.fills[0].fee).toBeCloseTo(50 * 0.002)
  })

  it('keeps the balance equal to the ledger with custom rates', () => {
    let account = withRates(-0.0001, 0.001)

    account = fillAt(account, 'buy', 1, 100)
    account = touch(
      place(account, {
        symbol: 'BTCUSD',
        side: 'buy',
        type: 'limit',
        qty: 1,
        price: 95
      }).account
    )

    const total = account.ledger
      .filter((entry) => entry.currency === 'USD')
      .reduce((sum, entry) => sum + entry.amount, 0)

    expect(total).toBeCloseTo(account.balances.USD)
  })

  describe('changeFeeRates', () => {
    it('rounds away float noise', () => {
      const account = withRates(0.07 / 100, 0.1 / 100)

      expect(account.feeRates.BTCUSD).toEqual({ maker: 0.0007, taker: 0.001 })
    })

    it('accepts the limits', () => {
      expect(withRates(-0.01, 0.05).feeRates.BTCUSD).toEqual({
        maker: -0.01,
        taker: 0.05
      })
      expect(withRates(0.05, 0).feeRates.BTCUSD).toEqual({
        maker: 0.05,
        taker: 0
      })
    })

    it.each([
      [-0.011, 0.001],
      [0.051, 0.001],
      [0.001, -0.001],
      [0.001, 0.051],
      [NaN, 0.001],
      [0.001, NaN],
      [Infinity, 0.001]
    ])('rejects maker %s and taker %s', (maker, taker) => {
      expect(
        changeFeeRates(createAccount(), 'BTCUSD', { maker, taker })
      ).toEqual({ ok: false, reason: 'invalidFeeRates' })
    })
  })
})

describe('leverage', () => {
  const atLeverage = (
    leverage: number,
    account: TradingAccount = createAccount(),
    symbol: SymbolId = 'BTCUSD'
  ) => {
    const result = changeLeverage(account, symbol, leverage, {})

    if (!result.ok) throw new Error(`rejected: ${result.reason}`)

    return result.account
  }

  const buyAt100 = (account: TradingAccount, qty: number) =>
    submitOrder(account, {
      request: { symbol: 'BTCUSD', side: 'buy', type: 'market', qty },
      book: bookAround(100, 100, 1_000_000),
      marks: { BTCUSD: 100 },
      time: NOW
    })

  it('starts at 1x', () => {
    expect(createAccount().leverage).toEqual({ BTCUSD: 1, USDBRL: 1 })
  })

  it('allows a position larger than the balance', () => {
    expect(buyAt100(atLeverage(10), 9000).ok).toBe(true)
    expect(buyAt100(createAccount(), 9000).ok).toBe(false)
  })

  it('rejects a position beyond what the leverage allows', () => {
    expect(buyAt100(atLeverage(10), 11_000)).toEqual({
      ok: false,
      reason: 'insufficientMargin'
    })
  })

  it('includes the fee at the limit', () => {
    expect(buyAt100(atLeverage(10), INITIAL_BALANCES.USD / 10).ok).toBe(false)
  })

  it('divides used margin by the leverage', () => {
    const account = fillAt(atLeverage(10), 'buy', 9000, 100)

    expect(getAccountSummary(account, 'USD', {}).usedMargin).toBe(90_000)
  })

  it('divides resting order margin by the leverage', () => {
    const { account } = place(atLeverage(5), {
      symbol: 'BTCUSD',
      side: 'buy',
      type: 'limit',
      qty: 10,
      price: 95
    })

    expect(getAccountSummary(account, 'USD', {}).usedMargin).toBe(190)
  })

  it('is set per symbol', () => {
    const account = fillAt(atLeverage(10), 'buy', 1000, 5, 'USDBRL')

    expect(account.leverage).toEqual({ BTCUSD: 10, USDBRL: 1 })
    expect(getAccountSummary(account, 'BRL', {}).usedMargin).toBe(5000)
  })

  it('does not change pnl, fees or the balance', () => {
    const plain = fillAt(
      fillAt(createAccount(), 'buy', 10, 100),
      'sell',
      10,
      110
    )
    const leveraged = fillAt(
      fillAt(atLeverage(25), 'buy', 10, 100),
      'sell',
      10,
      110
    )

    expect(leveraged.balances).toEqual(plain.balances)
    expect(leveraged.fills[0].fee).toBe(plain.fills[0].fee)
    expect(leveraged.fills[0].realizedPnl).toBe(plain.fills[0].realizedPnl)
  })

  it('resets to 1x with the account', () => {
    expect(atLeverage(50).leverage.BTCUSD).toBe(50)
    expect(createAccount().leverage.BTCUSD).toBe(1)
  })

  describe('changeLeverage', () => {
    it('frees margin when raised', () => {
      const opened = fillAt(createAccount(), 'buy', 500, 100)
      const account = atLeverage(5, opened)

      expect(getAccountSummary(account, 'USD', {}).usedMargin).toBe(10_000)
    })

    it('can be lowered when the margin still fits', () => {
      const opened = fillAt(atLeverage(10), 'buy', 500, 100)

      expect(atLeverage(1, opened).leverage.BTCUSD).toBe(1)
    })

    it('cannot be lowered past what the equity covers', () => {
      const opened = fillAt(atLeverage(10), 'buy', 9000, 100)

      expect(changeLeverage(opened, 'BTCUSD', 2, { BTCUSD: 100 })).toEqual({
        ok: false,
        reason: 'insufficientMargin'
      })
    })

    it('counts unrealized losses when lowering', () => {
      const opened = fillAt(atLeverage(10), 'buy', 900, 100)

      expect(changeLeverage(opened, 'BTCUSD', 1, { BTCUSD: 100 }).ok).toBe(true)
      expect(changeLeverage(opened, 'BTCUSD', 1, { BTCUSD: 10 }).ok).toBe(false)
    })

    it('counts resting orders when lowering', () => {
      const { account } = place(atLeverage(10), {
        symbol: 'BTCUSD',
        side: 'buy',
        type: 'limit',
        qty: 9000,
        price: 95
      })

      expect(changeLeverage(account, 'BTCUSD', 1, {}).ok).toBe(false)
    })

    it.each([0, -1, 4, 100, NaN])('rejects %s', (leverage) => {
      expect(changeLeverage(createAccount(), 'BTCUSD', leverage, {})).toEqual({
        ok: false,
        reason: 'invalidLeverage'
      })
    })
  })

  describe('with liquidation', () => {
    it('liquidates a full-size 10x long about 10% down', () => {
      const account = fillAt(atLeverage(10), 'buy', 9900, 100)
      const price = getLiquidationPrice(account, 'BTCUSD', {}) as number

      expect(price).toBeGreaterThan(89)
      expect(price).toBeLessThan(91)
    })

    it('liquidates a full-size 10x short about 10% up', () => {
      const account = fillAt(atLeverage(10), 'sell', 9900, 100)
      const price = getLiquidationPrice(account, 'BTCUSD', {}) as number

      expect(price).toBeGreaterThan(109)
      expect(price).toBeLessThan(111)
    })

    it('liquidates a full-size 50x long about 2% down', () => {
      const account = fillAt(atLeverage(50), 'buy', 40_000, 100)
      const price = getLiquidationPrice(account, 'BTCUSD', {}) as number

      expect(price).toBeGreaterThan(97.5)
      expect(price).toBeLessThan(99)
    })

    it('keeps a small position far away, because the whole balance backs it', () => {
      const account = fillAt(atLeverage(50), 'sell', 10, 100)
      const price = getLiquidationPrice(account, 'BTCUSD', {}) as number

      expect(price).toBeGreaterThan(9000)
    })

    it('does not liquidate a new full-size position at its entry', () => {
      for (const [leverage, qty] of [
        [10, 9900],
        [25, 22_000],
        [50, 40_000]
      ]) {
        const account = fillAt(atLeverage(leverage), 'buy', qty, 100)

        expect(liquidateIfBreached(account, 'BTCUSD', 100, {}, NOW)).toBe(
          account
        )
      }
    })

    it('liquidates a leveraged position once the price gets there', () => {
      const opened = fillAt(atLeverage(10), 'buy', 9900, 100)
      const price = getLiquidationPrice(opened, 'BTCUSD', {}) as number
      const account = liquidateIfBreached(opened, 'BTCUSD', price, {}, NOW)

      expect(account.positions.BTCUSD).toBeUndefined()
      expect(account.balances.USD).toBeGreaterThanOrEqual(0)
    })

    it('moves the liquidation price closer as size grows, not with the setting', () => {
      const small = fillAt(atLeverage(10), 'buy', 1000, 100)
      const sameSizeHigher = atLeverage(50, small)
      const larger = fillAt(small, 'buy', 8000, 100)

      expect(getLiquidationPrice(sameSizeHigher, 'BTCUSD', {})).toBe(
        getLiquidationPrice(small, 'BTCUSD', {})
      )
      expect(getLiquidationPrice(larger, 'BTCUSD', {})).toBeGreaterThan(
        getLiquidationPrice(small, 'BTCUSD', {}) as number
      )
    })
  })
})

describe('liquidation', () => {
  const RATE = MAINTENANCE_MARGIN_RATE
  const TIME = 5_000

  // A position larger than its balance, which the order flow can't create at 1x
  // but which a large loss leaves behind in the same shape.
  const withPosition = (qty: number, avgEntry: number, usd: number) => ({
    ...createAccount(),
    balances: { USD: usd, BRL: INITIAL_BALANCES.BRL },
    positions: {
      BTCUSD: { symbol: 'BTCUSD' as const, qty, avgEntry, updatedAt: 0 }
    }
  })

  const candle = (time: number, open: number, low: number, high: number) => ({
    time,
    open,
    low,
    high,
    close: open,
    volume: 1
  })

  describe('getLiquidationPrice', () => {
    it('is undefined without a position', () => {
      expect(getLiquidationPrice(createAccount(), 'BTCUSD', {})).toBeUndefined()
    })

    it('puts a long where equity meets maintenance margin', () => {
      const account = withPosition(1, 100, 20)
      const price = getLiquidationPrice(account, 'BTCUSD', {}) as number
      const equity = 20 + (price - 100)

      expect(price).toBeCloseTo(80 / (1 - RATE))
      expect(equity).toBeCloseTo(price * RATE)
    })

    it('puts a short where equity meets maintenance margin', () => {
      const account = withPosition(-1, 100, 20)
      const price = getLiquidationPrice(account, 'BTCUSD', {}) as number
      const equity = 20 - (price - 100)

      expect(price).toBeCloseTo(120 / (1 + RATE))
      expect(equity).toBeCloseTo(price * RATE)
    })

    it('is undefined for a long the balance fully covers', () => {
      const account = fillAt(createAccount(), 'buy', 1, 100)

      expect(getLiquidationPrice(account, 'BTCUSD', {})).toBeUndefined()
    })

    it('is roughly double the entry for a short using the whole balance', () => {
      const account = fillAt(createAccount(), 'sell', 900, 100)
      const price = getLiquidationPrice(account, 'BTCUSD', {}) as number

      expect(price).toBeGreaterThan(200)
      expect(price).toBeLessThan(211)
    })

    it('moves when funds are added', () => {
      const before = withPosition(-1, 100, 20)
      const after = addDeposit(before, 'USD', 30, NOW)

      if (!after.ok) throw new Error('rejected')

      expect(getLiquidationPrice(after.account, 'BTCUSD', {})).toBeGreaterThan(
        getLiquidationPrice(before, 'BTCUSD', {}) as number
      )
    })
  })

  describe('liquidateIfBreached', () => {
    it('does nothing before the liquidation price', () => {
      const account = withPosition(1, 100, 20)

      expect(liquidateIfBreached(account, 'BTCUSD', 81, {}, TIME)).toBe(account)
    })

    it('does nothing without a position', () => {
      const account = createAccount()

      expect(liquidateIfBreached(account, 'BTCUSD', 1, {}, TIME)).toBe(account)
    })

    it('closes a long at the mark when breached', () => {
      const account = liquidateIfBreached(
        withPosition(1, 100, 20),
        'BTCUSD',
        80,
        {},
        TIME
      )

      expect(account.positions.BTCUSD).toBeUndefined()
      expect(account.fills[0]).toMatchObject({
        side: 'sell',
        qty: 1,
        price: 80,
        liquidity: 'taker',
        realizedPnl: -20,
        isLiquidation: true,
        time: TIME
      })
    })

    it('closes a short at the mark when breached', () => {
      const account = liquidateIfBreached(
        withPosition(-1, 100, 20),
        'BTCUSD',
        120,
        {},
        TIME
      )

      expect(account.positions.BTCUSD).toBeUndefined()
      expect(account.fills[0]).toMatchObject({ side: 'buy', price: 120 })
    })

    it('leaves what remains after the loss and the fee', () => {
      const start = withPosition(1, 100, 50)
      const price = getLiquidationPrice(start, 'BTCUSD', {}) as number
      const account = liquidateIfBreached(start, 'BTCUSD', price, {}, TIME)
      const rounded = account.fills[0].price

      expect(account.balances.USD).toBeCloseTo(
        50 + (rounded - 100) - rounded * TAKER_FEE_RATE
      )
      expect(account.balances.USD).toBeGreaterThan(0)
    })

    it('cancels orders in the same currency only', () => {
      const start = {
        ...withPosition(1, 100, 20),
        openOrders: [
          {
            id: 90,
            symbol: 'BTCUSD' as const,
            side: 'buy' as const,
            qty: 1,
            price: 50,
            createdAt: 0
          },
          {
            id: 91,
            symbol: 'USDBRL' as const,
            side: 'buy' as const,
            qty: 100,
            price: 5,
            createdAt: 0
          }
        ]
      }
      const account = liquidateIfBreached(start, 'BTCUSD', 80, {}, TIME)

      expect(account.openOrders.map((order) => order.id)).toEqual([91])
    })

    it('leaves the other currency and its position alone', () => {
      const usdbrl = {
        symbol: 'USDBRL' as const,
        qty: 100,
        avgEntry: 5,
        updatedAt: 0
      }
      const start = {
        ...withPosition(1, 100, 20),
        positions: { ...withPosition(1, 100, 20).positions, USDBRL: usdbrl }
      }
      const account = liquidateIfBreached(start, 'BTCUSD', 80, {}, TIME)

      expect(account.positions.USDBRL).toEqual(usdbrl)
      expect(account.balances.BRL).toBe(INITIAL_BALANCES.BRL)
    })

    it('records a liquidation ledger entry and a notice', () => {
      const account = liquidateIfBreached(
        withPosition(1, 100, 20),
        'BTCUSD',
        80.3,
        {},
        TIME
      )

      expect(account.ledger[0]).toMatchObject({
        type: 'liquidation',
        currency: 'USD',
        symbol: 'BTCUSD',
        time: TIME
      })
      expect(account.liquidationNotices).toEqual([
        expect.objectContaining({
          symbol: 'BTCUSD',
          qty: 1,
          price: 80.3,
          time: TIME
        })
      ])
    })

    it('stops at zero after a gap and records the covered loss', () => {
      const account = liquidateIfBreached(
        withPosition(1, 100, 20),
        'BTCUSD',
        50,
        {},
        TIME
      )

      expect(account.balances.USD).toBe(0)
      expect(account.ledger[0].type).toBe('lossCovered')
      expect(account.ledger[0].amount).toBeCloseTo(30 + 50 * TAKER_FEE_RATE)
      expect(account.ledger[0].balance).toBe(0)
      expect(account.ledger[1].type).toBe('liquidation')
      expect(account.ledger[1].balance).toBeCloseTo(-30 - 50 * TAKER_FEE_RATE)
    })

    it('rounds the close to the tick size', () => {
      const account = liquidateIfBreached(
        withPosition(1, 100, 20),
        'BTCUSD',
        80.123456,
        {},
        TIME
      )

      expect(account.fills[0].price).toBe(80.12)
    })

    it('uses unique ids', () => {
      const account = liquidateIfBreached(
        withPosition(1, 100, 20),
        'BTCUSD',
        50,
        {},
        TIME
      )
      const ids = [
        ...account.ledger.map((entry) => entry.id),
        account.fills[0].id,
        account.fills[0].orderId
      ]

      expect(new Set(ids).size).toBe(ids.length)
      expect(Math.max(...ids)).toBeLessThan(account.nextId)
    })

    it('can trade again after a deposit', () => {
      const liquidated = liquidateIfBreached(
        withPosition(1, 100, 20),
        'BTCUSD',
        50,
        {},
        TIME
      )
      const funded = addDeposit(liquidated, 'USD', 1000, TIME)

      if (!funded.ok) throw new Error('rejected')

      const account = fillAt(funded.account, 'buy', 1, 100)

      expect(account.positions.BTCUSD?.qty).toBe(1)
    })
  })

  describe('replayCandles', () => {
    it('liquidates a long a later candle crossed, at the liquidation price', () => {
      const start = withPosition(1, 100, 20)
      const price = getLiquidationPrice(start, 'BTCUSD', {}) as number
      const account = replayCandles(start, 'BTCUSD', [
        candle(10, 90, 85, 95),
        candle(11, 90, 70, 95)
      ])

      expect(account.positions.BTCUSD).toBeUndefined()
      expect(account.fills[0].price).toBeCloseTo(price, 2)
      expect(account.fills[0].time).toBe(11_000)
    })

    it('liquidates a short on the candle high', () => {
      const start = withPosition(-1, 100, 20)
      const price = getLiquidationPrice(start, 'BTCUSD', {}) as number
      const account = replayCandles(start, 'BTCUSD', [
        candle(10, 110, 105, 130)
      ])

      expect(account.fills[0].price).toBeCloseTo(price, 2)
    })

    it('uses the open when the market had already gone past', () => {
      const account = replayCandles(withPosition(1, 100, 20), 'BTCUSD', [
        candle(10, 60, 55, 65)
      ])

      expect(account.fills[0].price).toBe(60)
    })

    it('leaves a position the candles did not reach', () => {
      const start = withPosition(1, 100, 20)

      expect(replayCandles(start, 'BTCUSD', [candle(10, 90, 85, 95)])).toBe(
        start
      )
    })

    it('ignores a candle opened before the position last changed', () => {
      const start = withPosition(1, 100, 20)

      if (start.positions.BTCUSD) start.positions.BTCUSD.updatedAt = 10_000

      expect(replayCandles(start, 'BTCUSD', [candle(10, 60, 55, 65)])).toBe(
        start
      )
    })

    it('stops after the liquidation', () => {
      const account = replayCandles(withPosition(1, 100, 20), 'BTCUSD', [
        candle(10, 60, 55, 65),
        candle(11, 40, 35, 45)
      ])

      expect(account.fills).toHaveLength(1)
    })

    it('does not liquidate on the candle that opened or changed the position', () => {
      const { account: resting } = place(createAccount(), {
        symbol: 'BTCUSD',
        side: 'buy',
        type: 'limit',
        qty: 1,
        price: 95
      })
      const start = { ...resting, balances: { USD: 10, BRL: 0 } }
      const account = replayCandles(start, 'BTCUSD', [candle(10, 95, 1, 95)])

      expect(account.positions.BTCUSD?.qty).toBe(1)
      expect(account.fills[0].isLiquidation).toBeUndefined()
    })
  })

  it('keeps each balance equal to its ledger through a liquidation', () => {
    const funded = addDeposit(createAccount(), 'USD', 1000, NOW)

    if (!funded.ok) throw new Error('rejected')

    const opened = fillAt(funded.account, 'sell', 1000, 100)
    const account = liquidateIfBreached(opened, 'BTCUSD', 1000, {}, TIME)
    const total = account.ledger
      .filter((entry) => entry.currency === 'USD')
      .reduce((sum, entry) => sum + entry.amount, 0)

    expect(account.positions.BTCUSD).toBeUndefined()
    expect(total).toBeCloseTo(account.balances.USD)
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
    expect(getAccountSummary(account, 'USD', {}).usedMargin).toBe(90)
  })
})

describe('getAccountSummary', () => {
  it('adds unrealized pnl to equity', () => {
    const account = fillAt(createAccount(), 'sell', 1, 100)
    const summary = getAccountSummary(account, 'USD', { BTCUSD: 90 })

    expect(summary.unrealizedPnl).toBe(10)
    expect(summary.equity).toBeCloseTo(account.balances.USD + 10)
  })

  it('treats a position with no mark as flat', () => {
    const account = fillAt(createAccount(), 'buy', 1, 100)

    expect(getAccountSummary(account, 'USD', {}).unrealizedPnl).toBe(0)
  })
})
