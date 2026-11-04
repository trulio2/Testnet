import {
  useLocale,
  useMoneyFormat,
  useSpotHolding,
  useSymbol
} from '@/modules/services'
import type { SymbolId } from '@/types'

export default function SpotBalance({ symbol }: { symbol: SymbolId }) {
  const { t } = useLocale()
  const { config, formatPrice, formatQty } = useSymbol(symbol)
  const { formatMoney, formatSignedMoney } = useMoneyFormat()
  const holding = useSpotHolding(symbol)
  const label = (key: string) => t(`components.spotBalance.${key}`)
  const pnl = holding.unrealizedPnl

  return (
    <section
      className="wallet-panel wallet-balance"
      aria-label={t('components.spotBalance.title', { asset: config.base })}
    >
      <header className="wallet-balance-header">
        <h2>{t('components.spotBalance.title', { asset: config.base })}</h2>
        <span>
          {t('components.spotBalance.boughtOn', { symbol: config.label })}
        </span>
      </header>
      <p className="wallet-balance-amount">{formatQty(holding.qty)}</p>
      <dl className="wallet-balance-rows">
        <dt>{label('available')}</dt>
        <dd>{formatQty(holding.availableQty)}</dd>
        <dt>{label('avgCost')}</dt>
        <dd>
          {holding.qty
            ? `${formatPrice(holding.avgCost)} ${config.quote}`
            : '—'}
        </dd>
        <dt>{label('value')}</dt>
        <dd>
          {holding.value === undefined
            ? '—'
            : `${formatMoney(holding.value)} ${config.quote}`}
        </dd>
        <dt>{label('unrealizedPnl')}</dt>
        <dd className={pnl ? (pnl > 0 ? 'pnl-up' : 'pnl-down') : undefined}>
          {formatSignedMoney(pnl)} {config.quote}
        </dd>
      </dl>
    </section>
  )
}
