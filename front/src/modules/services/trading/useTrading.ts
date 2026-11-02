import { useMemo } from 'react'
import IoC from '@/modules/ioc'
import {
  type Currency,
  type FeeRates,
  type IMarketService,
  type ITradingService,
  type OrderDraft,
  type OrderRequest,
  SERVICES,
  type SymbolId
} from '@/types'
import {
  CURRENCIES,
  formatCompact,
  formatDecimal,
  formatFeePercent,
  formatSignedDecimal,
  formatUtcDateTime,
  LEVERAGE_OPTIONS,
  MAX_DEPOSIT,
  MAX_FEE_RATE,
  MIN_MAKER_FEE_RATE,
  parseDecimalInput,
  toFeePercentInput
} from '@/utils'
import useLocale from '../locale/useLocale'

const MONEY_DECIMALS = 2

const tradingService = IoC.getOrCreateInstance<ITradingService>(
  SERVICES.TRADING
)
const marketService = IoC.getOrCreateInstance<IMarketService>(SERVICES.MARKET)

const tradingActions = {
  placeOrder: (request: OrderRequest) => tradingService.placeOrder(request),
  cancelOrder: (orderId: number) => tradingService.cancelOrder(orderId),
  closePosition: (symbol: SymbolId) => tradingService.closePosition(symbol),
  resetAccount: () => tradingService.resetAccount(),
  dismissLiquidationNotices: () => tradingService.dismissLiquidationNotices(),
  setLeverage: (symbol: SymbolId, leverage: number) =>
    tradingService.setLeverage(symbol, leverage),
  setFeeRates: (symbol: SymbolId, rates: FeeRates) =>
    tradingService.setFeeRates(symbol, rates),
  resetFeeRates: (symbol: SymbolId) => tradingService.resetFeeRates(symbol),
  depositFunds: (currency: Currency, amount: number) =>
    tradingService.depositFunds(currency, amount),
  updateOrderDraft: (symbol: SymbolId, changes: Partial<OrderDraft>) =>
    tradingService.updateOrderDraft(symbol, changes)
}

export function useTradingActions() {
  return tradingActions
}

export function useAccountSummary(currency: Currency) {
  return tradingService.getAccountSummary(currency)
}

// In the order entries were applied, not by time, so the running balance always
// follows row to row even when catch-up adds an older fill.
export function useLedger() {
  return tradingService.getLedger()
}

const walletConfig = {
  currencies: CURRENCIES,
  maxDeposit: MAX_DEPOSIT,
  feeLimits: {
    minMakerPercent: MIN_MAKER_FEE_RATE * 100,
    maxPercent: MAX_FEE_RATE * 100
  },
  formatDateTime: formatUtcDateTime
}

export function useWallet() {
  return walletConfig
}

export function usePositions() {
  return tradingService.getPositions()
}

export function usePosition(symbol: SymbolId) {
  return tradingService.getPosition(symbol)
}

export function useLeverage(symbol: SymbolId) {
  return {
    leverage: tradingService.getLeverage(symbol),
    options: LEVERAGE_OPTIONS
  }
}

export function useFeeRates(symbol: SymbolId) {
  const { locale } = useLocale()
  const { maker, taker } = tradingService.getFeeRates(symbol)

  return {
    makerInput: toFeePercentInput(maker),
    takerInput: toFeePercentInput(taker),
    makerLabel: formatFeePercent(maker, locale),
    takerLabel: formatFeePercent(taker, locale)
  }
}

export function useLiquidationPrice(symbol: SymbolId) {
  return tradingService.getLiquidationPrice(symbol)
}

export function useLiquidationNotices() {
  return tradingService.getLiquidationNotices()
}

export function useOpenOrders() {
  return tradingService.getOpenOrders()
}

export function useSymbolOrders(symbol: SymbolId) {
  const orders = tradingService.getOpenOrders()

  return useMemo(
    () => orders.filter((order) => order.symbol === symbol),
    [orders, symbol]
  )
}

// Newest first by time: catch-up can add older fills after newer ones.
export function useFills() {
  const fills = tradingService.getFills()

  return useMemo(
    () => [...fills].sort((a, b) => b.time - a.time || b.id - a.id),
    [fills]
  )
}

export function useOrderDraft(symbol: SymbolId) {
  return tradingService.getOrderDraft(symbol)
}

export function useMarkPrice(symbol: SymbolId) {
  return marketService.getMarkPrice(symbol)
}

export function useMoneyFormat() {
  const { locale } = useLocale()

  return useMemo(
    () => ({
      formatMoney: (value: number) =>
        formatDecimal(value, MONEY_DECIMALS, locale),
      formatSignedMoney: (value: number) =>
        formatSignedDecimal(value, MONEY_DECIMALS, locale),
      formatCompactMoney: (value: number) => formatCompact(value, locale),
      parseDecimal: parseDecimalInput
    }),
    [locale]
  )
}
