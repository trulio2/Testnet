import {
  useLastPrice,
  useLocale,
  useOrderBook,
  useSymbol
} from '@/modules/services'
import type { OrderBookLevel, SymbolId } from '@/types'

const VISIBLE_LEVELS = 12

interface DepthRow extends OrderBookLevel {
  total: number
}

function toDepthRows(levels: OrderBookLevel[]): DepthRow[] {
  let total = 0

  return levels.slice(0, VISIBLE_LEVELS).map((level) => {
    total += level.qty

    return { ...level, total }
  })
}

export default function OrderBook({ symbol }: { symbol: SymbolId }) {
  const { t } = useLocale()
  const { formatPrice, formatQty } = useSymbol(symbol)
  const book = useOrderBook(symbol)
  const lastPrice = useLastPrice(symbol)

  const asks = toDepthRows(book?.asks ?? [])
  const bids = toDepthRows(book?.bids ?? [])
  const maxTotal = Math.max(asks.at(-1)?.total ?? 0, bids.at(-1)?.total ?? 0)
  const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : undefined

  const renderRow = (row: DepthRow, side: 'ask' | 'bid') => (
    <div key={row.price} className={`book-row book-row-${side}`}>
      <span
        className="book-depth"
        style={{ width: `${(row.total / maxTotal) * 100}%` }}
      />
      <span className="book-price">{formatPrice(row.price)}</span>
      <span>{formatQty(row.qty)}</span>
      <span>{formatQty(row.total)}</span>
    </div>
  )

  return (
    <section
      className="trade-panel book-panel"
      aria-label={t('components.orderBook.title')}
    >
      <h2 className="trade-panel-title">{t('components.orderBook.title')}</h2>
      <div className="book-columns">
        <span>{t('components.orderBook.price')}</span>
        <span>{t('components.orderBook.size')}</span>
        <span>{t('components.orderBook.total')}</span>
      </div>
      {book ? (
        <>
          <div className="book-side book-side-asks">
            {asks.map((row) => renderRow(row, 'ask'))}
          </div>
          <div className="book-mid">
            <span className="book-last">
              {lastPrice === undefined ? '—' : formatPrice(lastPrice)}
            </span>
            <span>
              {t('components.orderBook.spread')}{' '}
              {spread === undefined ? '—' : formatPrice(spread)}
            </span>
          </div>
          <div className="book-side">
            {bids.map((row) => renderRow(row, 'bid'))}
          </div>
        </>
      ) : (
        <p className="trade-empty">{t('components.connection.connecting')}</p>
      )}
    </section>
  )
}
