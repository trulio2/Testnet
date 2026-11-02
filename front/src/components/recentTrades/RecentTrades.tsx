import { useLocale, useRecentTrades, useSymbol } from '@/modules/services'
import type { SymbolId } from '@/types'

export default function RecentTrades({ symbol }: { symbol: SymbolId }) {
  const { t } = useLocale()
  const { formatPrice, formatQty, formatTime } = useSymbol(symbol)
  const trades = useRecentTrades(symbol)

  return (
    <section
      className="trade-panel trades-panel"
      aria-label={t('components.recentTrades.title')}
    >
      <h2 className="trade-panel-title">
        {t('components.recentTrades.title')}
      </h2>
      <div className="trades-columns">
        <span>{t('components.recentTrades.price')}</span>
        <span>{t('components.recentTrades.size')}</span>
        <span>{t('components.recentTrades.time')}</span>
      </div>
      {trades.length > 0 ? (
        <div className="trades-list">
          {trades.map((trade) => (
            <div
              key={trade.id}
              className={`trades-row trades-row-${trade.side}`}
            >
              <span className="trades-price">
                <span aria-hidden="true">
                  {trade.side === 'buy' ? '▲' : '▼'}
                </span>{' '}
                {formatPrice(trade.price)}
              </span>
              <span>{formatQty(trade.qty)}</span>
              <span>{formatTime(trade.time)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="trade-empty">{t('components.connection.connecting')}</p>
      )}
    </section>
  )
}
