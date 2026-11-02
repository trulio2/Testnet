import { DepositForm, FundsHistory, WalletBalance } from '@/components'
import { useLocale, useTradingActions, useWallet } from '@/modules/services'
import './Wallet.css'

function Wallet() {
  const { t } = useLocale()
  const { currencies } = useWallet()
  const { resetAccount } = useTradingActions()

  const handleReset = () => {
    if (window.confirm(t('pages.wallet.resetConfirm'))) resetAccount()
  }

  return (
    <div className="wallet-page">
      <header className="wallet-header">
        <div>
          <h1>{t('pages.wallet.title')}</h1>
          <p>{t('pages.wallet.description')}</p>
        </div>
        <button type="button" className="wallet-action" onClick={handleReset}>
          {t('pages.wallet.reset')}
        </button>
      </header>
      <div className="wallet-top">
        {currencies.map((currency) => (
          <WalletBalance key={currency} currency={currency} />
        ))}
        <DepositForm />
      </div>
      <FundsHistory />
    </div>
  )
}

export default Wallet
