import {
  useAccountSummary,
  useLocale,
  useTradingActions,
  useMoneyFormat
} from '@/modules/services'

export default function AccountSummary() {
  const { t } = useLocale()
  const summary = useAccountSummary()
  const { formatMoney, formatSignedMoney } = useMoneyFormat()
  const { resetAccount } = useTradingActions()

  const handleReset = () => {
    if (window.confirm(t('components.account.resetConfirm'))) resetAccount()
  }

  const pnlDirection = summary.unrealizedPnl >= 0 ? 'up' : 'down'

  return (
    <section
      className="account-summary"
      aria-label={t('components.account.title')}
    >
      <h2 className="trade-panel-title">
        {t('components.account.title')} (USD)
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
      <button type="button" className="account-reset" onClick={handleReset}>
        {t('components.account.reset')}
      </button>
    </section>
  )
}
