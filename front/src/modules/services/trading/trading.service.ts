import type {
  AccountSummary,
  Currency,
  DepositFundsResult,
  FeeRates,
  Fill,
  IMarketService,
  ITradingService,
  LedgerEntry,
  LiquidationNotice,
  MarkPrices,
  Order,
  OrderDraft,
  OrderRequest,
  PlaceOrderResult,
  Position,
  PositionView,
  PriceCrossing,
  SetFeeRatesResult,
  SetLeverageResult,
  SimulationEvent,
  SimulationRun,
  SpotHoldingView,
  SymbolId,
  Trade,
  TradeMarket,
  TradingAccount
} from '@/types'
import { CURRENCIES, getMidPrice } from '@/utils'
import {
  addDeposit,
  cancelOpenOrder,
  changeFeeRates,
  changeLeverage,
  changeTradeMode,
  createAccount,
  DEFAULT_FEE_RATES,
  dismissNotices,
  getAccountSummary,
  getLiquidationPrice,
  getSpendable,
  getSpotHoldingView,
  getUnrealizedPnl,
  hasExposure,
  liquidateIfBreached,
  matchRestingOrders,
  submitOrder
} from './trading.engine'
import { simulationStore } from './simulation.store'
import {
  replayTrades,
  runSimulation,
  type SymbolTrade
} from './trading.simulation'
import { tradingStore } from './trading.store'

const EMPTY_DRAFT: OrderDraft = { type: 'market', qty: '', price: '' }
const MINUTE_MS = 60_000
const PROCESSED_SAVE_INTERVAL_MS = 5_000
const SIMULATION_RETRY_MS = 30_000
const MIN_VISIBLE_GAP_MS = MINUTE_MS

export default class TradingService implements ITradingService {
  private started = false
  private hasUnreplayedGap = true
  private isAwaitingTrade = false
  private isSimulating = false
  private isSimulationQueued = false
  private bufferedTrades: SymbolTrade[] = []
  private balancesBeforeRun: TradingAccount['balances'] | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null

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
        this.prepareSimulation()
      },
      onTrade: (symbol, trade) => {
        if (this.hasUnreplayedGap) {
          this.holdTrade(symbol, trade)
          return
        }

        this.matchOrders(symbol, { low: trade.price, high: trade.price })
        this.recordProcessedTime(trade.time)
      },
      onBook: (symbol, { bids, asks }) => {
        const bestBid = bids[0]?.price
        const bestAsk = asks[0]?.price

        if (
          this.hasUnreplayedGap ||
          bestBid === undefined ||
          bestAsk === undefined
        ) {
          return
        }

        this.matchOrders(symbol, { low: bestAsk, high: bestBid })
        this.checkLiquidation(symbol, (bestBid + bestAsk) / 2)
      }
    })
  }

  public getSimulation(): SimulationRun | null {
    return simulationStore((state) => state.run)
  }

  public retrySimulation(): void {
    if (!this.isSimulating) this.prepareSimulation()
  }

  public dismissSimulation(): void {
    this.balancesBeforeRun = null
    simulationStore.getState().setRun(null)
  }

  public getAccountSummary(currency: Currency): AccountSummary {
    const account = tradingStore((state) => state.account)

    return getAccountSummary(account, currency, this.getMarkPrices())
  }

  public getLedger(): LedgerEntry[] {
    return tradingStore((state) => state.account.ledger)
  }

  public depositFunds(currency: Currency, amount: number): DepositFundsResult {
    const { account, setAccount } = tradingStore.getState()
    const result = addDeposit(
      account,
      currency,
      amount,
      this.marketService.getMarketTime()
    )

    if (!result.ok) return result

    setAccount(result.account)

    return { ok: true, entry: result.entry }
  }

  public getPositions(): PositionView[] {
    const account = tradingStore((state) => state.account)
    const marks = this.getMarkPrices()

    return Object.values(account.positions).map((position) => ({
      ...position,
      markPrice: marks[position.symbol],
      unrealizedPnl: getUnrealizedPnl(position, marks[position.symbol]),
      liquidationPrice: getLiquidationPrice(account, position.symbol, marks)
    }))
  }

  public getSpendable(currency: Currency): number {
    const account = tradingStore((state) => state.account)

    return getSpendable(account, currency, this.getMarkPrices())
  }

  public getSpotHolding(symbol: SymbolId): SpotHoldingView {
    const account = tradingStore((state) => state.account)

    return getSpotHoldingView(account, symbol, this.getMarkPrices())
  }

  public getSpotHoldings(): SpotHoldingView[] {
    const account = tradingStore((state) => state.account)
    const marks = this.getMarkPrices()

    return this.marketService
      .getSymbols()
      .filter(({ id }) => account.spot[id] !== undefined)
      .map(({ id }) => getSpotHoldingView(account, id, marks))
  }

  // Everything not already set aside for an open spot sell.
  public sellSpotHolding(symbol: SymbolId): PlaceOrderResult {
    const { account } = tradingStore.getState()
    const { availableQty } = getSpotHoldingView(
      account,
      symbol,
      this.getLatestMarkPrices()
    )

    if (availableQty <= 0) return { ok: true }

    return this.placeOrder({
      symbol,
      side: 'sell',
      type: 'market',
      market: 'spot',
      qty: availableQty
    })
  }

  public getTradeMode(symbol: SymbolId): TradeMarket {
    return tradingStore((state) => state.account.tradeMode[symbol])
  }

  public setTradeMode(symbol: SymbolId, mode: TradeMarket): void {
    const { account, setAccount } = tradingStore.getState()

    setAccount(changeTradeMode(account, symbol, mode))
  }

  public getPosition(symbol: SymbolId): Position | undefined {
    return tradingStore((state) => state.account.positions[symbol])
  }

  // Selected from the account alone so the chart doesn't re-render on every tick.
  public getLiquidationPrice(symbol: SymbolId): number | undefined {
    return tradingStore((state) =>
      getLiquidationPrice(state.account, symbol, this.getLatestMarkPrices())
    )
  }

  public getLeverage(symbol: SymbolId): number {
    return tradingStore((state) => state.account.leverage[symbol])
  }

  public setLeverage(symbol: SymbolId, leverage: number): SetLeverageResult {
    const { account, setAccount } = tradingStore.getState()
    const result = changeLeverage(
      account,
      symbol,
      leverage,
      this.getLatestMarkPrices()
    )

    if (!result.ok) return result

    setAccount(result.account)

    return { ok: true }
  }

  public getFeeRates(symbol: SymbolId): FeeRates {
    return tradingStore((state) => state.account.feeRates[symbol])
  }

  public setFeeRates(symbol: SymbolId, rates: FeeRates): SetFeeRatesResult {
    const { account, setAccount } = tradingStore.getState()
    const result = changeFeeRates(account, symbol, rates)

    if (!result.ok) return result

    setAccount(result.account)

    return { ok: true }
  }

  public resetFeeRates(symbol: SymbolId): void {
    this.setFeeRates(symbol, DEFAULT_FEE_RATES)
  }

  public getLiquidationNotices(): LiquidationNotice[] {
    return tradingStore((state) => state.account.liquidationNotices)
  }

  public dismissLiquidationNotices(): void {
    const { account, setAccount } = tradingStore.getState()

    setAccount(dismissNotices(account))
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
    if (!this.marketService.isLive() || this.hasUnreplayedGap) {
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

  // Fee rates are a preference rather than account state, so a reset keeps them.
  public resetAccount(): void {
    const { account, setAccount } = tradingStore.getState()

    setAccount({
      ...createAccount(this.marketService.getMarketTime()),
      feeRates: account.feeRates
    })
  }

  // Trading stays paused from here until the gap is replayed, or two paths could
  // fill the same orders out of order. With nothing open there's nothing to replay.
  private prepareSimulation(): void {
    if (this.isSimulating) {
      this.isSimulationQueued = true
      return
    }

    if (this.retryTimer) clearTimeout(this.retryTimer)

    this.retryTimer = null

    const { account, lastProcessedAt } = tradingStore.getState()
    const { run, setRun } = simulationStore.getState()

    if (!hasExposure(account)) {
      this.hasUnreplayedGap = false
      return
    }

    this.isAwaitingTrade = true
    setRun({
      status: 'running',
      isVisible: run?.isVisible ?? false,
      checkedUpTo: this.getSimulationStart(account, lastProcessedAt),
      events: run?.events ?? [],
      balances: []
    })
  }

  // The first live trade marks where history ends and the stream takes over, in the
  // exchange's own time, so nothing falls between them even if the clock has drifted.
  private holdTrade(symbol: SymbolId, trade: Trade): void {
    if (this.isSimulating) {
      this.bufferedTrades.push({ symbol, trade })
    } else if (this.isAwaitingTrade) {
      this.isAwaitingTrade = false
      this.bufferedTrades = [{ symbol, trade }]
      void this.simulateGap(trade.time)
    }
  }

  private async simulateGap(end: number): Promise<void> {
    this.isSimulating = true

    const { account, lastProcessedAt, setAccount, setLastProcessedAt } =
      tradingStore.getState()
    const start = this.getSimulationStart(account, lastProcessedAt)
    const kept = simulationStore.getState().run?.events ?? []
    const marks = this.getLatestMarkPrices()
    let events: SimulationEvent[] = kept

    this.balancesBeforeRun ??= account.balances
    this.updateRun({
      isVisible:
        end - start >= MIN_VISIBLE_GAP_MS ||
        simulationStore.getState().run?.isVisible === true
    })

    try {
      const simulated = await runSimulation({
        account,
        start,
        end,
        marks,
        source: this.marketService,
        onProgress: (checkedUpTo) => this.updateRun({ checkedUpTo }),
        onEvent: (event) => {
          events = [...events, event]
          this.updateRun({ events })
        }
      })
      const live = replayTrades(simulated, this.bufferedTrades, {}, marks)

      setAccount(live.account)
      setLastProcessedAt(this.bufferedTrades.at(-1)?.trade.time ?? end)
      this.finishSimulation([...events, ...live.events], live.account)
    } catch (error) {
      console.error(error)
      this.isSimulating = false
      this.isSimulationQueued = false
      this.updateRun({ status: 'failed', isVisible: true, events: kept })
      this.retryTimer = setTimeout(
        () => this.prepareSimulation(),
        SIMULATION_RETRY_MS
      )
    }
  }

  private finishSimulation(
    events: SimulationEvent[],
    account: TradingAccount
  ): void {
    const { run, setRun } = simulationStore.getState()

    this.isSimulating = false
    this.bufferedTrades = []

    if (this.isSimulationQueued) {
      this.isSimulationQueued = false
      this.updateRun({ events })
      this.prepareSimulation()
      return
    }

    this.hasUnreplayedGap = false

    if (events.length === 0 && !run?.isVisible) {
      this.dismissSimulation()
      return
    }

    const before = this.balancesBeforeRun ?? account.balances

    setRun({
      status: 'done',
      isVisible: true,
      checkedUpTo: run?.checkedUpTo ?? 0,
      events,
      balances: CURRENCIES.filter(
        (currency) => before[currency] !== account.balances[currency]
      ).map((currency) => ({
        currency,
        before: before[currency],
        after: account.balances[currency]
      }))
    })
  }

  private updateRun(changes: Partial<SimulationRun>): void {
    const { run, setRun } = simulationStore.getState()

    if (run) setRun({ ...run, ...changes })
  }

  private getSimulationStart(
    account: TradingAccount,
    lastProcessedAt: number
  ): number {
    return Math.max(
      lastProcessedAt,
      Math.min(
        ...account.openOrders.map((order) => order.createdAt),
        ...Object.values(account.positions).map(
          (position) => position.updatedAt
        )
      )
    )
  }

  // Held back until a gap is replayed, so a reload during or after a failed
  // catch-up still replays it. Only needed while orders can fill or positions can
  // be liquidated, and throttled because every write serializes the whole account
  // to localStorage.
  private recordProcessedTime(time: number): void {
    if (this.hasUnreplayedGap) return

    const { account, lastProcessedAt, setLastProcessedAt } =
      tradingStore.getState()

    if (!hasExposure(account)) return

    if (time - lastProcessedAt < PROCESSED_SAVE_INTERVAL_MS) return

    setLastProcessedAt(time)
  }

  private checkLiquidation(symbol: SymbolId, markPrice: number): void {
    const { account, setAccount } = tradingStore.getState()

    if (!account.positions[symbol]) return

    const next = liquidateIfBreached(
      account,
      symbol,
      markPrice,
      this.getLatestMarkPrices(),
      this.marketService.getMarketTime()
    )

    if (next !== account) setAccount(next)
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
