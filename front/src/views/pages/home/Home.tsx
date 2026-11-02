import { Navigate } from 'react-router-dom'
import { OrderBook, PriceChart, RecentTrades } from '@/components'
import { useActiveSymbol, useLocale } from '@/modules/services'
import './Home.css'

function Home() {
  const { t } = useLocale()
  const symbol = useActiveSymbol()

  if (!symbol) return <Navigate to="/" replace />

  return (
    <div className="trade-page">
      <div className="trade-grid">
        <aside className="trade-panel order-panel">
          <h2 className="trade-panel-title">
            {t('pages.home.orderPanelTitle')}
          </h2>
          <p className="trade-empty">{t('pages.home.orderPanelNote')}</p>
        </aside>
        <PriceChart symbol={symbol} />
        <div className="market-panels">
          <OrderBook symbol={symbol} />
          <RecentTrades symbol={symbol} />
        </div>
      </div>
    </div>
  )
}

export default Home
