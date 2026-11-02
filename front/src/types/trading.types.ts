import type { Currency, OrderBook, SymbolId, TradeSide } from './market.types'

export type OrderType = 'market' | 'limit'

export type Liquidity = 'maker' | 'taker'

export type OrderRejection =
  | 'invalidQty'
  | 'invalidPrice'
  | 'belowMinNotional'
  | 'insufficientMargin'
  | 'marketUnavailable'

export interface OrderRequest {
  symbol: SymbolId
  side: TradeSide
  type: OrderType
  qty: number
  price?: number
}

export interface Order {
  id: number
  symbol: SymbolId
  side: TradeSide
  qty: number
  price: number
  createdAt: number
}

export interface Fill {
  id: number
  orderId: number
  symbol: SymbolId
  side: TradeSide
  qty: number
  price: number
  liquidity: Liquidity
  fee: number
  realizedPnl: number
  time: number
}

export interface Position {
  symbol: SymbolId
  qty: number
  avgEntry: number
}

export type LedgerEntryType = 'initial' | 'deposit' | 'trade'

export interface LedgerEntry {
  id: number
  type: LedgerEntryType
  currency: Currency
  amount: number
  balance: number
  time: number
  symbol?: SymbolId
}

export interface TradingAccount {
  balances: Record<Currency, number>
  positions: Partial<Record<SymbolId, Position>>
  openOrders: Order[]
  fills: Fill[]
  ledger: LedgerEntry[]
  nextId: number
}

export interface TradingAccountV1 {
  walletBalance: number
  positions: Partial<Record<SymbolId, Position>>
  openOrders: Order[]
  fills: Fill[]
  nextId: number
}

export type DepositResult =
  | { ok: true; account: TradingAccount; entry: LedgerEntry }
  | { ok: false; reason: 'invalidAmount' }

export type DepositFundsResult =
  { ok: true; entry: LedgerEntry } | { ok: false; reason: 'invalidAmount' }

export type MarkPrices = Partial<Record<SymbolId, number>>

export interface PriceCrossing {
  low: number
  high: number
}

export type OrderResult =
  | { ok: true; account: TradingAccount; fill?: Fill; order?: Order }
  | { ok: false; reason: OrderRejection }

export type PlaceOrderResult =
  | { ok: true; fill?: Fill; order?: Order }
  | { ok: false; reason: OrderRejection }

export interface AccountSummary {
  walletBalance: number
  unrealizedPnl: number
  equity: number
  usedMargin: number
  availableMargin: number
}

export interface PositionView extends Position {
  markPrice?: number
  unrealizedPnl: number
}

export interface OrderDraft {
  type: OrderType
  qty: string
  price: string
}

export interface ITradingService {
  start(): void
  getAccountSummary(currency: Currency): AccountSummary
  getLedger(): LedgerEntry[]
  depositFunds(currency: Currency, amount: number): DepositFundsResult
  getPositions(): PositionView[]
  getPosition(symbol: SymbolId): Position | undefined
  getOpenOrders(): Order[]
  getFills(): Fill[]
  getOrderDraft(symbol: SymbolId): OrderDraft
  updateOrderDraft(symbol: SymbolId, changes: Partial<OrderDraft>): void
  placeOrder(request: OrderRequest): PlaceOrderResult
  cancelOrder(orderId: number): void
  closePosition(symbol: SymbolId): PlaceOrderResult
  resetAccount(): void
}

export interface TradingState {
  account: TradingAccount
  drafts: Partial<Record<SymbolId, OrderDraft>>
  lastProcessedAt: number
  setAccount(account: TradingAccount): void
  setLastProcessedAt(time: number): void
  setDraft(symbol: SymbolId, draft: OrderDraft): void
}

export interface OrderSubmission {
  request: OrderRequest
  book: OrderBook | undefined
  marks: MarkPrices
  time: number
}
