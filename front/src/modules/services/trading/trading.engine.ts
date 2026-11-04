import type {
  AccountSummary,
  Currency,
  DepositResult,
  FeeRates,
  FeeRatesResult,
  Fill,
  LedgerEntry,
  LeverageResult,
  LiquidationNotice,
  Liquidity,
  MarkPrices,
  Order,
  OrderBookLevel,
  OrderRejection,
  OrderResult,
  OrderSubmission,
  Position,
  PriceCrossing,
  PriceMove,
  SimulationEvent,
  SpotHoldingView,
  SymbolId,
  TradeMarket,
  TradeSide,
  TradingAccount,
  TradingAccountV1,
  TradingAccountV2,
  TradingAccountV3,
  TradingAccountV4,
  TradingAccountV5
} from '@/types'
import {
  CURRENCIES,
  LEVERAGE_OPTIONS,
  MAX_DEPOSIT,
  MAX_FEE_RATE,
  MIN_MAKER_FEE_RATE,
  roundToDecimals,
  SYMBOLS
} from '@/utils'

export const INITIAL_BALANCES: Record<Currency, number> = {
  USD: 100_000,
  BRL: 500_000
}
export const MAKER_FEE_RATE = 0.0002
export const TAKER_FEE_RATE = 0.0005
export const DEFAULT_FEE_RATES: FeeRates = {
  maker: MAKER_FEE_RATE,
  taker: TAKER_FEE_RATE
}
const FEE_RATE_DECIMALS = 6
export const MAINTENANCE_MARGIN_RATE = 0.005
const MAX_FILLS = 200
const MAX_LEDGER_ENTRIES = 500
const MAX_LIQUIDATION_NOTICES = 20
const MONEY_DECIMALS = 2
const DEFAULT_LEVERAGE = { BTCUSD: 1, USDBRL: 1 }
const DEFAULT_TRADE_MODE: Record<SymbolId, TradeMarket> = {
  BTCUSD: 'margin',
  USDBRL: 'margin'
}

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

function createDefaultFeeRates(): Record<SymbolId, FeeRates> {
  return { BTCUSD: { ...DEFAULT_FEE_RATES }, USDBRL: { ...DEFAULT_FEE_RATES } }
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
    feeRates: createDefaultFeeRates(),
    spot: {},
    tradeMode: { ...DEFAULT_TRADE_MODE },
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
): TradingAccountV4 {
  return { ...account, leverage: { ...DEFAULT_LEVERAGE } }
}

export function migrateAccountFromV4(
  account: TradingAccountV4
): TradingAccountV5 {
  return { ...account, feeRates: createDefaultFeeRates() }
}

// Everything traded before spot existed was margin.
export function migrateAccountFromV5(
  account: TradingAccountV5
): TradingAccount {
  return {
    ...account,
    openOrders: account.openOrders.map((order) => ({
      ...order,
      market: 'margin'
    })),
    fills: account.fills.map((fill) => ({ ...fill, market: 'margin' })),
    spot: {},
    tradeMode: { ...DEFAULT_TRADE_MODE }
  }
}

const BALANCE_DUST = 1e-8

function appendLedgerEntry(
  account: TradingAccount,
  entry: Omit<LedgerEntry, 'id' | 'balance'>
): { account: TradingAccount; entry: LedgerEntry } {
  const sum = account.balances[entry.currency] + entry.amount
  // Spending a whole balance can leave float noise, which would show as "-0.00".
  const balance = Math.abs(sum) < BALANCE_DUST ? 0 : sum
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
    if (order.symbol !== symbol || order.market !== 'margin') continue

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

// A base that is itself a wallet currency, as USD is on USD/BRL, settles into that
// balance. Any other base, such as BTC, is kept as a spot holding.
function getBaseCurrency(symbol: SymbolId): Currency | undefined {
  return CURRENCIES.find((currency) => currency === SYMBOLS[symbol].base)
}

// What resting spot orders have set aside in a currency, with no leverage: buys
// hold their full cost and fee, and sells of a currency hold what they'll deliver.
function getSpotReservation(currency: Currency, account: TradingAccount) {
  return account.openOrders.reduce((total, order) => {
    if (order.market !== 'spot') return total

    if (order.side === 'sell') {
      return getBaseCurrency(order.symbol) === currency
        ? total + order.qty
        : total
    }

    if (SYMBOLS[order.symbol].quote !== currency) return total

    const makerRate = Math.max(account.feeRates[order.symbol].maker, 0)

    return total + order.qty * order.price * (1 + makerRate)
  }, 0)
}

function getUsedMargin(currency: Currency, account: TradingAccount) {
  const { positions, openOrders, leverage } = account

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
      getSpotReservation(currency, account)
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

// Spot buys can only spend real money: never more than the balance, and never
// profit that only exists on paper or margin other positions and orders need.
export function getSpendable(
  account: TradingAccount,
  currency: Currency,
  marks: MarkPrices
): number {
  const { availableMargin, walletBalance } = getAccountSummary(
    account,
    currency,
    marks
  )
  const free = walletBalance - getSpotReservation(currency, account)

  return Math.max(Math.min(availableMargin, free), 0)
}

// What can still be sold once open spot sells have set theirs aside. Selling a
// currency spends it, so it follows the same limit as anything else using that
// balance, rounded down so the amount shown can always be sold.
function getAvailableSpotQty(
  account: TradingAccount,
  symbol: SymbolId,
  marks: MarkPrices
) {
  const { qtyDecimals } = SYMBOLS[symbol]
  const baseCurrency = getBaseCurrency(symbol)

  if (baseCurrency) {
    const factor = 10 ** qtyDecimals
    // Tidied first, or float noise such as 0.3 - 0.1 would cost a whole step.
    const steps = roundToDecimals(
      getSpendable(account, baseCurrency, marks) * factor,
      6
    )

    return Math.floor(steps) / factor
  }

  const reserved = account.openOrders
    .filter(
      (order) =>
        order.market === 'spot' &&
        order.side === 'sell' &&
        order.symbol === symbol
    )
    .reduce((total, order) => total + order.qty, 0)

  // Above zero, since float noise here would otherwise round to -0.
  return Math.max(
    roundToDecimals((account.spot[symbol]?.qty ?? 0) - reserved, qtyDecimals),
    0
  )
}

// For a currency base the balance is shown as the holding, with no cost basis:
// that money has many sources, so it has no meaningful average cost.
export function getSpotHoldingView(
  account: TradingAccount,
  symbol: SymbolId,
  marks: MarkPrices = {}
): SpotHoldingView {
  const baseCurrency = getBaseCurrency(symbol)
  const markPrice = marks[symbol]
  const availableQty = getAvailableSpotQty(account, symbol, marks)

  if (baseCurrency) {
    return {
      symbol,
      qty: account.balances[baseCurrency],
      avgCost: 0,
      availableQty,
      markPrice,
      unrealizedPnl: 0
    }
  }

  const qty = account.spot[symbol]?.qty ?? 0
  const avgCost = account.spot[symbol]?.avgCost ?? 0

  return {
    symbol,
    qty,
    avgCost,
    availableQty,
    markPrice,
    value: markPrice === undefined ? undefined : qty * markPrice,
    unrealizedPnl: markPrice === undefined ? 0 : qty * (markPrice - avgCost)
  }
}

export function changeTradeMode(
  account: TradingAccount,
  symbol: SymbolId,
  mode: TradeMarket
): TradingAccount {
  return { ...account, tradeMode: { ...account.tradeMode, [symbol]: mode } }
}

interface FillInput {
  orderId: number
  symbol: SymbolId
  side: TradeSide
  qty: number
  price: number
  liquidity: Liquidity
  time: number
  isLiquidation?: boolean
}

// Never touches positions: a spot trade moves money between the symbol's quote
// balance and either its base balance or its spot holding. A currency base gets
// its own ledger entry, so each balance still adds up from its entries.
function applySpotFill(
  account: TradingAccount,
  { orderId, symbol, side, qty, price, liquidity, time }: FillInput
): { account: TradingAccount; fill: Fill } {
  const config = SYMBOLS[symbol]
  const baseCurrency = getBaseCurrency(symbol)
  const holding = account.spot[symbol]
  const heldQty = holding?.qty ?? 0
  const avgCost = holding?.avgCost ?? 0
  const signedQty = side === 'buy' ? qty : -qty
  const nextQty = roundToDecimals(heldQty + signedQty, config.qtyDecimals)
  const fee = qty * price * account.feeRates[symbol][liquidity]
  const realizedPnl =
    side === 'sell' && !baseCurrency ? qty * (price - avgCost) : 0
  const spot = { ...account.spot }

  if (baseCurrency) {
    // Nothing to hold: the base is applied to its balance below.
  } else if (nextQty === 0) {
    delete spot[symbol]
  } else {
    spot[symbol] = {
      qty: nextQty,
      avgCost:
        side === 'buy' ? (heldQty * avgCost + qty * price) / nextQty : avgCost
    }
  }

  const fill: Fill = {
    id: account.nextId,
    orderId,
    market: 'spot',
    symbol,
    side,
    qty,
    price,
    liquidity,
    fee,
    realizedPnl,
    time
  }
  const type = side === 'buy' ? 'spotBuy' : 'spotSell'
  const { account: settledQuote } = appendLedgerEntry(
    { ...account, nextId: account.nextId + 1 },
    {
      type,
      currency: config.quote,
      amount: -signedQty * price - fee,
      time,
      symbol
    }
  )
  const settled = baseCurrency
    ? appendLedgerEntry(settledQuote, {
        type,
        currency: baseCurrency,
        amount: signedQty,
        time,
        symbol
      }).account
    : settledQuote

  return {
    fill,
    account: {
      ...settled,
      spot,
      fills: [fill, ...account.fills].slice(0, MAX_FILLS)
    }
  }
}

function applyFill(
  account: TradingAccount,
  input: FillInput
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

  const feeRate = account.feeRates[symbol][liquidity]
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
    market: 'margin',
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
  const { symbol, side, type, market = 'margin' } = request
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

  const order: Order = {
    id: account.nextId,
    market,
    symbol,
    side,
    qty,
    price: referencePrice,
    createdAt: time
  }
  const fee =
    qty * referencePrice * account.feeRates[symbol][isTaker ? 'taker' : 'maker']
  const rejection =
    market === 'spot'
      ? getSpotRejection(account, order, fee, marks)
      : getMarginRejection(account, order, fee, marks)

  if (rejection) return { ok: false, reason: rejection }

  const withId = { ...account, nextId: account.nextId + 1 }

  if (isTaker) {
    const { account: filled, fill } = fillOrder(withId, order, 'taker', time)

    return { ok: true, account: filled, fill }
  }

  return {
    ok: true,
    order,
    account: { ...withId, openOrders: [...withId.openOrders, order] }
  }
}

function fillOrder(
  account: TradingAccount,
  order: Order,
  liquidity: Liquidity,
  time: number
) {
  const input = {
    orderId: order.id,
    symbol: order.symbol,
    side: order.side,
    qty: order.qty,
    price: order.price,
    liquidity,
    time
  }

  return order.market === 'spot'
    ? applySpotFill(account, input)
    : applyFill(account, input)
}

function getMarginRejection(
  account: TradingAccount,
  order: Order,
  fee: number,
  marks: MarkPrices
): OrderRejection | null {
  const { symbol, side, qty, price } = order
  const config = SYMBOLS[symbol]
  const positionQty = account.positions[symbol]?.qty ?? 0
  const isReducing =
    positionQty !== 0 &&
    (side === 'buy') !== positionQty > 0 &&
    qty <= Math.abs(positionQty)

  if (!isReducing && qty * price < config.minNotional) {
    return 'belowMinNotional'
  }

  const { equity } = getAccountSummary(account, config.quote, marks)
  const marginBefore = getUsedMargin(config.quote, account)
  const marginAfter = getUsedMargin(config.quote, {
    ...account,
    openOrders: [...account.openOrders, order]
  })

  // Orders that don't add exposure stay allowed so an underwater position can
  // always be closed.
  return marginAfter > marginBefore && marginAfter + Math.max(fee, 0) > equity
    ? 'insufficientMargin'
    : null
}

function getSpotRejection(
  account: TradingAccount,
  order: Order,
  fee: number,
  marks: MarkPrices
): OrderRejection | null {
  const { symbol, side, qty, price } = order
  const config = SYMBOLS[symbol]

  if (side === 'sell') {
    const available = getAvailableSpotQty(account, symbol, marks)

    if (qty > available) return 'insufficientSpotBalance'

    // Selling everything is always allowed, so a small leftover isn't stuck.
    return qty < available && qty * price < config.minNotional
      ? 'belowMinNotional'
      : null
  }

  if (qty * price < config.minNotional) return 'belowMinNotional'

  const cost = qty * price + Math.max(fee, 0)

  return cost > getSpendable(account, config.quote, marks)
    ? 'insufficientFunds'
    : null
}

// Fills every resting order the market touched, oldest first, ignoring orders
// placed at or after `placedBefore`. Returns the same account object when nothing
// fills so callers can skip the store write.
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
    (result, order) => fillOrder(result, order, 'maker', time).account,
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

// Whether an order needs a currency's balance to fill: its quote, except a spot
// sell, which only needs what it delivers.
function dependsOnCurrency(order: Order, currency: Currency) {
  return order.market === 'spot' && order.side === 'sell'
    ? getBaseCurrency(order.symbol) === currency
    : SYMBOLS[order.symbol].quote === currency
}

// Closes every position in the currency and cancels the orders that need its
// balance, which may be gone. Spot holdings aren't collateral, so they stay. A jump
// past the point where the balance runs out would leave it negative, so the balance
// stops at zero and a ledger entry shows the loss that was covered.
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
      (order) => !dependsOnCurrency(order, quote)
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

export function hasExposure(account: TradingAccount) {
  return (
    account.openOrders.length > 0 || Object.keys(account.positions).length > 0
  )
}

export function isSymbolExposed(account: TradingAccount, symbol: SymbolId) {
  return (
    account.positions[symbol] !== undefined ||
    account.openOrders.some((order) => order.symbol === symbol)
  )
}

function isLiquidationActive(
  position: Position,
  price: number,
  reached: number
) {
  return position.qty > 0 ? reached <= price : reached >= price
}

// Whether a price range could set anything off, counting only orders and positions
// that existed before the given time. The range may come from before they did, so a
// yes means "look closer" rather than "this happened".
export function hasTriggerInRange(
  account: TradingAccount,
  symbol: SymbolId,
  { low, high }: PriceCrossing,
  before: number,
  marks: MarkPrices
) {
  const position = account.positions[symbol]
  const liquidationPrice = getLiquidationPrice(account, symbol, marks)

  return (
    account.openOrders.some(
      (order) =>
        order.symbol === symbol &&
        order.createdAt < before &&
        (order.side === 'buy' ? low <= order.price : high >= order.price)
    ) ||
    (position !== undefined &&
      liquidationPrice !== undefined &&
      position.updatedAt < before &&
      isLiquidationActive(
        position,
        liquidationPrice,
        position.qty > 0 ? low : high
      ))
  )
}

// What the market reaches first on its way between two prices: the nearest of the
// resting orders and the liquidation price. An order goes before a liquidation at
// the same price, then the oldest order first.
function getNextTrigger(
  account: TradingAccount,
  symbol: SymbolId,
  { from, to, time }: PriceMove,
  marks: MarkPrices
) {
  const position = account.positions[symbol]
  const liquidationPrice = getLiquidationPrice(account, symbol, marks)
  const direction = to <= from ? -1 : 1
  const orders = account.openOrders
    .filter(
      (order) =>
        order.symbol === symbol &&
        order.createdAt <= time &&
        (order.side === 'buy' ? to <= order.price : to >= order.price)
    )
    .sort((a, b) => direction * (a.price - b.price) || a.id - b.id)
  const nextOrder = orders.at(0)
  const isLiquidated =
    position !== undefined &&
    liquidationPrice !== undefined &&
    position.updatedAt <= time &&
    isLiquidationActive(position, liquidationPrice, to)

  if (
    isLiquidated &&
    (!nextOrder || direction * (liquidationPrice - nextOrder.price) < 0)
  ) {
    return { liquidationPrice: liquidationPrice as number }
  }

  return nextOrder && { order: nextOrder }
}

// Applies everything a price move sets off, working it out again after each event
// because a fill moves the liquidation price and a liquidation cancels orders. A
// liquidation closes at its price, or at the starting price if that's already past
// it.
export function applyPriceMove(
  account: TradingAccount,
  symbol: SymbolId,
  move: PriceMove,
  marks: MarkPrices
): { account: TradingAccount; events: SimulationEvent[] } {
  const events: SimulationEvent[] = []
  let current = account

  for (;;) {
    const trigger = getNextTrigger(current, symbol, move, marks)

    if (!trigger) return { account: current, events }

    if (trigger.order) {
      const { order } = trigger
      const { account: filled, fill } = fillOrder(
        {
          ...current,
          openOrders: current.openOrders.filter(({ id }) => id !== order.id)
        },
        order,
        'maker',
        move.time
      )

      current = filled
      events.push({
        kind: 'fill',
        id: fill.id,
        symbol,
        market: order.market,
        side: order.side,
        qty: order.qty,
        price: order.price,
        time: move.time
      })
      continue
    }

    const position = current.positions[symbol] as Position
    const before = current
    const closePrice =
      position.qty > 0
        ? Math.min(trigger.liquidationPrice, move.from)
        : Math.max(trigger.liquidationPrice, move.from)

    current = liquidateCurrency(current, symbol, closePrice, marks, move.time)

    const cancelledOrders = before.openOrders.length - current.openOrders.length

    const known = new Set(before.liquidationNotices.map(({ id }) => id))

    for (const notice of current.liquidationNotices) {
      if (known.has(notice.id)) continue

      events.push({
        kind: 'liquidation',
        id: notice.id,
        symbol: notice.symbol,
        qty: notice.qty,
        price: notice.price,
        time: notice.time,
        cancelledOrders
      })
    }
  }
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

// A negative maker rate is a rebate, as some exchanges pay. New rates apply to
// every later fill, including orders already resting.
export function changeFeeRates(
  account: TradingAccount,
  symbol: SymbolId,
  { maker, taker }: FeeRates
): FeeRatesResult {
  const rates = {
    maker: roundToDecimals(maker, FEE_RATE_DECIMALS),
    taker: roundToDecimals(taker, FEE_RATE_DECIMALS)
  }

  if (
    !(rates.maker >= MIN_MAKER_FEE_RATE && rates.maker <= MAX_FEE_RATE) ||
    !(rates.taker >= 0 && rates.taker <= MAX_FEE_RATE)
  ) {
    return { ok: false, reason: 'invalidFeeRates' }
  }

  return {
    ok: true,
    account: { ...account, feeRates: { ...account.feeRates, [symbol]: rates } }
  }
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
