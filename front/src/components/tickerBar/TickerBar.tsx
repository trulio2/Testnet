import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  useConnectionStatus,
  useLastPrice,
  useLocale,
  useSymbol,
  useSymbols,
  useTicker
} from '@/modules/services'
import type { SymbolId } from '@/types'

function SymbolTab({ symbol, active }: { symbol: SymbolId; active: boolean }) {
  const { config, formatPrice } = useSymbol(symbol)
  const lastPrice = useLastPrice(symbol)
  const linkRef = useRef<HTMLAnchorElement>(null)

  // The tabs scroll sideways when they don't fit, so the open one is kept in view.
  useEffect(() => {
    if (active) {
      linkRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [active])

  return (
    <Link
      ref={linkRef}
      to={`/${symbol}`}
      className={`symbol-tab${active ? ' active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <span className="symbol-tab-label">{config.label}</span>
      <span className="symbol-tab-price">
        {lastPrice === undefined ? '—' : formatPrice(lastPrice)}
      </span>
    </Link>
  )
}

export default function TickerBar({ symbol }: { symbol: SymbolId }) {
  const { t } = useLocale()
  const { symbols } = useSymbols()
  const { formatPrice, formatVolume, formatPercent } = useSymbol(symbol)
  const ticker = useTicker(symbol)
  const status = useConnectionStatus(symbol)

  const changeDirection = (ticker?.changePercent ?? 0) >= 0 ? 'up' : 'down'

  return (
    <div className="ticker-bar">
      <nav className="symbol-tabs" aria-label={t('components.ticker.symbols')}>
        {symbols.map(({ id }) => (
          <SymbolTab key={id} symbol={id} active={id === symbol} />
        ))}
      </nav>
      <dl className="ticker-stats">
        <div>
          <dt>{t('components.ticker.change')}</dt>
          <dd
            className={ticker ? `ticker-change-${changeDirection}` : undefined}
          >
            {ticker ? `${formatPercent(ticker.changePercent)}%` : '—'}
          </dd>
        </div>
        <div>
          <dt>{t('components.ticker.high')}</dt>
          <dd>{ticker ? formatPrice(ticker.high) : '—'}</dd>
        </div>
        <div>
          <dt>{t('components.ticker.low')}</dt>
          <dd>{ticker ? formatPrice(ticker.low) : '—'}</dd>
        </div>
        <div>
          <dt>{t('components.ticker.volume')}</dt>
          <dd>{ticker ? formatVolume(ticker.volume) : '—'}</dd>
        </div>
      </dl>
    </div>
  )
}
