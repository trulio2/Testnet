import type {
  AccountSummary,
  Fill,
  Liquidity,
  MarkPrices,
  Order,
  OrderBookLevel,
  OrderResult,
  OrderSubmission,
  Position,
  PriceCrossing,
  SymbolConfig,
  SymbolId,
  TradeSide,
  TradingAccount
} from '@/types'
import { roundToDecimals, SYMBOLS } from '@/utils'

export const INITIAL_BALANCE = 100_000
export const MAKER_FEE_RATE = 0.0002
export const TAKER_FEE_RATE = 0.0005
export const LEVERAGE = 1
const MAX_FILLS = 200

export function createAccount(): TradingAccount {
  return {
    walletBalance: INITIAL_BALANCE,
    positions: {},
    openOrders: [],
    fills: [],
    nextId: 1
  }
}

// The only non-USD quote is BRL on USD/BRL, so a symbol's own price is always
// the rate that converts its quote currency to USD.
function quoteToUsd(config: SymbolConfig, amount: number, price: number) {
  return config.quote === 'USD' ? amount : amount / price
}

function notionalUsd(config: SymbolConfig, qty: number, price: number) {
  return config.quote === 'USD' ? qty * price : qty
}

// Fills against the visible levels. An order larger than the visible book takes
// its remainder at the worst visible price.
export function getBookFillPrice(
  levels: OrderBookLevel[],
  qty: number
): number | undefined {
  const worst = levels.at(-1)

  if (!worst) return undefined

  let remaining = qty
  let cost = 0

  for (const level of levels) {
    const taken = Math.min(remaining, level.qty)

    cost += taken * level.price
    remaining -= taken

    if (remaining <= 0) break
  }

  return (cost + Math.max(remaining, 0) * worst.price) / qty
}

// The margin a symbol can need if its open orders fill. Long and short sides
// are alternatives, and the part of an order that only closes the position adds
// no exposure, so a take-profit on an open position costs nothing.
function getSymbolMargin(
  symbol: SymbolId,
  position: Position | undefined,
  orders: Order[]
): number {
  const config = SYMBOLS[symbol]
  const positionQty = position?.qty ?? 0
  const positionValue = position
    ? notionalUsd(config, Math.abs(positionQty), position.avgEntry)
    : 0
  let longValue = positionQty > 0 ? positionValue : 0
  let shortValue = positionQty < 0 ? positionValue : 0
  let closableByBuys = Math.max(-positionQty, 0)
  let closableBySells = Math.max(positionQty, 0)

  for (const order of orders) {
    if (order.symbol !== symbol) continue

    if (order.side === 'buy') {
      const closing = Math.min(order.qty, closableByBuys)

      closableByBuys -= closing
      longValue += notionalUsd(config, order.qty - closing, order.price)
    } else {
      const closing = Math.min(order.qty, closableBySells)

      closableBySells -= closing
      shortValue += notionalUsd(config, order.qty - closing, order.price)
    }
  }

  return Math.max(longValue, shortValue) / LEVERAGE
}

function getUsedMargin(
  positions: TradingAccount['positions'],
  orders: Order[]
) {
  return (Object.keys(SYMBOLS) as SymbolId[]).reduce(
    (total, symbol) =>
      total + getSymbolMargin(symbol, positions[symbol], orders),
    0
  )
}

export function getUnrealizedPnl(position: Position, markPrice?: number) {
  if (markPrice === undefined) return 0

  return quoteToUsd(
    SYMBOLS[position.symbol],
    position.qty * (markPrice - position.avgEntry),
    markPrice
  )
}

export function getAccountSummary(
  account: TradingAccount,
  marks: MarkPrices
): AccountSummary {
  const unrealizedPnl = Object.values(account.positions).reduce(
    (total, position) =>
      total + getUnrealizedPnl(position, marks[position.symbol]),
    0
  )
  const equity = account.walletBalance + unrealizedPnl
  const usedMargin = getUsedMargin(account.positions, account.openOrders)

  return {
    walletBalance: account.walletBalance,
    unrealizedPnl,
    equity,
    usedMargin,
    availableMargin: equity - usedMargin
  }
}

function applyFill(
  account: TradingAccount,
  input: {
    orderId: number
    symbol: SymbolId
    side: TradeSide
    qty: number
    price: number
    liquidity: Liquidity
    time: number
  }
): { account: TradingAccount; fill: Fill } {
  const { orderId, symbol, side, qty, price, liquidity, time } = input
  const config = SYMBOLS[symbol]
  const current = account.positions[symbol]
  const currentQty = current?.qty ?? 0
  const currentEntry = current?.avgEntry ?? 0
  const signedQty = side === 'buy' ? qty : -qty
  const isClosing =
    currentQty !== 0 && Math.sign(currentQty) !== Math.sign(signedQty)
  const closedQty = isClosing ? Math.min(Math.abs(currentQty), qty) : 0
  const realizedQuote =
    closedQty * (price - currentEntry) * Math.sign(currentQty)
  const nextQty = roundToDecimals(currentQty + signedQty, config.qtyDecimals)

  let nextEntry = price

  if (!isClosing) {
    nextEntry =
      (Math.abs(currentQty) * currentEntry + qty * price) / Math.abs(nextQty)
  } else if (Math.sign(nextQty) === Math.sign(currentQty)) {
    nextEntry = currentEntry
  }

  const realizedPnl = quoteToUsd(config, realizedQuote, price)
  const feeRate = liquidity === 'maker' ? MAKER_FEE_RATE : TAKER_FEE_RATE
  const fee = notionalUsd(config, qty, price) * feeRate
  const positions = { ...account.positions }

  if (nextQty === 0) delete positions[symbol]
  else positions[symbol] = { symbol, qty: nextQty, avgEntry: nextEntry }

  const fill: Fill = {
    id: account.nextId,
    orderId,
    symbol,
    side,
    qty,
    price,
    liquidity,
    fee,
    realizedPnl,
    time
  }

  return {
    fill,
    account: {
      ...account,
      walletBalance: account.walletBalance + realizedPnl - fee,
      positions,
      fills: [fill, ...account.fills].slice(0, MAX_FILLS),
      nextId: account.nextId + 1
    }
  }
}

export function submitOrder(
  account: TradingAccount,
  { request, book, marks, time }: OrderSubmission
): OrderResult {
  const { symbol, side, type } = request
  const config = SYMBOLS[symbol]
  const qty = roundToDecimals(request.qty, config.qtyDecimals)

  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, reason: 'invalidQty' }
  }

  const levels = side === 'buy' ? book?.asks : book?.bids
  const best = levels?.[0]?.price

  if (!levels || best === undefined) {
    return { ok: false, reason: 'marketUnavailable' }
  }

  const limitPrice =
    type === 'limit'
      ? roundToDecimals(request.price ?? NaN, config.priceDecimals)
      : undefined

  if (
    type === 'limit' &&
    (limitPrice === undefined ||
      !Number.isFinite(limitPrice) ||
      limitPrice <= 0)
  ) {
    return { ok: false, reason: 'invalidPrice' }
  }

  const crossesBook =
    limitPrice !== undefined &&
    (side === 'buy' ? limitPrice >= best : limitPrice <= best)
  const isTaker = type === 'market' || crossesBook
  const referencePrice =
    type === 'market'
      ? (getBookFillPrice(levels, qty) as number)
      : crossesBook
        ? best
        : (limitPrice as number)

  const positionQty = account.positions[symbol]?.qty ?? 0
  const isReducing =
    positionQty !== 0 &&
    (side === 'buy') !== positionQty > 0 &&
    qty <= Math.abs(positionQty)

  if (!isReducing && qty * referencePrice < config.minNotional) {
    return { ok: false, reason: 'belowMinNotional' }
  }

  const order: Order = {
    id: account.nextId,
    symbol,
    side,
    qty,
    price: referencePrice,
    createdAt: time
  }
  const { equity } = getAccountSummary(account, marks)
  const marginBefore = getUsedMargin(account.positions, account.openOrders)
  const marginAfter = getUsedMargin(account.positions, [
    ...account.openOrders,
    order
  ])
  const feeRate = isTaker ? TAKER_FEE_RATE : MAKER_FEE_RATE
  const fee = notionalUsd(config, qty, referencePrice) * feeRate

  // Orders that don't add exposure stay allowed so an underwater position can
  // always be closed.
  if (marginAfter > marginBefore && marginAfter + fee > equity) {
    return { ok: false, reason: 'insufficientMargin' }
  }

  const withId = { ...account, nextId: account.nextId + 1 }

  if (isTaker) {
    const { account: filled, fill } = applyFill(withId, {
      orderId: order.id,
      symbol,
      side,
      qty,
      price: referencePrice,
      liquidity: 'taker',
      time
    })

    return { ok: true, account: filled, fill }
  }

  return {
    ok: true,
    order,
    account: { ...withId, openOrders: [...withId.openOrders, order] }
  }
}

// Fills every resting order the market touched, oldest first. Returns the same
// account object when nothing fills so callers can skip the store write.
export function matchRestingOrders(
  account: TradingAccount,
  symbol: SymbolId,
  { low, high }: PriceCrossing,
  time: number
): TradingAccount {
  const matched = account.openOrders
    .filter(
      (order) =>
        order.symbol === symbol &&
        (order.side === 'buy' ? low <= order.price : high >= order.price)
    )
    .sort((a, b) => a.id - b.id)

  if (matched.length === 0) return account

  const matchedIds = new Set(matched.map((order) => order.id))

  return matched.reduce(
    (result, order) =>
      applyFill(result, {
        orderId: order.id,
        symbol,
        side: order.side,
        qty: order.qty,
        price: order.price,
        liquidity: 'maker',
        time
      }).account,
    {
      ...account,
      openOrders: account.openOrders.filter(
        (order) => !matchedIds.has(order.id)
      )
    }
  )
}

export function cancelOpenOrder(
  account: TradingAccount,
  orderId: number
): TradingAccount {
  return {
    ...account,
    openOrders: account.openOrders.filter((order) => order.id !== orderId)
  }
}
