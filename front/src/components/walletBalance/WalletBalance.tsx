import {
  useAccountSummary,
  useLocale,
  useMoneyFormat,
  useSymbols
} from '@/modules/services'
import type { Currency } from '@/types'

export default function WalletBalance({ currency }: { currency: Currency }) {
  const { t } = useLocale()
  const { symbols } = useSymbols()
  const summary = useAccountSummary(currency)
  const { formatMoney, formatSignedMoney } = useMoneyFormat()

  const usedFor = symbols
    .filter((symbol) => symbol.quote === currency)
    .map((symbol) => symbol.label)
    .join(', ')
  const pnl = summary.unrealizedPnl

  return (
    <section className="wallet-panel wallet-balance" aria-label={currency}>
      <header className="wallet-balance-header">
        <h2>{currency}</h2>
        <span>
          {t('components.walletBalance.usedFor', { symbols: usedFor })}
        </span>
      </header>
      <p className="wallet-balance-amount">
        {formatMoney(summary.walletBalance)}
      </p>
      <dl className="wallet-balance-rows">
        <dt>{t('components.account.unrealizedPnl')}</dt>
        <dd className={pnl ? (pnl > 0 ? 'pnl-up' : 'pnl-down') : undefined}>
          {formatSignedMoney(pnl)}
        </dd>
        <dt>{t('components.account.equity')}</dt>
        <dd>{formatMoney(summary.equity)}</dd>
        <dt>{t('components.account.usedMargin')}</dt>
        <dd>{formatMoney(summary.usedMargin)}</dd>
        <dt>{t('components.account.available')}</dt>
        <dd>{formatMoney(summary.availableMargin)}</dd>
      </dl>
    </section>
  )
}
