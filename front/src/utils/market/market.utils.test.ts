import { describe, expect, it } from 'vitest'
import type { OrderBook } from '@/types'
import { groupOrderBook, mergeBookDepth } from './market.utils'
import { SYMBOLS } from './market.constants'

const levels = (...pairs: [number, number][]) =>
  pairs.map(([price, qty]) => ({ price, qty }))

describe('groupOrderBook', () => {
  const book: OrderBook = {
    bids: levels([100.26, 1], [100.05, 2], [99.99, 4]),
    asks: levels([100.27, 1], [100.45, 2], [100.51, 4])
  }

  it('leaves the book as it is at the smallest step', () => {
    expect(groupOrderBook(book, 0.01, 2)).toEqual(book)
  })

  it('rounds bids down and adds up their sizes', () => {
    expect(groupOrderBook(book, 1, 2).bids).toEqual(levels([100, 3], [99, 4]))
  })

  it('rounds asks up and adds up their sizes', () => {
    expect(groupOrderBook(book, 1, 2).asks).toEqual(levels([101, 7]))
  })

  it('widens the spread as the step grows', () => {
    const spread = (step: number) => {
      const { asks, bids } = groupOrderBook(book, step, 2)

      return asks[0].price - bids[0].price
    }

    expect(spread(1)).toBe(1)
    expect(spread(10)).toBe(10)
  })

  it('never lets the two sides meet', () => {
    const tight: OrderBook = {
      bids: levels([100, 1]),
      asks: levels([100.01, 1])
    }
    const { asks, bids } = groupOrderBook(tight, 5, 2)

    expect(bids[0].price).toBe(100)
    expect(asks[0].price).toBe(105)
  })

  it('keeps a price already on the step in place', () => {
    const { asks } = groupOrderBook({ bids: [], asks: levels([105, 1]) }, 5, 2)

    expect(asks[0].price).toBe(105)
  })

  it('is free of float noise on fractional steps', () => {
    const { bids, asks } = groupOrderBook(
      { bids: levels([5.4723, 1]), asks: levels([5.4724, 1]) },
      0.0005,
      4
    )

    expect(bids[0].price).toBe(5.472)
    expect(asks[0].price).toBe(5.4725)
  })

  it('supports a step that is not a power of ten', () => {
    const { bids } = groupOrderBook(
      { bids: levels([76_803.1, 1]), asks: [] },
      2.5,
      2
    )

    expect(bids[0].price).toBe(76_802.5)
  })

  it('keeps best prices first', () => {
    const { bids, asks } = groupOrderBook(book, 0.1, 2)

    expect(bids.map((level) => level.price)).toEqual([100.2, 100, 99.9])
    expect(asks.map((level) => level.price)).toEqual([100.3, 100.5, 100.6])
  })

  it('handles an empty book', () => {
    expect(groupOrderBook({ bids: [], asks: [] }, 1, 2)).toEqual({
      bids: [],
      asks: []
    })
  })
})

describe('mergeBookDepth', () => {
  const live: OrderBook = {
    bids: levels([100, 1], [99, 1]),
    asks: levels([101, 1], [102, 1])
  }

  it('adds deeper levels beyond the live ones', () => {
    const merged = mergeBookDepth(live, {
      bids: levels([98, 5], [97, 5]),
      asks: levels([103, 5], [104, 5])
    })

    expect(merged.bids.map((level) => level.price)).toEqual([100, 99, 98, 97])
    expect(merged.asks.map((level) => level.price)).toEqual([
      101, 102, 103, 104
    ])
  })

  it('prefers live sizes where the two overlap', () => {
    const merged = mergeBookDepth(live, {
      bids: levels([100, 9], [99, 9], [98, 5]),
      asks: levels([101, 9], [103, 5])
    })

    expect(merged.bids).toEqual(levels([100, 1], [99, 1], [98, 5]))
    expect(merged.asks).toEqual(levels([101, 1], [102, 1], [103, 5]))
  })

  it('drops older snapshot prices the market has moved past', () => {
    const merged = mergeBookDepth(live, {
      bids: levels([101.5, 9], [98, 5]),
      asks: levels([100.5, 9], [103, 5])
    })

    expect(merged.bids.map((level) => level.price)).toEqual([100, 99, 98])
    expect(merged.asks.map((level) => level.price)).toEqual([101, 102, 103])
  })

  it('returns the live side when it has no levels to compare', () => {
    const merged = mergeBookDepth(
      { bids: [], asks: levels([101, 1]) },
      { bids: levels([98, 5]), asks: [] }
    )

    expect(merged.bids).toEqual([])
    expect(merged.asks).toEqual(levels([101, 1]))
  })
})

describe('book steps', () => {
  it.each(Object.values(SYMBOLS))(
    'on $id start at the tick and are ascending multiples of it',
    ({ bookSteps, tickSize, priceDecimals }) => {
      const factor = 10 ** priceDecimals

      expect(bookSteps[0]).toBe(tickSize)

      bookSteps.forEach((step, index) => {
        const units = step * factor

        expect(Math.abs(units - Math.round(units))).toBeLessThan(1e-9)

        if (index > 0) expect(step).toBeGreaterThan(bookSteps[index - 1])
      })
    }
  )
})
