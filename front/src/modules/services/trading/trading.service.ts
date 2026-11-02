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
import { getMidPrice, MINUTE_CANDLES_PAGE_SIZE } from '@/utils'
import {
  cancelOpenOrder,
  createAccount,
  getAccountSummary,
  getUnrealizedPnl,
  matchRestingOrders,
  replayCandles,
  submitOrder
} from './trading.engine'
import { tradingStore } from './trading.store'

const EMPTY_DRAFT: OrderDraft = { type: 'market', qty: '', price: '' }
const MINUTE_MS = 60_000
const PROCESSED_SAVE_INTERVAL_MS = 5_000
const CATCH_UP_RETRY_MS = 30_000

export default class TradingService implements ITradingService {
  private started = false
  private hasUnreplayedGap = true
  private catchingUp = false
  private catchUpQueued = false
  private catchUpRetryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private marketService: IMarketService) {}

  // Runs on raw stream events rather than the store, so resting orders keep
  // filling while the tab is hidden and panels have stopped updating.
  public start(): void {
    if (this.started) return

    this.started = true

    // A tab that waited behind another one holds a stale copy of the account.
    void tradingStore.persist.rehydrate()

    this.marketService.subscribeMarketEvents({
      onOpen: () => {
        this.hasUnreplayedGap = true
        void this.catchUp()
      },
      onTrade: (symbol, trade) => {
        this.matchOrders(symbol, { low: trade.price, high: trade.price })
        this.recordProcessedTime(trade.time)
      },
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

  // Replays the time the stream wasn't running: from the last saved point after
  // a reload, or from the drop after a reconnect. Only one run goes at a time.
  private async catchUp(): Promise<void> {
    if (this.catchingUp) {
      this.catchUpQueued = true
      return
    }

    this.catchingUp = true

    try {
      for (const { id } of this.marketService.getSymbols()) {
        await this.replaySymbol(id)
      }

      if (!this.catchUpQueued) this.hasUnreplayedGap = false
    } catch (error) {
      console.error(error)
      this.scheduleCatchUpRetry()
    } finally {
      this.catchingUp = false
    }

    if (this.catchUpQueued) {
      this.catchUpQueued = false
      void this.catchUp()
    }
  }

  private async replaySymbol(symbol: SymbolId): Promise<void> {
    const { account, lastProcessedAt } = tradingStore.getState()
    const placedAt = account.openOrders
      .filter((order) => order.symbol === symbol)
      .map((order) => order.createdAt)

    if (placedAt.length === 0) return

    let startTime =
      Math.floor(Math.max(lastProcessedAt, Math.min(...placedAt)) / MINUTE_MS) *
      MINUTE_MS

    for (;;) {
      const candles = await this.marketService.getMinuteCandlesSince(
        symbol,
        startTime
      )
      const { account: current, setAccount } = tradingStore.getState()
      const next = replayCandles(current, symbol, candles)

      if (next !== current) setAccount(next)

      const last = candles.at(-1)
      const hasOpenOrders = next.openOrders.some(
        (order) => order.symbol === symbol
      )

      if (
        !last ||
        candles.length < MINUTE_CANDLES_PAGE_SIZE ||
        !hasOpenOrders
      ) {
        return
      }

      startTime = last.time * 1000 + MINUTE_MS
    }
  }

  private scheduleCatchUpRetry(): void {
    if (this.catchUpRetryTimer) return

    this.catchUpRetryTimer = setTimeout(() => {
      this.catchUpRetryTimer = null
      void this.catchUp()
    }, CATCH_UP_RETRY_MS)
  }

  // Held back until a gap is replayed, so a reload during or after a failed
  // catch-up still replays it. Only needed while orders can fill, and throttled
  // because every write serializes the whole account to localStorage.
  private recordProcessedTime(time: number): void {
    if (this.hasUnreplayedGap) return

    const { account, lastProcessedAt, setLastProcessedAt } =
      tradingStore.getState()

    if (account.openOrders.length === 0) return
    if (time - lastProcessedAt < PROCESSED_SAVE_INTERVAL_MS) return

    setLastProcessedAt(time)
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
