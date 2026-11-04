import { describe, expect, it } from 'vitest'
import type {
  Order,
  SimulationEvent,
  SymbolId,
  TradeSide,
  TradingAccount
} from '@/types'
import { createAccount, getLiquidationPrice } from './trading.engine'
import { createHistory, type PricePoint } from './trading.history.fixture'
import { replayTrades, runSimulation } from './trading.simulation'

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const START = 100 * DAY

const order = (
  id: number,
  side: TradeSide,
  price: number,
  changes: Partial<Order> = {}
): Order => ({
  id,
  market: 'margin',
  symbol: 'BTCUSD',
  side,
  qty: 1,
  price,
  createdAt: START - HOUR,
  ...changes
})

const withOrders = (...openOrders: Order[]): TradingAccount => ({
  ...createAccount(),
  openOrders
})

const withLong = (usd: number, qty = 1, avgEntry = 100): TradingAccount => ({
  ...createAccount(),
  balances: { USD: usd, BRL: 0 },
  positions: {
    BTCUSD: { symbol: 'BTCUSD', qty, avgEntry, updatedAt: START - HOUR }
  }
})

async function simulate(
  account: TradingAccount,
  points: Partial<Record<SymbolId, PricePoint[]>>,
  {
    start = START,
    end = START + 200 * DAY,
    ...historyOptions
  }: {
    start?: number
    end?: number
    secondsSince?: number
    tradesSince?: number
  } = {}
) {
  const source = createHistory(points, historyOptions)
  const events: SimulationEvent[] = []
  const progress: number[] = []
  const result = await runSimulation({
    account,
    start,
    end,
    marks: {},
    source,
    onProgress: (time) => progress.push(time),
    onEvent: (event) => events.push(event)
  })

  return { account: result, events, progress, requests: source.requests }
}

const prices = (events: SimulationEvent[]) => events.map(({ price }) => price)

describe('runSimulation', () => {
  describe('the order things happen in', () => {
    const openOrders = () =>
      withOrders(
        order(1, 'buy', 10_350),
        order(2, 'buy', 10_400),
        order(3, 'sell', 11_000)
      )

    it.each([
      ['a day', DAY],
      ['an hour', HOUR],
      ['a minute', MINUTE],
      ['a second', SECOND],
      ['a few milliseconds', 5]
    ])(
      'follows the path of the price with %s between moves',
      async (_, step) => {
        const { events, account } = await simulate(openOrders(), {
          BTCUSD: [
            [START + step, 10_500],
            [START + step * 2, 10_400],
            [START + step * 3, 11_000],
            [START + step * 4, 10_300]
          ]
        })

        expect(prices(events)).toEqual([10_400, 11_000, 10_350])
        expect(account.openOrders).toEqual([])
        expect(account.positions.BTCUSD?.qty).toBe(1)
      }
    )

    it('stamps each fill with the time of the trade that reached it', async () => {
      const { events } = await simulate(openOrders(), {
        BTCUSD: [
          [START + 7 * HOUR + 1234, 10_400],
          [START + 9 * HOUR + 5678, 11_000]
        ]
      })

      expect(events.map(({ time }) => time)).toEqual([
        START + 7 * HOUR + 1234,
        START + 9 * HOUR + 5678
      ])
    })

    it('fills nearest first when one trade jumps past several orders', async () => {
      const { events } = await simulate(
        withOrders(order(1, 'buy', 90), order(2, 'buy', 95)),
        {
          BTCUSD: [
            [START + SECOND, 100],
            [START + SECOND + 5, 80]
          ]
        }
      )

      expect(prices(events)).toEqual([95, 90])
    })

    it('fills the oldest first at the same price', async () => {
      const { events } = await simulate(
        withOrders(order(2, 'buy', 95), order(1, 'buy', 95)),
        { BTCUSD: [[START + SECOND, 90]] }
      )

      expect(events).toHaveLength(2)
      expect(events[0].time).toBe(START + SECOND)
    })

    it('merges both symbols into one timeline', async () => {
      const { events } = await simulate(
        withOrders(
          order(1, 'buy', 95),
          order(2, 'sell', 6, { symbol: 'USDBRL', market: 'spot', qty: 10 }),
          order(3, 'sell', 110)
        ),
        {
          BTCUSD: [
            [START + 5 * MINUTE, 95],
            [START + 5 * MINUTE + 300, 110]
          ],
          USDBRL: [[START + 5 * MINUTE + 100, 6]]
        }
      )

      expect(events.map(({ symbol, price }) => [symbol, price])).toEqual([
        ['BTCUSD', 95],
        ['USDBRL', 6],
        ['BTCUSD', 110]
      ])
    })

    it('fills spot orders too', async () => {
      const { account, events } = await simulate(
        withOrders(order(1, 'buy', 95, { market: 'spot', qty: 2 })),
        { BTCUSD: [[START + HOUR, 90]] }
      )

      expect(account.spot.BTCUSD?.qty).toBe(2)
      expect(account.positions.BTCUSD).toBeUndefined()
      expect(events[0]).toMatchObject({ kind: 'fill', market: 'spot' })
    })
  })

  describe('liquidation', () => {
    it('closes at the liquidation price and logs what it cancelled', async () => {
      const start = {
        ...withLong(20),
        openOrders: [order(1, 'buy', 10)]
      }
      const liquidationPrice = getLiquidationPrice(
        start,
        'BTCUSD',
        {}
      ) as number
      const { account, events } = await simulate(start, {
        BTCUSD: [
          [START + HOUR, 90],
          [START + HOUR + SECOND, 5]
        ]
      })

      expect(account.positions.BTCUSD).toBeUndefined()
      expect(account.openOrders).toEqual([])
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        kind: 'liquidation',
        qty: 1,
        cancelledOrders: 1
      })
      expect(events[0].price).toBeCloseTo(liquidationPrice, 2)
    })

    it('uses the market price when a gap went straight past it', async () => {
      const { events } = await simulate(withLong(20), {
        BTCUSD: [
          [START + HOUR, 50],
          [START + HOUR + SECOND, 40]
        ]
      })

      expect(events[0].kind).toBe('liquidation')
      expect(events[0].price).toBe(50)
    })

    it('recalculates after a fill that moves the liquidation price', async () => {
      // A second long at 90 needs far less of a fall to wipe out the 40 balance.
      const start = { ...withLong(40), openOrders: [order(1, 'buy', 90)] }

      expect(getLiquidationPrice(start, 'BTCUSD', {})).toBeLessThan(70)

      const { events } = await simulate(start, {
        BTCUSD: [
          [START + HOUR, 90],
          [START + HOUR + SECOND, 70]
        ]
      })

      expect(events.map(({ kind }) => kind)).toEqual(['fill', 'liquidation'])
    })

    it('does not fill orders the liquidation already cancelled', async () => {
      const { events, account } = await simulate(
        { ...withLong(20), openOrders: [order(1, 'buy', 50)] },
        {
          BTCUSD: [
            [START + MINUTE, 70],
            [START + MINUTE + 5, 40]
          ]
        }
      )

      expect(events.map(({ kind }) => kind)).toEqual(['liquidation'])
      expect(account.fills.every((fill) => fill.isLiquidation)).toBe(true)
    })

    it('liquidates BTC/USD when a USD/BRL sell spends the USD behind it', async () => {
      // 80 USD covers the whole fall to 20, until the sell spends 60 of it.
      const start = {
        ...withLong(80),
        openOrders: [
          order(1, 'sell', 6, { symbol: 'USDBRL', market: 'spot', qty: 60 })
        ]
      }
      const { events, account } = await simulate(start, {
        BTCUSD: [
          [START + HOUR, 70],
          [START + 2 * HOUR, 70],
          [START + 3 * HOUR, 70]
        ],
        USDBRL: [[START + HOUR + MINUTE, 6]]
      })

      expect(events.map(({ kind, symbol }) => [kind, symbol])).toEqual([
        ['fill', 'USDBRL'],
        ['liquidation', 'BTCUSD']
      ])
      expect(events[1].time).toBe(START + 2 * HOUR)
      expect(account.positions.BTCUSD).toBeUndefined()
    })

    it('sees a shared-USD liquidation within the same window', async () => {
      const start = {
        ...withLong(80),
        openOrders: [
          order(1, 'sell', 6, { symbol: 'USDBRL', market: 'spot', qty: 60 })
        ]
      }
      const { events } = await simulate(start, {
        BTCUSD: [
          [START + 5 * MINUTE + 30 * SECOND, 100],
          [START + 5 * MINUTE + 40 * SECOND, 70]
        ],
        USDBRL: [[START + 5 * MINUTE + 10 * SECOND, 6]]
      })

      expect(events.map(({ kind }) => kind)).toEqual(['fill', 'liquidation'])
      expect(events[1].time).toBe(START + 5 * MINUTE + 40 * SECOND)
    })
  })

  describe('what counts', () => {
    it('ignores prices from before the start', async () => {
      const { events } = await simulate(withOrders(order(1, 'buy', 95)), {
        BTCUSD: [
          [START - 10 * SECOND, 90],
          [START + 10 * SECOND, 100]
        ]
      })

      expect(events).toEqual([])
    })

    it('ignores prices from before an order existed', async () => {
      const { events } = await simulate(
        withOrders(order(1, 'buy', 95, { createdAt: START + 30 * SECOND })),
        {
          BTCUSD: [
            [START + 10 * SECOND, 90],
            [START + 40 * SECOND, 100]
          ]
        }
      )

      expect(events).toEqual([])
    })

    it('ignores prices from before a position changed', async () => {
      const start = withLong(20)

      start.positions.BTCUSD = {
        ...start.positions.BTCUSD!,
        updatedAt: START + 30 * SECOND
      }

      const { events } = await simulate(start, {
        BTCUSD: [
          [START + 10 * SECOND, 50],
          [START + 40 * SECOND, 100]
        ]
      })

      expect(events).toEqual([])
    })

    it('ignores prices from after the end', async () => {
      const { events } = await simulate(
        withOrders(order(1, 'buy', 95)),
        {
          BTCUSD: [
            [START + 10 * SECOND, 100],
            [START + 40 * SECOND, 90]
          ]
        },
        { end: START + 20 * SECOND }
      )

      expect(events).toEqual([])
    })

    it('counts a price exactly at the start', async () => {
      const { events } = await simulate(withOrders(order(1, 'buy', 95)), {
        BTCUSD: [[START, 95]]
      })

      expect(events).toHaveLength(1)
    })

    it('returns the same account when nothing happened', async () => {
      const start = withOrders(order(1, 'buy', 50))
      const { account } = await simulate(start, {
        BTCUSD: [[START + DAY, 100]]
      })

      expect(account).toBe(start)
    })
  })

  describe('requests', () => {
    it('needs one request per symbol for a long gap where nothing happens', async () => {
      const { requests } = await simulate(withOrders(order(1, 'buy', 50)), {
        BTCUSD: [
          [START + DAY, 100],
          [START + 50 * DAY, 100]
        ]
      })

      expect(requests).toEqual(['BTCUSD 1d'])
    })

    it('zooms in only where something can happen', async () => {
      const { requests } = await simulate(withOrders(order(1, 'buy', 95)), {
        BTCUSD: [
          [START + 50 * DAY, 100],
          [START + 51 * DAY + 5 * HOUR + 5 * MINUTE + 5 * SECOND, 90],
          [START + 52 * DAY, 100]
        ]
      })

      expect(requests).toEqual([
        'BTCUSD 1d',
        'BTCUSD 1h',
        'BTCUSD 1m',
        'BTCUSD 1s',
        'BTCUSD trades'
      ])
    })

    it('does not fetch a symbol with nothing open', async () => {
      const { requests } = await simulate(withOrders(order(1, 'buy', 50)), {
        USDBRL: [[START + DAY, 5]]
      })

      expect(requests.some((request) => request.startsWith('USDBRL'))).toBe(
        false
      )
    })

    it('stops once nothing is left to watch', async () => {
      const { requests } = await simulate(withOrders(order(1, 'buy', 95)), {
        BTCUSD: [
          ...Array.from({ length: 150 }, (_, day): PricePoint => [
            START + day * DAY,
            90
          ])
        ]
      })

      expect(requests.filter((request) => request.includes('1d'))).toHaveLength(
        1
      )
      expect(requests.at(-1)).toBe('BTCUSD trades')
    })

    it('starts at a level that suits a short gap', async () => {
      const { requests } = await simulate(
        withOrders(order(1, 'buy', 50)),
        { BTCUSD: [[START + 10 * SECOND, 100]] },
        { end: START + 30 * SECOND }
      )

      expect(requests).toEqual(['BTCUSD 1m'])
    })

    it('pages through more candles than fit in one request', async () => {
      const { events } = await simulate(
        withOrders(order(1, 'buy', 95)),
        {
          BTCUSD: [
            ...Array.from({ length: 1500 }, (_, day): PricePoint => [
              START + day * DAY,
              100
            ]),
            [START + 1499 * DAY + 5, 90]
          ]
        },
        { end: START + 1500 * DAY }
      )

      expect(prices(events)).toEqual([95])
    })

    it('pages through a very busy second', async () => {
      const busy = Array.from({ length: 2500 }, (_, ms): PricePoint => [
        START + ms / 5,
        100
      ])

      busy.push([START + 500 + 1, 90])

      const sorted = busy.toSorted((a, b) => a[0] - b[0])
      const { events } = await simulate(
        withOrders(order(1, 'buy', 95)),
        { BTCUSD: sorted },
        { end: START + 2 * SECOND }
      )

      expect(events[0].time).toBe(START + 501)
    })
  })

  describe('when finer data is gone', () => {
    const old = { tradesSince: START + 300 * DAY }

    it('estimates from one-second candles without trades', async () => {
      const { events } = await simulate(
        withOrders(order(1, 'buy', 95)),
        { BTCUSD: [[START + 5 * SECOND, 90]] },
        old
      )

      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ estimated: true, price: 95 })
    })

    it('estimates from minute candles without one-second candles', async () => {
      const { events, account } = await simulate(
        withOrders(order(1, 'buy', 95)),
        { BTCUSD: [[START + 5 * MINUTE + 5 * SECOND, 90]] },
        { ...old, secondsSince: START + 300 * DAY }
      )

      expect(account.openOrders).toEqual([])
      expect(events[0]).toMatchObject({
        estimated: true,
        time: START + 5 * MINUTE
      })
    })

    it('goes to the nearer extreme first', async () => {
      const { events } = await simulate(
        withOrders(order(1, 'buy', 95), order(2, 'sell', 120)),
        {
          BTCUSD: [
            [START + 5 * SECOND, 100],
            [START + 5 * SECOND + 1, 90],
            [START + 5 * SECOND + 2, 130],
            [START + 5 * SECOND + 3, 110]
          ]
        },
        old
      )

      expect(prices(events)).toEqual([95, 120])
    })

    it('does not guess for a window the start cuts through', async () => {
      const { events } = await simulate(
        withOrders(order(1, 'buy', 95, { createdAt: START })),
        { BTCUSD: [[START - 5 * SECOND, 90]] },
        { ...old, start: START, end: START + 20 * SECOND }
      )

      expect(events).toEqual([])
    })

    it('marks real trades as exact', async () => {
      const { events } = await simulate(withOrders(order(1, 'buy', 95)), {
        BTCUSD: [[START + 5 * SECOND, 90]]
      })

      expect(events[0].estimated).toBeUndefined()
    })
  })

  it('reports progress forward up to the end', async () => {
    const end = START + 3 * DAY
    const { progress } = await simulate(
      withOrders(order(1, 'buy', 95)),
      {
        BTCUSD: [
          [START, 100],
          [START + DAY + HOUR, 100],
          [START + 2 * DAY, 100]
        ]
      },
      { end }
    )

    expect(progress.at(-1)).toBe(end)
    expect(progress).toEqual(progress.toSorted((a, b) => a - b))
  })

  // Every trade checked one by one is slow but plainly correct, so zooming in has to
  // land on exactly the same result, whatever the path of the price.
  it.each(Array.from({ length: 25 }, (_, seed) => [seed + 1]))(
    'matches a trade-by-trade replay (random market %i)',
    async (seed) => {
      let state = seed * 7919
      const random = () => {
        state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296

        return state / 4_294_967_296
      }
      const path = (first: number, spread: number): PricePoint[] => {
        let time = START
        let price = first

        return Array.from({ length: 400 }, () => {
          const scale = [5, 200, 5000, 70_000, 3_000_000][
            Math.floor(random() * 5)
          ]

          time += Math.floor(random() * scale) + 1
          price = Math.max(
            1,
            Math.round((price + (random() - 0.5) * spread) * 100) / 100
          )

          return [time, price]
        })
      }
      const points = { BTCUSD: path(100, 4), USDBRL: path(5, 0.2) }
      const orders = Array.from({ length: 8 }, (_, index) => {
        const isUsd = random() < 0.4
        const side: TradeSide = random() < 0.5 ? 'buy' : 'sell'

        return order(
          index + 1,
          side,
          (isUsd ? 5 : 100) * (0.9 + random() * 0.2),
          isUsd
            ? {
                symbol: 'USDBRL',
                market: 'spot',
                qty: Math.ceil(random() * 20)
              }
            : { qty: Math.ceil(random() * 3) }
        )
      })
      const start = {
        ...withLong(30 + random() * 80),
        balances: { USD: 30 + random() * 80, BRL: 1000 },
        openOrders: orders,
        nextId: 100
      }
      const end = Math.max(...points.BTCUSD.map(([time]) => time)) + 1
      const { events, account } = await simulate(start, points, { end })
      const expected = replayTrades(
        start,
        (['BTCUSD', 'USDBRL'] as const).flatMap((symbol) =>
          points[symbol]
            .filter(([time]) => time < end)
            .map(([time, price], id) => ({
              symbol,
              trade: { id, price, qty: 1, time, side: 'buy' as const }
            }))
        ),
        {},
        {}
      )

      expect(
        events.map(({ kind, symbol, price, time }) => ({
          kind,
          symbol,
          price: Math.round(price * 100) / 100,
          time
        }))
      ).toEqual(
        expected.events.map(({ kind, symbol, price, time }) => ({
          kind,
          symbol,
          price: Math.round(price * 100) / 100,
          time
        }))
      )
      expect(account.balances.USD).toBeCloseTo(expected.account.balances.USD, 6)
      expect(account.balances.BRL).toBeCloseTo(expected.account.balances.BRL, 6)
      expect(account.openOrders).toEqual(expected.account.openOrders)
      expect(account.positions).toEqual(expected.account.positions)
    }
  )
})
