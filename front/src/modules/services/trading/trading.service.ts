import type {
  AccountSummary,
  Fill,
  IMarketService,
  ITradingService,
  MarkPrices,
  Order,
  OrderDraft,
  OrderRequest,
  PlaceOrderResult,
  Position,
  PositionView,
  PriceCrossing,
  SymbolId
} from '@/types'
import { getMidPrice } from '@/utils'
import {
  cancelOpenOrder,
  createAccount,
  getAccountSummary,
  getUnrealizedPnl,
  matchRestingOrders,
  submitOrder
} from './trading.engine'
import { tradingStore } from './trading.store'

const EMPTY_DRAFT: OrderDraft = { type: 'market', qty: '', price: '' }

export default class TradingService implements ITradingService {
  private started = false

  constructor(private marketService: IMarketService) {}

  // Runs on raw stream events rather than the store, so resting orders keep
  // filling while the tab is hidden and panels have stopped updating.
  public start(): void {
    if (this.started) return

    this.started = true
    this.marketService.subscribeMarketEvents({
      onTrade: (symbol, trade) =>
        this.matchOrders(symbol, { low: trade.price, high: trade.price }),
      onBook: (symbol, { bids, asks }) => {
        const bestBid = bids[0]?.price
        const bestAsk = asks[0]?.price

        if (bestBid === undefined || bestAsk === undefined) return

        this.matchOrders(symbol, { low: bestAsk, high: bestBid })
      }
    })
  }

  public getAccountSummary(): AccountSummary {
    const account = tradingStore((state) => state.account)

    return getAccountSummary(account, this.getMarkPrices())
  }

  public getPositions(): PositionView[] {
    const positions = tradingStore((state) => state.account.positions)
    const marks = this.getMarkPrices()

    return Object.values(positions).map((position) => ({
      ...position,
      markPrice: marks[position.symbol],
      unrealizedPnl: getUnrealizedPnl(position, marks[position.symbol])
    }))
  }

  public getPosition(symbol: SymbolId): Position | undefined {
    return tradingStore((state) => state.account.positions[symbol])
  }

  public getOpenOrders(): Order[] {
    return tradingStore((state) => state.account.openOrders)
  }

  public getFills(): Fill[] {
    return tradingStore((state) => state.account.fills)
  }

  public getOrderDraft(symbol: SymbolId): OrderDraft {
    return tradingStore((state) => state.drafts[symbol] ?? EMPTY_DRAFT)
  }

  public updateOrderDraft(
    symbol: SymbolId,
    changes: Partial<OrderDraft>
  ): void {
    const { drafts, setDraft } = tradingStore.getState()

    setDraft(symbol, { ...(drafts[symbol] ?? EMPTY_DRAFT), ...changes })
  }

  public placeOrder(request: OrderRequest): PlaceOrderResult {
    if (!this.marketService.isLive()) {
      return { ok: false, reason: 'marketUnavailable' }
    }

    const { account, setAccount } = tradingStore.getState()
    const result = submitOrder(account, {
      request,
      book: this.marketService.getLatestBook(request.symbol),
      marks: this.getLatestMarkPrices(),
      time: this.marketService.getMarketTime()
    })

    if (!result.ok) return result

    setAccount(result.account)

    return { ok: true, fill: result.fill, order: result.order }
  }

  public cancelOrder(orderId: number): void {
    const { account, setAccount } = tradingStore.getState()

    setAccount(cancelOpenOrder(account, orderId))
  }

  public closePosition(symbol: SymbolId): PlaceOrderResult {
    const position = tradingStore.getState().account.positions[symbol]

    if (!position) return { ok: true }

    return this.placeOrder({
      symbol,
      side: position.qty > 0 ? 'sell' : 'buy',
      type: 'market',
      qty: Math.abs(position.qty)
    })
  }

  public resetAccount(): void {
    tradingStore.getState().setAccount(createAccount())
  }

  private matchOrders(symbol: SymbolId, crossing: PriceCrossing): void {
    const { account, setAccount } = tradingStore.getState()
    const next = matchRestingOrders(
      account,
      symbol,
      crossing,
      this.marketService.getMarketTime()
    )

    if (next !== account) setAccount(next)
  }

  private getMarkPrices(): MarkPrices {
    const marks: MarkPrices = {}

    for (const { id } of this.marketService.getSymbols()) {
      marks[id] = this.marketService.getMarkPrice(id)
    }

    return marks
  }

  private getLatestMarkPrices(): MarkPrices {
    const marks: MarkPrices = {}

    for (const { id } of this.marketService.getSymbols()) {
      marks[id] = getMidPrice(this.marketService.getLatestBook(id))
    }

    return marks
  }
}
