import type {
  AccountSummary,
  Candle,
  Currency,
  DepositResult,
  Fill,
  LedgerEntry,
  LeverageResult,
  LiquidationNotice,
  Liquidity,
  MarkPrices,
  Order,
  OrderBookLevel,
  OrderResult,
  OrderSubmission,
  Position,
  PriceCrossing,
  SymbolId,
  TradeSide,
  TradingAccount,
  TradingAccountV1,
  TradingAccountV2,
  TradingAccountV3
} from '@/types'
import {
  CURRENCIES,
  LEVERAGE_OPTIONS,
  MAX_DEPOSIT,
  roundToDecimals,
  SYMBOLS
} from '@/utils'

export const INITIAL_BALANCES: Record<Currency, number> = {
  USD: 100_000,
  BRL: 500_000
}
export const MAKER_FEE_RATE = 0.0002
export const TAKER_FEE_RATE = 0.0005
export const MAINTENANCE_MARGIN_RATE = 0.005
const MAX_FILLS = 200
const MAX_LEDGER_ENTRIES = 500
const MAX_LIQUIDATION_NOTICES = 20
const MONEY_DECIMALS = 2
const DEFAULT_LEVERAGE = { BTCUSD: 1, USDBRL: 1 }

function createInitialLedger(
  balances: Record<Currency, number>,
  firstId: number,
  time: number
): LedgerEntry[] {
  return CURRENCIES.map((currency, index) => ({
    id: firstId + index,
    type: 'initial',
    currency,
    amount: balances[currency],
    balance: balances[currency],
    time
  }))
}

export function createAccount(time = 0): TradingAccount {
  return {
    balances: { ...INITIAL_BALANCES },
    positions: {},
    openOrders: [],
    fills: [],
    ledger: createInitialLedger(INITIAL_BALANCES, 1, time),
    liquidationNotices: [],
    leverage: { ...DEFAULT_LEVERAGE },
    nextId: CURRENCIES.length + 1
  }
}

// Saved accounts before the USD and BRL split held one USD balance and converted
// USD/BRL fees and PnL to USD at the fill price, which this reverses.
export function migrateAccountFromV1(
  account: TradingAccountV1,
  time: number
): TradingAccountV2 {
  const balances = { USD: account.walletBalance, BRL: INITIAL_BALANCES.BRL }

  return {
    balances,
    positions: account.positions,
    openOrders: account.openOrders,
    fills: account.fills.map((fill) =>
      SYMBOLS[fill.symbol].quote === 'USD'
        ? fill
        : {
            ...fill,
            fee: fill.fee * fill.price,
            realizedPnl: fill.realizedPnl * fill.price
          }
    ),
    ledger: createInitialLedger(balances, account.nextId, time),
    nextId: account.nextId + CURRENCIES.length
  }
}

// Positions start counting from the upgrade: catch-up only replays liquidations
// after a position's last change, so an old position isn't judged on old prices.
export function migrateAccountFromV2(
  account: TradingAccountV2,
  time: number
): TradingAccountV3 {
  const positions: TradingAccount['positions'] = {}

  for (const position of Object.values(account.positions)) {
    positions[position.symbol] = { ...position, updatedAt: time }
  }

  return { ...account, positions, liquidationNotices: [] }
}

export function migrateAccountFromV3(
  account: TradingAccountV3
): TradingAccount {
  return { ...account, leverage: { ...DEFAULT_LEVERAGE } }
}

function appendLedgerEntry(
  account: TradingAccount,
  entry: Omit<LedgerEntry, 'id' | 'balance'>
): { account: TradingAccount; entry: LedgerEntry } {
  const balance = account.balances[entry.currency] + entry.amount
  const created = { ...entry, id: account.nextId, balance }

  return {
    entry: created,
    account: {
      ...account,
      balances: { ...account.balances, [entry.currency]: balance },
      ledger: [created, ...account.ledger].slice(0, MAX_LEDGER_ENTRIES),
      nextId: account.nextId + 1
    }
  }
}

export function addDeposit(
  account: TradingAccount,
  currency: Currency,
  amount: number,
  time: number
): DepositResult {
  const rounded = roundToDecimals(amount, MONEY_DECIMALS)

  if (!Number.isFinite(rounded) || rounded <= 0 || rounded > MAX_DEPOSIT) {
    return { ok: false, reason: 'invalidAmount' }
  }

  return {
    ok: true,
    ...appendLedgerEntry(account, {
      type: 'deposit',
      currency,
      amount: rounded,
      time
    })
  }
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
  orders: Order[],
  leverage: number
): number {
  const positionQty = position?.qty ?? 0
  const positionValue = position ? Math.abs(positionQty) * position.avgEntry : 0
  let longValue = positionQty > 0 ? positionValue : 0
  let shortValue = positionQty < 0 ? positionValue : 0
  let closableByBuys = Math.max(-positionQty, 0)
  let closableBySells = Math.max(positionQty, 0)

  for (const order of orders) {
    if (order.symbol !== symbol) continue

    if (order.side === 'buy') {
      const closing = Math.min(order.qty, closableByBuys)

      closableByBuys -= closing
      longValue += (order.qty - closing) * order.price
    } else {
      const closing = Math.min(order.qty, closableBySells)

      closableBySells -= closing
      shortValue += (order.qty - closing) * order.price
    }
  }

  return Math.max(longValue, shortValue) / leverage
}

function getUsedMargin(
  currency: Currency,
  { positions, openOrders, leverage }: TradingAccount
) {
  return (Object.keys(SYMBOLS) as SymbolId[])
    .filter((symbol) => SYMBOLS[symbol].quote === currency)
    .reduce(
      (total, symbol) =>
        total +
        getSymbolMargin(
          symbol,
          positions[symbol],
          openOrders,
          leverage[symbol]
        ),
      0
    )
}

// In the symbol's quote currency.
export function getUnrealizedPnl(position: Position, markPrice?: number) {
  if (markPrice === undefined) return 0

  return position.qty * (markPrice - position.avgEntry)
}

export function getAccountSummary(
  account: TradingAccount,
  currency: Currency,
  marks: MarkPrices
): AccountSummary {
  const unrealizedPnl = Object.values(account.positions)
    .filter((position) => SYMBOLS[position.symbol].quote === currency)
    .reduce(
      (total, position) =>
        total + getUnrealizedPnl(position, marks[position.symbol]),
      0
    )
  const walletBalance = account.balances[currency]
  const equity = walletBalance + unrealizedPnl
  const usedMargin = getUsedMargin(currency, account)

  return {
    walletBalance,
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
    isLiquidation?: boolean
  }
): { account: TradingAccount; fill: Fill } {
  const { orderId, symbol, side, qty, price, liquidity, time, isLiquidation } =
    input
  const config = SYMBOLS[symbol]
  const current = account.positions[symbol]
  const currentQty = current?.qty ?? 0
  const currentEntry = current?.avgEntry ?? 0
  const signedQty = side === 'buy' ? qty : -qty
  const isClosing =
    currentQty !== 0 && Math.sign(currentQty) !== Math.sign(signedQty)
  const closedQty = isClosing ? Math.min(Math.abs(currentQty), qty) : 0
  const realizedPnl = closedQty * (price - currentEntry) * Math.sign(currentQty)
  const nextQty = roundToDecimals(currentQty + signedQty, config.qtyDecimals)

  let nextEntry = price

  if (!isClosing) {
    nextEntry =
      (Math.abs(currentQty) * currentEntry + qty * price) / Math.abs(nextQty)
  } else if (Math.sign(nextQty) === Math.sign(currentQty)) {
    nextEntry = currentEntry
  }

  const feeRate = liquidity === 'maker' ? MAKER_FEE_RATE : TAKER_FEE_RATE
  const fee = qty * price * feeRate
  const positions = { ...account.positions }

  if (nextQty === 0) delete positions[symbol]
  else {
    positions[symbol] = {
      symbol,
      qty: nextQty,
      avgEntry: nextEntry,
      updatedAt: time
    }
  }

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
    time,
    ...(isLiquidation ? { isLiquidation } : {})
  }

  const { account: settled } = appendLedgerEntry(
    { ...account, nextId: account.nextId + 1 },
    {
      type: isLiquidation ? 'liquidation' : 'trade',
      currency: config.quote,
      amount: realizedPnl - fee,
      time,
      symbol
    }
  )

  return {
    fill,
    account: {
      ...settled,
      positions,
      fills: [fill, ...account.fills].slice(0, MAX_FILLS)
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
  const { equity } = getAccountSummary(account, config.quote, marks)
  const marginBefore = getUsedMargin(config.quote, account)
  const marginAfter = getUsedMargin(config.quote, {
    ...account,
    openOrders: [...account.openOrders, order]
  })
  const feeRate = isTaker ? TAKER_FEE_RATE : MAKER_FEE_RATE
  const fee = qty * referencePrice * feeRate

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

// Fills every resting order the market touched, oldest first, ignoring orders
// placed at or after `placedBefore`. Returns the same account object when nothing
// fills so callers can skip the store write.
export function matchRestingOrders(
  account: TradingAccount,
  symbol: SymbolId,
  { low, high }: PriceCrossing,
  time: number,
  placedBefore = Infinity
): TradingAccount {
  const matched = account.openOrders
    .filter(
      (order) =>
        order.symbol === symbol &&
        order.createdAt < placedBefore &&
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

// The price at which a position's currency runs out of margin: where equity meets
// the maintenance margin of its positions. Undefined when no price can reach it,
// such as a long whose balance covers the whole fall to zero.
export function getLiquidationPrice(
  account: TradingAccount,
  symbol: SymbolId,
  marks: MarkPrices
): number | undefined {
  const position = account.positions[symbol]

  if (!position) return undefined

  const { quote } = SYMBOLS[symbol]
  const rate = MAINTENANCE_MARGIN_RATE
  const size = Math.abs(position.qty)
  const reserve = Object.values(account.positions)
    .filter(
      (other) =>
        other.symbol !== symbol && SYMBOLS[other.symbol].quote === quote
    )
    .reduce((total, other) => {
      const mark = marks[other.symbol] ?? other.avgEntry

      return (
        total +
        other.qty * (mark - other.avgEntry) -
        Math.abs(other.qty) * mark * rate
      )
    }, account.balances[quote])
  const price =
    position.qty > 0
      ? (size * position.avgEntry - reserve) / (size * (1 - rate))
      : (reserve + size * position.avgEntry) / (size * (1 + rate))

  return price > 0 ? price : undefined
}

// Closes every position in the currency and cancels its orders. A jump past the
// point where the balance runs out would leave it negative, so the balance stops
// at zero and a ledger entry shows the loss that was covered.
function liquidateCurrency(
  account: TradingAccount,
  symbol: SymbolId,
  price: number,
  marks: MarkPrices,
  time: number
): TradingAccount {
  const { quote } = SYMBOLS[symbol]
  const notices: LiquidationNotice[] = []
  let result: TradingAccount = {
    ...account,
    openOrders: account.openOrders.filter(
      (order) => SYMBOLS[order.symbol].quote !== quote
    )
  }

  for (const position of Object.values(account.positions)) {
    if (SYMBOLS[position.symbol].quote !== quote) continue

    const closePrice = roundToDecimals(
      position.symbol === symbol
        ? price
        : (marks[position.symbol] ?? position.avgEntry),
      SYMBOLS[position.symbol].priceDecimals
    )
    const { account: closed, fill } = applyFill(
      { ...result, nextId: result.nextId + 1 },
      {
        orderId: result.nextId,
        symbol: position.symbol,
        side: position.qty > 0 ? 'sell' : 'buy',
        qty: Math.abs(position.qty),
        price: closePrice,
        liquidity: 'taker',
        time,
        isLiquidation: true
      }
    )

    result = closed
    notices.push({
      id: fill.id,
      symbol: position.symbol,
      qty: position.qty,
      price: closePrice,
      time
    })
  }

  const balance = result.balances[quote]

  if (balance < 0) {
    result = appendLedgerEntry(result, {
      type: 'lossCovered',
      currency: quote,
      amount: -balance,
      time
    }).account
  }

  return {
    ...result,
    liquidationNotices: [...notices, ...result.liquidationNotices].slice(
      0,
      MAX_LIQUIDATION_NOTICES
    )
  }
}

// Returns the same account when nothing is breached so callers can skip the store
// write.
export function liquidateIfBreached(
  account: TradingAccount,
  symbol: SymbolId,
  markPrice: number,
  marks: MarkPrices,
  time: number
): TradingAccount {
  const position = account.positions[symbol]
  const liquidationPrice = getLiquidationPrice(account, symbol, marks)

  if (!position || liquidationPrice === undefined) return account

  const isBreached =
    position.qty > 0
      ? markPrice <= liquidationPrice
      : markPrice >= liquidationPrice

  return isBreached
    ? liquidateCurrency(account, symbol, markPrice, marks, time)
    : account
}

// A candle only counts for a position last changed before it opened, because its
// high and low may come from before that change. The close is at the liquidation
// price, or at the candle's open if the market had already gone past it.
function liquidateOnCandle(
  account: TradingAccount,
  symbol: SymbolId,
  candle: Candle,
  marks: MarkPrices
): TradingAccount {
  const openedAt = candle.time * 1000
  const position = account.positions[symbol]
  const liquidationPrice = getLiquidationPrice(account, symbol, marks)

  if (
    !position ||
    liquidationPrice === undefined ||
    position.updatedAt >= openedAt
  ) {
    return account
  }

  if (position.qty > 0) {
    return candle.low <= liquidationPrice
      ? liquidateCurrency(
          account,
          symbol,
          Math.min(liquidationPrice, candle.open),
          marks,
          openedAt
        )
      : account
  }

  return candle.high >= liquidationPrice
    ? liquidateCurrency(
        account,
        symbol,
        Math.max(liquidationPrice, candle.open),
        marks,
        openedAt
      )
    : account
}

// Applies candles from a period the live stream missed. A candle only counts for
// orders placed before it opened, because its high and low may come from before
// the order existed.
export function replayCandles(
  account: TradingAccount,
  symbol: SymbolId,
  candles: Candle[],
  marks: MarkPrices = {}
): TradingAccount {
  return candles.reduce((result, candle) => {
    const openedAt = candle.time * 1000
    const matched = matchRestingOrders(
      result,
      symbol,
      { low: candle.low, high: candle.high },
      openedAt,
      openedAt
    )

    return liquidateOnCandle(matched, symbol, candle, marks)
  }, account)
}

export function dismissNotices(account: TradingAccount): TradingAccount {
  return { ...account, liquidationNotices: [] }
}

// Raising leverage only frees margin. Lowering it is refused when the margin it
// would need is more than the equity can cover.
export function changeLeverage(
  account: TradingAccount,
  symbol: SymbolId,
  leverage: number,
  marks: MarkPrices
): LeverageResult {
  if (!LEVERAGE_OPTIONS.includes(leverage)) {
    return { ok: false, reason: 'invalidLeverage' }
  }

  const { quote } = SYMBOLS[symbol]
  const next = {
    ...account,
    leverage: { ...account.leverage, [symbol]: leverage }
  }
  const marginAfter = getUsedMargin(quote, next)
  const { equity, usedMargin } = getAccountSummary(account, quote, marks)

  if (marginAfter > usedMargin && marginAfter > equity) {
    return { ok: false, reason: 'insufficientMargin' }
  }

  return { ok: true, account: next }
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
