import { useCallback, useEffect, useMemo } from 'react'
import { useLocation, useMatch } from 'react-router-dom'
import IoC from '@/modules/ioc'
import {
  type CandleListener,
  type IMarketService,
  SERVICES,
  type SymbolId,
  type Timeframe
} from '@/types'
import {
  CURRENCY_SIGNS,
  DEFAULT_SYMBOL,
  formatCompact,
  formatDecimal,
  formatSignedPercent,
  formatUtcTime
} from '@/utils'
import useLocale from '../locale/useLocale'

const APP_TITLE = 'Testnet'
const PAGE_TITLE_KEYS: Record<string, string> = {
  '/wallet': 'nav.wallet',
  '/changelog': 'nav.changelog'
}

const marketService = IoC.getOrCreateInstance<IMarketService>(SERVICES.MARKET)

export function useSymbols() {
  return { symbols: marketService.getSymbols() }
}

// Null when the current route is not a trading page or names an unknown symbol.
export function useActiveSymbol() {
  const match = useMatch('/:symbol?')

  if (!match) return null

  const { symbol } = match.params

  return symbol ? marketService.resolveSymbol(symbol) : DEFAULT_SYMBOL
}

// Keeps the tab title on the current page, with the live price on a trading page.
// Updates from the trade stream because a hidden tab, where the title matters
// most, stops the animation frames that drive the store.
export function useDocumentTitle(isActive: boolean) {
  const { pathname } = useLocation()
  const { locale, t } = useLocale()
  const symbol = useActiveSymbol()

  useEffect(() => {
    if (!isActive) {
      document.title = APP_TITLE
      return
    }

    if (!symbol) {
      const key = PAGE_TITLE_KEYS[pathname]

      document.title = key ? `${APP_TITLE} - ${t(key)}` : APP_TITLE
      return
    }

    const { label, priceDecimals, quote } = marketService.getSymbol(symbol)

    document.title = label

    return marketService.subscribeLastPrice(symbol, (price) => {
      const formatted = formatDecimal(price, priceDecimals, locale)

      document.title = `${label} - ${CURRENCY_SIGNS[quote]}${formatted}`
    })
  }, [isActive, symbol, pathname, locale, t])
}

export function useSymbol(symbol: SymbolId) {
  const { locale } = useLocale()

  return useMemo(() => {
    const config = marketService.getSymbol(symbol)

    return {
      config,
      formatPrice: (value: number) =>
        formatDecimal(value, config.priceDecimals, locale),
      formatQty: (value: number) =>
        formatDecimal(value, config.qtyDecimals, locale),
      formatVolume: (value: number) => formatCompact(value, locale),
      formatPercent: (value: number) => formatSignedPercent(value, locale),
      formatTime: formatUtcTime
    }
  }, [symbol, locale])
}

export function useConnectionStatus() {
  return marketService.getConnectionStatus()
}

export function useTicker(symbol: SymbolId) {
  return marketService.getTicker(symbol)
}

export function useLastPrice(symbol: SymbolId) {
  return marketService.getLastPrice(symbol)
}

export function useOrderBook(symbol: SymbolId) {
  return marketService.getOrderBook(symbol)
}

export function useRecentTrades(symbol: SymbolId) {
  return marketService.getRecentTrades(symbol)
}

export function useSelectedTimeframe() {
  return {
    timeframe: marketService.getSelectedTimeframe(),
    setTimeframe: (timeframe: Timeframe) =>
      marketService.setSelectedTimeframe(timeframe)
  }
}

export function useCandles(symbol: SymbolId, timeframe: Timeframe) {
  const status = marketService.getCandleStatus(symbol, timeframe)

  const subscribe = useCallback(
    (listener: CandleListener) =>
      marketService.subscribeCandles(symbol, timeframe, listener),
    [symbol, timeframe]
  )
  const loadOlder = useCallback(
    () => marketService.loadOlderCandles(symbol, timeframe),
    [symbol, timeframe]
  )
  const reload = useCallback(
    () => marketService.reloadCandles(symbol, timeframe),
    [symbol, timeframe]
  )

  return {
    status,
    timeframes: marketService.getTimeframes(),
    subscribe,
    loadOlder,
    reload
  }
}
