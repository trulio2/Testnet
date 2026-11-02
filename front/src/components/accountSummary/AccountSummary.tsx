import { Link } from 'react-router-dom'
import {
  useAccountSummary,
  useLocale,
  useMoneyFormat,
  useSymbol
} from '@/modules/services'
import type { SymbolId } from '@/types'

export default function AccountSummary({ symbol }: { symbol: SymbolId }) {
  const { t } = useLocale()
  const { config } = useSymbol(symbol)
  const summary = useAccountSummary(config.quote)
  const { formatMoney, formatSignedMoney } = useMoneyFormat()

  const pnlDirection = summary.unrealizedPnl >= 0 ? 'up' : 'down'

  return (
    <section
      className="account-summary"
      aria-label={t('components.account.title')}
    >
      <h2 className="trade-panel-title">
        {t('components.account.title')} ({config.quote})
      </h2>
      <dl className="account-rows">
        <dt>{t('components.account.wallet')}</dt>
        <dd>{formatMoney(summary.walletBalance)}</dd>
        <dt>{t('components.account.unrealizedPnl')}</dt>
        <dd
          className={summary.unrealizedPnl ? `pnl-${pnlDirection}` : undefined}
        >
          {formatSignedMoney(summary.unrealizedPnl)}
        </dd>
        <dt>{t('components.account.equity')}</dt>
        <dd>{formatMoney(summary.equity)}</dd>
        <dt>{t('components.account.usedMargin')}</dt>
        <dd>{formatMoney(summary.usedMargin)}</dd>
        <dt>{t('components.account.available')}</dt>
        <dd>{formatMoney(summary.availableMargin)}</dd>
      </dl>
      <Link to="/wallet" className="account-link">
        {t('components.account.addFunds')}
      </Link>
    </section>
  )
}
