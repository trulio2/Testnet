import { useMemo } from 'react'
import IoC from '@/modules/ioc'
import {
  type IMarketService,
  type ITradingService,
  type OrderDraft,
  type OrderRequest,
  SERVICES,
  type SymbolId
} from '@/types'
import { formatDecimal, formatSignedDecimal } from '@/utils'
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
  updateOrderDraft: (symbol: SymbolId, changes: Partial<OrderDraft>) =>
    tradingService.updateOrderDraft(symbol, changes)
}

export function useTradingActions() {
  return tradingActions
}

export function useAccountSummary() {
  return tradingService.getAccountSummary()
}

export function usePositions() {
  return tradingService.getPositions()
}

export function usePosition(symbol: SymbolId) {
  return tradingService.getPosition(symbol)
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

export function useFills() {
  return tradingService.getFills()
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
        formatSignedDecimal(value, MONEY_DECIMALS, locale)
    }),
    [locale]
  )
}
